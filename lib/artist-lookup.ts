// Finds an artist's photo (Deezer) and genres (MusicBrainz). Both are free and need no account.
// Plain functions only (no framework imports) so the matching can be unit-tested with Node.

const UA = "xBkOps/1.0 ( https://www.xbklive.com )"; // MusicBrainz asks every app to identify itself

export type LookupResult = {
  image_url: string | null;
  deezer_id: string | null;
  genres: string[];
  musicbrainz_id: string | null;
  links: ArtistLinks;
  note: string;
};

export const LINK_KINDS = ["spotify", "instagram", "facebook", "tiktok", "youtube", "bandcamp", "website"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export type ArtistLinks = Partial<Record<LinkKind, string>>;
export const LINK_LABEL: Record<LinkKind, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  bandcamp: "Bandcamp",
  website: "Website",
};

// Which kind of link a URL is, by its web address.
export function linkKind(url: string): LinkKind | null {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return null;
  }
  if (host === "open.spotify.com" && /\/artist\//.test(url)) return "spotify";
  if (host === "instagram.com") return "instagram";
  if (host === "facebook.com" || host === "fb.com") return "facebook";
  if (host === "tiktok.com") return "tiktok";
  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") return "youtube";
  if (host.endsWith("bandcamp.com")) return "bandcamp";
  return null;
}

// Same matching rule as the database: case, spacing, "&"/"and", accents and a leading "The" don't matter.
export function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

type DeezerArtist = { id: number; name: string; picture_xl?: string; picture_big?: string; nb_fan?: number };

// Deezer returns a grey placeholder (".../artist//...") when it has no photo.
const realPicture = (url?: string) => (url && !/\/artist\/\//.test(url) ? url : null);

export function pickDeezer(name: string, results: DeezerArtist[]): DeezerArtist | null {
  const k = nameKey(name);
  const exact = results.filter((a) => nameKey(a.name) === k);
  if (!exact.length) return null;
  return exact.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
}

type MbArtist = { id: string; name: string; score?: number; aliases?: { name: string }[] };

export function pickMusicBrainz(name: string, results: MbArtist[]): MbArtist | null {
  const k = nameKey(name);
  const exact = results.filter(
    (a) => nameKey(a.name) === k || (a.aliases ?? []).some((x) => nameKey(x.name) === k),
  );
  if (!exact.length) return null;
  return exact.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

type MbDetail = {
  genres?: { name: string; count: number }[];
  tags?: { name: string; count: number }[];
  relations?: { type: string; url?: { resource: string } }[];
};

const title = (g: string) => g.replace(/\b\w/g, (c) => c.toUpperCase());

export function genresFrom(detail: MbDetail): string[] {
  const list = (detail.genres?.length ? detail.genres : (detail.tags ?? []).filter((t) => t.count > 0)) ?? [];
  return [...list]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((g) => title(g.name));
}

export function linksFrom(detail: MbDetail): ArtistLinks {
  const out: ArtistLinks = {};
  for (const r of detail.relations ?? []) {
    const url = r.url?.resource;
    if (!url) continue;
    const kind = r.type === "official homepage" ? "website" : linkKind(url);
    if (kind && !out[kind]) out[kind] = url;
  }
  return out;
}

// Pull an ID out of a pasted link, or accept the bare ID.
export const deezerIdFrom = (v: string | null | undefined) => (v ?? "").match(/(\d{2,})\s*$/)?.[1] ?? null;
export const mbidFrom = (v: string | null | undefined) =>
  (v ?? "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Wikidata (free, no key): Spotify, Instagram, Facebook, TikTok, YouTube and website
// for artists notable enough to have an entry.
// ---------------------------------------------------------------------------

type WdClaims = Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
type WdEntity = { id: string; labels?: Record<string, { value: string }>; claims?: WdClaims };

const WD_LINKS: [string, LinkKind, (v: string) => string][] = [
  ["P1902", "spotify", (v) => `https://open.spotify.com/artist/${v}`],
  ["P2003", "instagram", (v) => `https://www.instagram.com/${v}/`],
  ["P2013", "facebook", (v) => `https://www.facebook.com/${v}`],
  ["P7085", "tiktok", (v) => `https://www.tiktok.com/@${v}`],
  ["P2397", "youtube", (v) => `https://www.youtube.com/channel/${v}`],
  ["P856", "website", (v) => v],
];

const claim = (e: WdEntity, p: string): string | null => {
  const v = e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" ? v : null;
};

export function wikidataLinks(e: WdEntity): ArtistLinks {
  const out: ArtistLinks = {};
  for (const [p, kind, url] of WD_LINKS) {
    const v = claim(e, p);
    if (v) out[kind] = url(v);
  }
  return out;
}

// An entry counts as this artist only if it has the same name and is a music artist
// (it carries a Spotify or MusicBrainz artist ID).
export function pickWikidata(name: string, entities: WdEntity[], mbid?: string | null): WdEntity | null {
  if (mbid) {
    const byMb = entities.find((e) => claim(e, "P434") === mbid);
    if (byMb) return byMb;
  }
  const k = nameKey(name);
  return (
    entities.find(
      (e) =>
        Object.values(e.labels ?? {}).some((l) => nameKey(l.value) === k) && (claim(e, "P1902") || claim(e, "P434")),
    ) ?? null
  );
}

async function wikidataLookup(name: string, mbid: string | null): Promise<ArtistLinks | null> {
  const api = "https://www.wikidata.org/w/api.php";
  let ids: string[] = [];
  if (mbid) {
    const r = await getJson<{ query?: { search?: { title: string }[] } }>(
      `${api}?action=query&list=search&srsearch=${encodeURIComponent(`haswbstatement:P434=${mbid}`)}&format=json&origin=*`,
    );
    ids = (r.query?.search ?? []).map((x) => x.title);
  }
  if (!ids.length) {
    const r = await getJson<{ search?: { id: string }[] }>(
      `${api}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=7&format=json&origin=*`,
    );
    ids = (r.search ?? []).map((x) => x.id);
  }
  if (!ids.length) return null;
  const r = await getJson<{ entities?: Record<string, WdEntity> }>(
    `${api}?action=wbgetentities&ids=${ids.slice(0, 7).join("|")}&props=labels|claims&languages=en&format=json&origin=*`,
  );
  const e = pickWikidata(name, Object.values(r.entities ?? {}), mbid);
  return e ? wikidataLinks(e) : null;
}

// ---------------------------------------------------------------------------
// Spotify search (free; needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET):
// the Spotify page and photo for almost any artist on Spotify, local acts included.
// ---------------------------------------------------------------------------

type SpArtist = { name: string; external_urls?: { spotify?: string }; images?: { url: string; width?: number }[]; genres?: string[] };

let spotifyToken: { value: string; until: number } | null = null;

async function spotifyAuth(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (spotifyToken && spotifyToken.until > Date.now()) return spotifyToken.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Spotify sign-in answered ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  spotifyToken = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

export function pickSpotify(name: string, results: SpArtist[]): { artist: SpArtist; shared: boolean } | null {
  const k = nameKey(name);
  const exact = results.filter((a) => nameKey(a.name) === k);
  return exact.length ? { artist: exact[0], shared: exact.length > 1 } : null; // Spotify lists the likeliest first
}

async function spotifyLookup(name: string): Promise<{ url: string; image: string | null; genres: string[]; shared: boolean } | null | "off"> {
  const token = await spotifyAuth();
  if (!token) return "off";
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=artist&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Spotify answered ${res.status}`);
  const j = (await res.json()) as { artists?: { items?: SpArtist[] } };
  const hit = pickSpotify(name, j.artists?.items ?? []);
  if (!hit?.artist.external_urls?.spotify) return null;
  const imgs = [...(hit.artist.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return { url: hit.artist.external_urls.spotify, image: imgs[0]?.url ?? null, genres: hit.artist.genres ?? [], shared: hit.shared };
}

// ---------------------------------------------------------------------------
// Web search (needs BRAVE_SEARCH_API_KEY): finds Instagram, Facebook and TikTok pages
// that aren't listed anywhere else, which is most local and smaller artists.
// ---------------------------------------------------------------------------

type WebResult = { url: string; title?: string };

// A profile page (not a post, photo or search page) whose title carries the artist's name.
export function pickSocial(name: string, results: WebResult[]): ArtistLinks {
  const k = nameKey(name);
  const out: ArtistLinks = {};
  for (const r of results) {
    const kind = linkKind(r.url);
    if (!kind || !["instagram", "facebook", "tiktok"].includes(kind) || out[kind]) continue;
    let path = "";
    try {
      path = new URL(r.url).pathname.replace(/\/+$/, "");
    } catch {
      continue;
    }
    const parts = path.split("/").filter(Boolean);
    const profile =
      kind === "tiktok"
        ? parts.length === 1 && parts[0].startsWith("@")
        : parts.length === 1 && !/^(p|reel|reels|explore|watch|events|groups|search|share|people|pages|stories|hashtag)$/i.test(parts[0]);
    const handle = nameKey(parts[0] ?? "").replace(/ /g, "");
    const titled = nameKey(r.title ?? "").includes(k) || handle.includes(k.replace(/ /g, ""));
    if (profile && titled) out[kind] = r.url;
  }
  return out;
}

async function webSocialLookup(name: string): Promise<ArtistLinks | "off"> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return "off";
  const q = `"${name.replace(/"/g, "")}" music (instagram OR facebook OR tiktok)`;
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`web search answered ${res.status}`);
  const j = (await res.json()) as { web?: { results?: WebResult[] } };
  return pickSocial(name, j.web?.results ?? []);
}

// ---------------------------------------------------------------------------
// Deezer genres (free, no key): Deezer tags every album with a genre. The artist's
// most common album genre covers most artists who release music, local acts included.
// ---------------------------------------------------------------------------

type DzAlbum = { genre_id?: number; record_type?: string };

let deezerGenres: Map<number, string> | null = null;

async function deezerGenreNames(): Promise<Map<number, string>> {
  if (deezerGenres) return deezerGenres;
  const r = await getJson<{ data?: { id: number; name: string }[] }>("https://api.deezer.com/genre");
  deezerGenres = new Map((r.data ?? []).filter((g) => g.id > 0).map((g) => [g.id, g.name]));
  return deezerGenres;
}

// Most common genres across the artist's releases (ignoring "All" and untagged ones), top 2.
export function genresFromAlbums(albums: DzAlbum[], names: Map<number, string>): string[] {
  const tally = new Map<number, number>();
  for (const a of albums) {
    const id = a.genre_id ?? -1;
    if (id > 0 && names.has(id)) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([id]) => names.get(id)!);
}

async function deezerGenreLookup(deezerId: string): Promise<string[]> {
  const [names, albums] = await Promise.all([
    deezerGenreNames(),
    getJson<{ data?: DzAlbum[] }>(`https://api.deezer.com/artist/${encodeURIComponent(deezerId)}/albums?limit=25`),
  ]);
  return genresFromAlbums(albums.data ?? [], names);
}

// Look an artist up. Pass known IDs (from a pasted link) to skip the name search.
// existing = links already saved, so paid web searches only run for what's still missing.
export async function lookupArtist(
  name: string,
  known: { deezerId?: string | null; musicbrainzId?: string | null; existing?: ArtistLinks } = {},
): Promise<LookupResult> {
  const out: LookupResult = { image_url: null, deezer_id: null, genres: [], musicbrainz_id: null, links: {}, note: "" };
  const notes: string[] = [];

  try {
    let dz: DeezerArtist | null = null;
    if (known.deezerId) {
      dz = await getJson<DeezerArtist>(`https://api.deezer.com/artist/${encodeURIComponent(known.deezerId)}`);
      if (!dz?.id) dz = null;
    } else {
      const r = await getJson<{ data?: DeezerArtist[] }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`);
      dz = pickDeezer(name, r.data ?? []);
    }
    if (dz) {
      out.deezer_id = String(dz.id);
      out.image_url = realPicture(dz.picture_xl) ?? realPicture(dz.picture_big);
      if (!out.image_url) notes.push("Deezer has no photo");
    } else notes.push("No photo match on Deezer");
  } catch (e) {
    notes.push(`Photo lookup failed (${(e as Error).message})`);
  }

  try {
    let mbid = known.musicbrainzId ?? null;
    if (!mbid) {
      const q = `artist:"${name.replace(/"/g, "")}"`;
      const r = await getJson<{ artists?: MbArtist[] }>(
        `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
      );
      mbid = pickMusicBrainz(name, r.artists ?? [])?.id ?? null;
      await sleep(1100); // MusicBrainz allows one request a second
    }
    if (mbid) {
      const d = await getJson<MbDetail>(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+tags+url-rels&fmt=json`);
      out.musicbrainz_id = mbid;
      out.genres = genresFrom(d);
      out.links = linksFrom(d);
      if (!out.genres.length) notes.push("No genres listed on MusicBrainz");
      await sleep(1100);
    } else notes.push("No genre match on MusicBrainz");
  } catch (e) {
    notes.push(`Genre lookup failed (${(e as Error).message})`);
  }

  try {
    const wd = await wikidataLookup(name, out.musicbrainz_id);
    if (wd) out.links = { ...wd, ...out.links };
  } catch (e) {
    notes.push(`Wikidata lookup failed (${(e as Error).message})`);
  }

  if (!out.links.spotify) {

    try {
      const sp = await spotifyLookup(name);
      if (sp && sp !== "off") {
        out.links.spotify = sp.url;
        if (!out.image_url && sp.image) out.image_url = sp.image;
        if (!out.genres.length && sp.genres.length) out.genres = sp.genres.slice(0, 4).map(title);
        if (sp.shared) notes.push("Several Spotify artists share this name: check the Spotify link");
      } else if (sp === null) notes.push("Not found on Spotify");
    } catch (e) {
      notes.push(`Spotify lookup failed (${(e as Error).message})`);
    }
  }

  if (!out.genres.length && out.deezer_id) {
    try {
      out.genres = await deezerGenreLookup(out.deezer_id);
      if (out.genres.length) {
        const i = notes.findIndex((n) => n.startsWith("No genre") || n.startsWith("No genres"));
        if (i >= 0) notes.splice(i, 1);
      }
    } catch (e) {
      notes.push(`Deezer genre lookup failed (${(e as Error).message})`);
    }
  }
  if (!out.genres.length) notes.push("No genres found");

  const have = { ...known.existing, ...out.links };
  if (!have.instagram || !have.facebook) {
    try {
      const web = await webSocialLookup(name);
      if (web !== "off") {
        const found = Object.keys(web).filter((k) => !have[k as LinkKind]);
        out.links = { ...web, ...out.links };
        if (found.length) notes.push(`${found.map((k) => LINK_LABEL[k as LinkKind]).join(" and ")} found by web search: worth a quick check`);
      }
    } catch (e) {
      notes.push(`Web search failed (${(e as Error).message})`);
    }
  }

  const missing = (["spotify", "instagram", "facebook"] as LinkKind[]).filter((k) => !out.links[k] && !known.existing?.[k]);
  if (missing.length) notes.push(`No ${missing.map((k) => LINK_LABEL[k]).join(", ")} found`);
  out.note = notes.join(" · ") || "Found photo, genres and links";
  return out;
}
