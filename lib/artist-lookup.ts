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

// Look an artist up. Pass known IDs (from a pasted link) to skip the name search.
export async function lookupArtist(
  name: string,
  known: { deezerId?: string | null; musicbrainzId?: string | null } = {},
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

  out.note = notes.join(" · ") || "Found photo, genres and links";
  return out;
}
