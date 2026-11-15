import { lookupArtist } from "@/lib/artist-lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Artist } from "@/lib/types";

const KEY_LINKS = ["spotify", "instagram", "facebook"];
const missingLinks = (a: Pick<Artist, "links">) => KEY_LINKS.some((k) => !a.links?.[k]);
const missingGenres = (a: Pick<Artist, "genres">) => !a.genres?.length;
const incomplete = (a: Pick<Artist, "links" | "genres">) => missingLinks(a) || missingGenres(a);
const DAY = 864e5;

// Fill in photos, genres and links for artists. By default only blanks are filled, so
// anything typed in by hand stays. replace = true overwrites them (after a wrong match).
//   ids: these artists
//   missing "links": artists still missing a Spotify, Instagram or Facebook link (oldest lookup first)
//   missing "genres": artists with no genres
//   default: artists never looked up, then ones missing links or genres not tried for 30 days
export async function runArtistLookups(opts: { ids?: string[]; limit?: number; replace?: boolean; missing?: "links" | "genres" } = {}) {
  const db = createAdminClient();
  const limit = opts.limit ?? 8;
  let list: Artist[] = [];

  if (opts.ids?.length) {
    const { data, error } = await db.from("artists").select("*").in("id", opts.ids);
    if (error) return { done: 0, error: error.message };
    list = (data ?? []) as Artist[];
  } else {
    const { data, error } = await db.from("artists").select("*").order("looked_up_at", { ascending: true, nullsFirst: true }).limit(3000);
    if (error) return { done: 0, error: error.message };
    const all = (data ?? []) as Artist[];
    const now = Date.now();
    list = all.filter((a) =>
      opts.missing === "links"
        ? missingLinks(a)
        : opts.missing === "genres"
          ? missingGenres(a)
          : !a.looked_up_at || (incomplete(a) && now - Date.parse(a.looked_up_at) > 30 * DAY),
    );
  }

  let done = 0;
  for (const a of list.slice(0, limit)) {
    const r = await lookupArtist(a.name, { deezerId: a.deezer_id, musicbrainzId: a.musicbrainz_id, existing: a.links });
    const rep = !!opts.replace;
    await db
      .from("artists")
      .update({
        image_url: rep ? (r.image_url ?? a.image_url) : (a.image_url ?? r.image_url),
        deezer_id: r.deezer_id ?? a.deezer_id,
        musicbrainz_id: r.musicbrainz_id ?? a.musicbrainz_id,
        genres: rep && r.genres.length ? r.genres : a.genres.length ? a.genres : r.genres,
        links: rep ? { ...a.links, ...r.links } : { ...r.links, ...a.links },
        looked_up_at: new Date().toISOString(),
        lookup_note: r.note,
      })
      .eq("id", a.id);
    done++;
  }
  return { done, left: Math.max(0, list.length - done) };
}

// For the Artists page: how many still need a first lookup, and how many are missing links.
export async function lookupCounts() {
  const db = createAdminClient();
  const { data } = await db.from("artists").select("links,genres,looked_up_at").limit(3000);
  const rows = (data ?? []) as Pick<Artist, "links" | "genres" | "looked_up_at">[];
  return {
    never: rows.filter((r) => !r.looked_up_at).length,
    missing: rows.filter(missingLinks).length,
    noGenres: rows.filter((r) => r.looked_up_at && missingGenres(r)).length,
  };
}
