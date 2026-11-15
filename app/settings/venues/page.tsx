import Link from "next/link";
import Flash from "@/components/Flash";
import { deleteVenue, saveVenue, syncEventsNow } from "@/lib/actions";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { splitWords } from "@/lib/sync-events";
import { readVenue, type VenueEvent } from "@/lib/venue-reader";

type Venue = {
  id: string;
  name: string;
  url: string;
  ignore_words: string;
  active: boolean;
  last_checked: string | null;
  last_found: number | null;
  last_method: string | null;
  last_error: string | null;
};

type Search = Promise<{ test?: string; ok?: string; error?: string }>;

// Venues whose own events pages are read every morning and added to the calendar as blue notes.
export default async function VenuesPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("watched_venues").select("*").order("name");
  const venues = (data ?? []) as Venue[];

  // "Test" reads one venue's page right now and shows what it finds (nothing is saved).
  let test: { venue: Venue; events: VenueEvent[]; skipped: number; method: string; error?: string } | null = null;
  const tv = venues.find((v) => v.id === sp.test);
  if (tv) {
    try {
      const r = await readVenue(tv.url);
      const words = splitWords(tv.ignore_words);
      const kept = r.events.filter((e) => !words.some((w) => e.title.toLowerCase().includes(w)));
      test = { venue: tv, events: kept, skipped: r.events.length - kept.length, method: r.method };
    } catch (e) {
      test = { venue: tv, events: [], skipped: 0, method: "", error: (e as Error).message };
    }
  }

  return (
    <>
      <div className="day-head">
        <h1>Venues to watch</h1>
        <span className="spacer" />
        {staff.canBook && (
          <form action={syncEventsNow}>
            <input type="hidden" name="returnTo" value="/settings/venues" />
            <button className="primary">Sync now</button>
          </form>
        )}
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Every morning the app reads each venue’s events page and adds upcoming shows to the calendar as blue ♪ notes. Use{" "}
        <strong>Test</strong> to see what it finds on a page; nothing is saved by a test.
      </p>
      <Flash ok={sp.ok} error={sp.error ?? (error ? "Venues aren't set up yet. Run 0007_watched_venues.sql in Supabase." : undefined)} />

      {test && (
        <div className={`panel test-result ${test.events.length ? "good" : "bad"}`}>
          <div className="col-head">
            <h2>
              Test: {test.venue.name} — {test.error ? "couldn’t read the page" : `${test.events.length} upcoming event${test.events.length === 1 ? "" : "s"}`}
            </h2>
            <Link href="/settings/venues">Close</Link>
          </div>
          {test.error ? (
            <div>
              {test.error}. Check the link opens in your browser, or try the venue’s ticketing page instead.
            </div>
          ) : test.events.length === 0 ? (
            <div>
              Nothing readable on this page ({test.method}). Try a different page: the venue’s “Events” or “Calendar”
              page, its calendar feed (a link ending in .ics), or its ticketing page.
            </div>
          ) : (
            <>
              <div className="muted small">
                Read using: {test.method}
                {test.skipped > 0 && ` · ${test.skipped} skipped by your skip words`}
              </div>
              <table className="list">
                <tbody>
                  {test.events.slice(0, 12).map((e) => (
                    <tr key={e.uid}>
                      <td style={{ whiteSpace: "nowrap", width: "1%" }}>{fmtDate(e.date)}</td>
                      <td>{e.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {test.events.length > 12 && <div className="muted small">…and {test.events.length - 12} more</div>}
            </>
          )}
        </div>
      )}

      <div className="panel">
        <div className="venue-row venue-head">
          <span>Venue</span>
          <span>Events page</span>
          <span>Skip events containing</span>
          <span>Last check</span>
          <span />
        </div>
        <table className="list venues">
          <tbody>
            {venues.map((v) => (
              <tr key={v.id} className={v.active ? "" : "inactive"}>
                <td colSpan={5}>
                  <form action={saveVenue} className="venue-row">
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="returnTo" value="/settings/venues" />
                    <input name="name" defaultValue={v.name} aria-label="Venue name" disabled={!staff.canBook} />
                    <input name="url" defaultValue={v.url} aria-label="Events page link" disabled={!staff.canBook} />
                    <input
                      name="ignore_words"
                      defaultValue={v.ignore_words}
                      placeholder="e.g. parking, vs."
                      aria-label="Skip events containing"
                      disabled={!staff.canBook}
                    />
                    <span className="small status">
                      {v.last_checked ? (
                        v.last_error ? (
                          <span className="neg">Couldn’t read · {fmtDateTime(v.last_checked)}</span>
                        ) : (
                          <>
                            {v.last_found ?? 0} events · {fmtDateTime(v.last_checked)}
                          </>
                        )
                      ) : (
                        <span className="muted">Not checked yet</span>
                      )}
                    </span>
                    <span className="venue-actions">
                      <Link className="button-link" href={`/venues?test=${v.id}`}>
                        Test
                      </Link>
                      {staff.canBook && (
                        <>
                          <label className="small inline-check">
                            <input type="checkbox" name="active" value="1" defaultChecked={v.active} /> On
                          </label>
                          <input type="hidden" name="active" value="0" />
                          <button>Save</button>
                        </>
                      )}
                    </span>
                  </form>
                  {staff.canBook && (
                    <form action={deleteVenue} className="venue-delete">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="returnTo" value="/settings/venues" />
                      <button className="link-danger">Remove {v.name}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {staff.canBook && (
          <form action={saveVenue} className="venue-row add">
            <input type="hidden" name="returnTo" value="/settings/venues" />
            <input name="name" placeholder="Venue name" required aria-label="New venue name" />
            <input name="url" placeholder="Events page or calendar link" required aria-label="New venue link" />
            <input name="ignore_words" placeholder="Skip events containing (optional)" aria-label="Skip words" />
            <span />
            <span className="venue-actions">
              <button className="primary">Add venue</button>
            </span>
          </form>
        )}
      </div>

      <div className="muted small">
        Tips: if a venue shows 0 events, try its ticketing page (AXS, Etix, Eventbrite, etc.) or a calendar feed link
        ending in .ics. Skip words are separated by commas and catch things like parking passes or sports.
      </div>
    </>
  );
}
