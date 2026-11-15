import Link from "next/link";
import { notFound } from "next/navigation";
import ArtistLinks from "@/components/ArtistLinks";
import ArtistPhoto from "@/components/ArtistPhoto";
import Flash from "@/components/Flash";
import { lookupArtistAgain, mergeArtists, saveArtist } from "@/lib/actions";
import { LINK_KINDS, LINK_LABEL } from "@/lib/artist-lookup";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { ROOM_FULL } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, type Artist, type Hold } from "@/lib/types";

// Looking an artist up can take several seconds.
export const maxDuration = 60;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

const STATUS: Record<string, string> = { hold: "Hold", offer_out: "Offer out", confirmed: "Confirmed", released: "Released" };

export default async function ArtistPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("artists").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as Artist;
  const here = `/artists/${a.id}`;
  const { data: holdRows } = await supabase
    .from("holds")
    .select("*")
    .eq("artist_id", a.id)
    .order("date", { ascending: false })
    .limit(200);
  const holds = (holdRows ?? []) as Hold[];
  const { data: others } = staff.canBook
    ? await supabase.from("artists").select("id,name").neq("id", a.id).order("name").limit(2000)
    : { data: [] };
  const can = staff.canBook;

  return (
    <>
      <div className="artist-head">
        <ArtistPhoto name={a.name} url={a.image_url} size={120} />
        <div>
          <div className="muted small">
            <Link href="/artists">Artists</Link>
          </div>
          <h1 style={{ margin: "2px 0 4px" }}>{a.name}</h1>
          {a.genres.length > 0 && (
            <div className="genre-chips">
              {a.genres.map((g) => (
                <Link key={g} href={`/artists?genre=${encodeURIComponent(g)}`}>
                  {g}
                </Link>
              ))}
            </div>
          )}
          <ArtistLinks links={a.links} />
          {(a.agent_name || a.agent_email) && (
            <div className="muted small" style={{ marginTop: 6 }}>
              Agent: {[a.agent_name, a.agent_company].filter(Boolean).join(", ")}
              {a.agent_email && (
                <>
                  {" · "}
                  <a href={`mailto:${a.agent_email}`}>{a.agent_email}</a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="artist-cols">
        <section className="panel">
          <h2>Details</h2>
          <form action={saveArtist} className="stack-form">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="returnTo" value={here} />
            <fieldset disabled={!can}>
              <label>
                Name (standard spelling)
                <input name="name" defaultValue={a.name} required />
              </label>
              <label>
                Other spellings <span className="muted small">(one per line; these all find this artist)</span>
                <textarea name="aliases" rows={2} defaultValue={a.aliases.join("\n")} />
              </label>
              <label>
                Genres <span className="muted small">(one per line)</span>
                <textarea name="genres" rows={2} defaultValue={a.genres.join("\n")} />
              </label>
              <label>
                Photo link
                <input name="image_url" defaultValue={a.image_url ?? ""} placeholder="https://…" />
              </label>
              <div className="form-grid">
                {LINK_KINDS.map((k) => (
                  <label key={k}>
                    {LINK_LABEL[k]}
                    <input name={`link_${k}`} defaultValue={a.links?.[k] ?? ""} placeholder="https://…" />
                  </label>
                ))}
              </div>
              <div className="form-grid">
                <label>
                  Agent
                  <input name="agent_name" defaultValue={a.agent_name ?? ""} />
                </label>
                <label>
                  Agency
                  <input name="agent_company" defaultValue={a.agent_company ?? ""} />
                </label>
                <label className="span2">
                  Agent email
                  <input name="agent_email" type="email" defaultValue={a.agent_email ?? ""} />
                </label>
              </div>
              <label>
                Notes
                <textarea name="notes" rows={3} defaultValue={a.notes ?? ""} />
              </label>
              {can && <button className="primary">Save artist</button>}
            </fieldset>
          </form>
          <div className="muted small" style={{ marginTop: 6 }}>
            Changing the name updates it on every hold, and the old name is kept as another spelling. The agent here is
            filled in on new holds for this artist.
          </div>
        </section>

        <div>
          <section className="panel">
            <h2>Shows and holds</h2>
            {holds.length === 0 ? (
              <div className="muted">None yet.</div>
            ) : (
              <table className="list">
                <tbody>
                  {holds.map((h) => (
                    <tr key={h.id} className={h.status === "released" ? "inactive" : ""}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/day/${h.date}#hold-${h.id}`}>{fmtDate(h.date)}</Link>
                      </td>
                      <td>{ROOM_FULL[h.room_id] ?? h.room_id}</td>
                      <td className="small">
                        {h.status === "confirmed" || h.status === "released" ? STATUS[h.status] : `H${h.rank} · ${STATUS[h.status]}`}
                        {h.kind !== "show" && ` · ${KIND_LABEL[h.kind]}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {can && (
            <section className="panel">
              <h2>Photo, genres and links</h2>
              <div className="muted small">
                {a.looked_up_at ? `Last looked up ${fmtDateTime(a.looked_up_at)}: ${a.lookup_note ?? ""}` : "Not looked up yet."}
              </div>
              <form action={lookupArtistAgain} className="stack-form" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="returnTo" value={here} />
                <label>
                  Wrong artist or nothing found? Paste their Deezer page <span className="muted small">(optional)</span>
                  <input name="deezer" placeholder="https://www.deezer.com/artist/…" defaultValue={a.deezer_id ? `https://www.deezer.com/artist/${a.deezer_id}` : ""} />
                </label>
                <label>
                  …and/or their MusicBrainz page <span className="muted small">(optional)</span>
                  <input name="musicbrainz" placeholder="https://musicbrainz.org/artist/…" defaultValue={a.musicbrainz_id ? `https://musicbrainz.org/artist/${a.musicbrainz_id}` : ""} />
                </label>
                <label className="inline-check">
                  <input type="checkbox" name="replace" value="1" /> Replace the current photo, genres and links
                </label>
                <button>Look up again</button>
              </form>
            </section>
          )}

          {can && (others ?? []).length > 0 && (
            <section className="panel">
              <h2>Merge a duplicate</h2>
              <div className="muted small">
                If the same artist was entered twice (a typo, say), merge the other one into {a.name}. Its holds move here and
                its name becomes another spelling.
              </div>
              <form action={mergeArtists} className="inline-form" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="returnTo" value={here} />
                <select name="merge_id" defaultValue="" required>
                  <option value="" disabled>
                    Choose the duplicate…
                  </option>
                  {((others ?? []) as { id: string; name: string }[]).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button>Merge into {a.name}</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
