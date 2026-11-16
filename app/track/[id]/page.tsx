import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import SalesChart from "@/components/SalesChart";
import { addTicketCount, deleteTicketCount, importSalesNow, linkEventimEvent } from "@/lib/actions";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { eventimEvents, eventimReady, type EventimEvent } from "@/lib/eventim";
import { money, normalizeTerms } from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_TEXT, track, type Count, type TierCount } from "@/lib/track";
import type { Hold } from "@/lib/types";

export const maxDuration = 60;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function TrackShowPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("holds").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const h = data as Hold & { eventim_event_id?: string | null };
  const here = `/track/${h.id}`;
  const today = todayISO();

  const { data: offers } = await supabase
    .from("offers")
    .select("id,terms,title")
    .contains("hold_ids", [h.id])
    .order("updated_at", { ascending: false })
    .limit(1);
  const offer = (offers ?? [])[0] as { id: string; terms: unknown } | undefined;
  const t = offer ? normalizeTerms(offer.terms) : null;
  const { data: countRows } = await supabase
    .from("ticket_counts")
    .select("*")
    .eq("hold_id", h.id)
    .order("counted_at", { ascending: false })
    .limit(200);
  const counts = (countRows ?? []) as (Count & { id: string; note: string | null; created_by: string | null })[];
  const tr = t ? track(t, counts, h.date, today) : null;
  const latest = counts[0];
  const latestTier = (name: string) => (latest?.tiers as TierCount[] | undefined)?.find((x) => x.name === name)?.sold;

  // Eventim events near this date, to link the show.
  let events: EventimEvent[] = [];
  let eventimError = "";
  if (eventimReady() && staff.canBook) {
    try {
      const all = await eventimEvents();
      const near = all.filter((e) => e.date && Math.abs(Date.parse(e.date) - Date.parse(h.date)) <= 2 * 864e5);
      near.sort((a, b) => Number(b.date === h.date) - Number(a.date === h.date));
      events = near.length ? near : all.slice(0, 50);
    } catch (e) {
      eventimError = (e as Error).message;
    }
  }

  return (
    <>
      <div className="day-head">
        <div>
          <div className="muted small">
            <Link href="/track">Track Shows</Link>
          </div>
          <h1 style={{ margin: "2px 0" }}>{h.title}</h1>
          <div className="muted">
            {fmtDate(h.date, { weekday: "long", month: "long" })} · {ROOM_FULL[h.room_id] ?? h.room_id}
            {tr && ` · ${tr.daysLeft > 0 ? `${tr.daysLeft} days to go` : tr.daysLeft === 0 ? "Today" : "Played"}`}
          </div>
        </div>
        <span className="spacer" />
        {offer && (
          <Link className="button-link" href={`/offers/${offer.id}`}>
            Offer
          </Link>
        )}
        <Link className="button-link" href={`/day/${h.date}`}>
          Day
        </Link>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      {!t || !tr ? (
        <div className="panel">
          No offer for this date, so there’s nothing to compare sales against.{" "}
          <Link href={`/offers/new?holds=${h.id}`}>Build an offer</Link>
        </div>
      ) : (
        <>
          <div className="track-cards">
            <div className="panel stat">
              <div className="muted small">Sold</div>
              <div className="big">
                {tr.sold} <span className="muted">/ {tr.cap}</span>
              </div>
              <div className="sold-bar">
                <span style={{ width: `${Math.min(100, tr.pctSold)}%` }} />
                {tr.breakEven !== null && tr.cap > 0 && <i style={{ left: `${Math.min(100, (tr.breakEven / tr.cap) * 100)}%` }} />}
              </div>
              <div className="muted small">
                {tr.pctSold}% sold{tr.comps ? ` · ${tr.comps} comps` : ""}
              </div>
            </div>
            <div className="panel stat">
              <div className="muted small">Gross / after tax</div>
              <div className="big">{money(tr.gross)}</div>
              <div className="muted small">{money(Math.round(tr.now.adjGross * 100) / 100)} after {t.taxPct}% tax</div>
            </div>
            <div className="panel stat">
              <div className="muted small">Break-even</div>
              <div className="big">{tr.breakEven ?? "—"}</div>
              <div className="muted small">
                {tr.breakEven === null ? "Doesn’t break even at sellout" : tr.toBreakEven === 0 ? "✓ Past break-even" : `${tr.toBreakEven} more tickets`}
              </div>
            </div>
            <div className="panel stat">
              <div className="muted small">Artist earns</div>
              <div className="big">{money(Math.round(tr.now.artist))}</div>
              <div className="muted small">at today’s sales · {money(Math.round(tr.sellout.artist))} at sellout</div>
            </div>
            <div className="panel stat">
              <div className="muted small">Venue after costs</div>
              <div className={`big ${tr.now.venue < 0 ? "neg" : ""}`}>{money(Math.round(tr.now.venue))}</div>
              <div className="muted small">at today’s sales · {money(Math.round(tr.sellout.venue))} at sellout</div>
            </div>
            <div className="panel stat">
              <div className="muted small">Pace</div>
              <div className="big">{tr.last7 === null ? "—" : `${tr.last7 >= 0 ? "+" : ""}${tr.last7}`}</div>
              <div className="muted small">
                {tr.last7 === null
                  ? "Needs counts a week apart"
                  : `last 7 days · on pace for ${tr.projected}${tr.projectedBudget ? ` (artist ${money(Math.round(tr.projectedBudget.artist))})` : ""}`}
              </div>
            </div>
          </div>
          <div style={{ margin: "4px 0 12px" }}>
            <span className={`badge track-${tr.status}`}>{STATUS_TEXT[tr.status]}</span>
          </div>

          <div className="artist-cols">
            <section className="panel">
              <h2>Sales over time</h2>
              <SalesChart
                points={[...counts].reverse().map((c) => ({ at: c.counted_at, sold: c.sold }))}
                cap={tr.cap}
                breakEven={tr.breakEven}
                showDate={h.date}
              />
              <h2 style={{ marginTop: 14 }}>By ticket tier</h2>
              <table className="list">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Price</th>
                    <th>Offer qty</th>
                    <th>Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {t.tiers
                    .filter((x, i) => i < 2 || x.qty > 0)
                    .map((x) => (
                      <tr key={x.name}>
                        <td>{x.name}</td>
                        <td>{money(x.price)}</td>
                        <td>{x.qty}</td>
                        <td>{latestTier(x.name) ?? (latest && latest.tiers.length === 0 ? "—" : 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {latest && latest.tiers.length === 0 && (
                <div className="muted small">The latest count is a total only (no tier breakdown).</div>
              )}
            </section>

            <div>
              {staff.canBook && (
                <section className="panel">
                  <h2>Add today’s count</h2>
                  <form action={addTicketCount} className="stack-form">
                    <input type="hidden" name="hold_id" value={h.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <div className="form-grid">
                      {t.tiers
                        .filter((x, i) => i < 2 || x.qty > 0)
                        .map((x) => (
                          <label key={x.name}>
                            {x.name} sold <span className="muted small">({money(x.price)})</span>
                            <input type="hidden" name="tier_name" value={x.name} />
                            <input type="hidden" name="tier_price" value={x.price} />
                            <input type="number" min={0} name="tier_sold" defaultValue={latestTier(x.name) ?? ""} required />
                          </label>
                        ))}
                      <label>
                        Comps
                        <input type="number" min={0} name="comps" defaultValue={latest?.comps ?? 0} />
                      </label>
                      <label>
                        Gross <span className="muted small">(optional; blank = sold × price)</span>
                        <input type="number" min={0} step="0.01" name="gross" />
                      </label>
                      <label className="span2">
                        Note
                        <input name="note" placeholder="e.g. after the presale" />
                      </label>
                    </div>
                    <div>
                      <button className="primary">Save count</button>
                    </div>
                  </form>
                </section>
              )}

              {staff.canBook && (
                <section className="panel">
                  <h2>Eventim</h2>
                  {!eventimReady() ? (
                    <div className="muted small">
                      Not connected yet. See <Link href="/settings/ticketing">Settings → Ticketing</Link>.
                    </div>
                  ) : eventimError ? (
                    <div className="flash error">Eventim: {eventimError}</div>
                  ) : (
                    <>
                      <form action={linkEventimEvent} className="inline-form" style={{ flexWrap: "wrap", gap: 6 }}>
                        <input type="hidden" name="hold_id" value={h.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <select name="event_id" defaultValue={h.eventim_event_id ?? (events.filter((e) => e.date === h.date).length === 1 ? events.find((e) => e.date === h.date)!.id : "")}>
                          <option value="">Not linked</option>
                          {h.eventim_event_id && !events.some((e) => e.id === h.eventim_event_id) && (
                            <option value={h.eventim_event_id}>Linked event ({h.eventim_event_id})</option>
                          )}
                          {events.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.date ? `${e.date} · ` : ""}
                              {e.name}
                            </option>
                          ))}
                        </select>
                        <button>Save link</button>
                      </form>
                      <form action={importSalesNow} style={{ marginTop: 8 }}>
                        <input type="hidden" name="hold_id" value={h.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <button>Import sales now</button>
                      </form>
                      <div className="muted small" style={{ marginTop: 6 }}>
                        Sales import every morning. If the show isn’t linked yet, importing links it to the Eventim event
                        on the same date and room.
                        {h.eventim_event_id?.includes(",") && ` Linked to ${h.eventim_event_id.split(",").length} Eventim events (early and late shows count together).`}
                      </div>
                    </>
                  )}
                </section>
              )}

              <section className="panel">
                <h2>Counts</h2>
                {counts.length === 0 ? (
                  <div className="muted">None yet.</div>
                ) : (
                  <table className="list">
                    <tbody>
                      {counts.map((c) => (
                        <tr key={c.id}>
                          <td className="small" style={{ whiteSpace: "nowrap" }}>
                            {fmtDateTime(c.counted_at)}
                          </td>
                          <td>
                            <strong>{c.sold}</strong> sold · {money(Number(c.gross))}
                            {c.comps ? ` · ${c.comps} comps` : ""}
                            <div className="muted small">
                              {c.source === "eventim" ? "From Eventim" : (c.created_by ?? "")}
                              {c.note ? ` · ${c.note}` : ""}
                            </div>
                          </td>
                          <td>
                            {staff.canBook && (
                              <form action={deleteTicketCount}>
                                <input type="hidden" name="count_id" value={c.id} />
                                <input type="hidden" name="returnTo" value={here} />
                                <button className="small" aria-label="Remove count">
                                  ✕
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
