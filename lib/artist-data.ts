import { lookupArtist } from "@/lib/artist-lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Artist } from "@/lib/types";

// Fill in photos, genres and links for artists. By default only blanks are filled, so
// anything typed in by hand stays. replace = true overwrites them (after a wrong match).
export async function runArtistLookups(opts: { ids?: string[]; limit?: number; replace?: boolean } = {}) {
  const db = createAdminClient();
  let query = db.from("artists").select("*");
  query = opts.ids?.length ? query.in("id", opts.ids) : query.is("looked_up_at", null).order("created_at");
  const { data, error } = await query.limit(opts.limit ?? 10);
  if (error) return { done: 0, error: error.message };

  let done = 0;
  for (const a of (data ?? []) as Artist[]) {
    const r = await lookupArtist(a.name, { deezerId: a.deezer_id, musicbrainzId: a.musicbrainz_id });
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
  return { done };
}
