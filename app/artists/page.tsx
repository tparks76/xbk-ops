import Link from "next/link";
import ArtistLinks from "@/components/ArtistLinks";
import ArtistPhoto from "@/components/ArtistPhoto";
import Flash from "@/components/Flash";
import { lookupMissingArtists } from "@/lib/actions";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/types";
import { lookupCounts } from "@/lib/artist-data";

// Looking artists up can take a while (a few seconds each).
export const maxDuration = 60;

type Search = Promise<{ q?: string; genre?: string; ok?: string; error?: string }>;

export default async function ArtistsPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const genre = (sp.genre ?? "").trim();
  const supabase = await createClient();

  let query = supabase.from("artists").select("*").order("name").limit(500);
  for (const w of q.replace(/[%_\\*,(){}"]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8)) {
    query = query.ilike("name", `%${w}%`);
  }
  if (genre) query = query.contains("genres", [genre]);
  const { data, error } = await query;
  const artists = (data ?? []) as Artist[];

  // How many shows each artist has on the books (holds and confirmed, not released).
  const counts = new Map<string, number>();
  if (artists.length) {
    const { data: rows } = await supabase
      .from("holds")
      .select("artist_id")
      .in("artist_id", artists.map((a) => a.id))
      .neq("status", "released");
    for (const r of (rows ?? []) as { artist_id: string }[]) counts.set(r.artist_id, (counts.get(r.artist_id) ?? 0) + 1);
  }
  const { data: all } = await supabase.from("artists").select("genres");
  const genres = [...new Set(((all ?? []) as { genres: string[] }[]).flatMap((r) => r.genres))].sort();
  const counts2 = staff.canBook && !error ? await lookupCounts() : { never: 0, missing: 0 };
  const href = (g: string) => `/artists?${new URLSearchParams({ ...(q ? { q } : {}), ...(g ? { genre: g } : {}) })}`;

  return (
    <>
      <div className="day-head">
        <h1>Artists</h1>
        <form className="offer-search" action="/artists">
          <input name="q" type="search" placeholder="Search artists" defaultValue={q} aria-label="Search artists" />
          {genre && <input type="hidden" name="genre" value={genre} />}
          <button>Search</button>
          {(q || genre) && <Link href="/artists">Clear</Link>}
        </form>
        <span className="spacer" />
        {staff.canBook && counts2.never > 0 && (
          <form action={lookupMissingArtists}>
            <input type="hidden" name="returnTo" value="/artists" />
            <button>Look up {counts2.never} new artist{counts2.never > 1 ? "s" : ""}</button>
          </form>
        )}
        {staff.canBook && counts2.never === 0 && counts2.missing > 0 && (
          <form action={lookupMissingArtists}>
            <input type="hidden" name="returnTo" value="/artists" />
            <input type="hidden" name="missing" value="1" />
            <button>Find missing links ({counts2.missing})</button>
          </form>
        )}
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Every show and co-pro hold is linked to an artist here, so names are spelled the same everywhere. Photos, genres and
        Spotify / Instagram / Facebook links are found automatically for new artists, and artists still missing links are
        tried again each month.
      </p>
      <Flash ok={sp.ok} error={sp.error ?? (error ? "Artists aren't set up yet. Run 0012_artists.sql in Supabase." : undefined)} />
      {genres.length > 0 && (
        <div className="genre-filter">
          <Link href={href("")} className={genre ? "" : "on"}>
            All
          </Link>
          {genres.map((g) => (
            <Link key={g} href={href(g)} className={g === genre ? "on" : ""}>
              {g}
            </Link>
          ))}
        </div>
      )}
      <div className="panel">
        {artists.length === 0 ? (
          <div className="muted">
            {q || genre ? "No artists match." : "No artists yet. They’re added automatically when you place a show hold."}
          </div>
        ) : (
          <table className="list artists">
            <tbody>
              {artists.map((a) => (
                <tr key={a.id}>
                  <td style={{ width: 48 }}>
                    <Link href={`/artists/${a.id}`}>
                      <ArtistPhoto name={a.name} url={a.image_url} size={40} />
                    </Link>
                  </td>
                  <td>
                    <Link href={`/artists/${a.id}`}>
                      <strong>{a.name}</strong>
                    </Link>
                    {a.aliases.length > 0 && <div className="muted small">also: {a.aliases.join(", ")}</div>}
                  </td>
                  <td className="small">{a.genres.join(", ") || <span className="muted">—</span>}</td>
                  <td>
                    <ArtistLinks links={a.links} small />
                  </td>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                    {counts.get(a.id) ?? 0} on the calendar
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
