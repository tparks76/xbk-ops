import Link from "next/link";
import Flash from "@/components/Flash";
import { importSalesNow } from "@/lib/actions";
import { eventimReady } from "@/lib/eventim";
import { fmtDate, todayISO } from "@/lib/dates";
import { money, normalizeTerms, type Terms } from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_TEXT, track, type Count } from "@/lib/track";
import type { Hold } from "@/lib/types";

export const maxDuration = 60;

type Search = Promise<{ past?: string; ok?: string; error?: string }>;

// Track Shows: every confirmed show with its ticket sales against the offer.
export default async function TrackPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const past = sp.past === "1";
  const today = todayISO();
  const from = past ? new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10) : today;
  const supabase = await createClient();

  let q = supabase.from("holds").select("*").eq("status", "confirmed").in("kind", ["show", "copro"]);
  q = past ? q.gte("date", from).lt("date", today).order("date", { ascending: false }) : q.gte("date", today).order("date");
  const { data: holdRows } = await q.limit(300);
  const holds = (holdRows ?? []) as Hold[];
  const ids = holds.map((h) => h.id);

  const { data: offerRows } = ids.length
    ? await supabase.from("offers").select("id,hold_ids,terms,updated_at").overlaps("hold_ids", ids).order("updated_at")
    : { data: [] };
  const offerFor = new Map<string, { id: string; terms: Terms }>();
  for (const o of (offerRows ?? []) as { id: string; hold_ids: string[]; terms: unknown }[]) {
    for (const hid of o.hold_ids) offerFor.set(hid, { id: o.id, terms: normalizeTerms(o.terms) }); // newest wins
  }
  const { data: countRows, error: countError } = ids.length
    ? await supabase.from("ticket_counts").select("hold_id,counted_at,sold,comps,gross,tiers,source,capacity").in("hold_id", ids).order("counted_at", { ascending: false })
    : { data: [], error: null };
  const countsFor = new Map<string, Count[]>();
  for (const c of (countRows ?? []) as (Count & { hold_id: string })[]) {
    countsFor.set(c.hold_id, [...(countsFor.get(c.hold_id) ?? []), c]);
  }

  const latestOf = (id: string) => countsFor.get(id)?.[0] as (Count & { capacity?: number | null }) | undefined;
  const rows = holds.map((h) => {
    const offer = offerFor.get(h.id);
    return { h, offer, tr: offer ? track(offer.terms, countsFor.get(h.id) ?? [], h.date, today) : null, counted: countsFor.get(h.id)?.[0]?.counted_at };
  });

  return (
    <>
      <div className="day-head">
        <h1>Track Shows</h1>
        <div className="seg">
          <Link href="/track" className={past ? "" : "on"}>
            Upcoming
          </Link>
          <Link href="/track?past=1" className={past ? "on" : ""}>
            Last 60 days
          </Link>
        </div>
        <span className="spacer" />
        {staff.canBook && eventimReady() && (
          <form action={importSalesNow}>
            <input type="hidden" name="returnTo" value={past ? "/track?past=1" : "/track"} />
            <button>Import sales from Eventim</button>
          </form>
        )}
      </div>
      <Flash
        ok={sp.ok}
        error={sp.error ?? (countError ? "Track Shows isn't set up yet. Run 0016_track_shows.sql in Supabase." : undefined)}
      />
      <div className="panel">
        {rows.length === 0 ? (
          <div className="muted">{past ? "No confirmed shows in the last 60 days." : "No confirmed shows coming up."}</div>
        ) : (
          <table className="list track">
            <thead>
              <tr>
                <th>Date</th>
                <th>Show</th>
                <th>Sold</th>
                <th>Gross</th>
                <th>Break-even</th>
                <th>Artist now / sellout</th>
                <th>Last 7 days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ h, offer, tr, counted }) => (
                <tr key={h.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {fmtDate(h.date)}
                    <div className="muted small">{tr ? (tr.daysLeft > 0 ? `${tr.daysLeft} days` : tr.daysLeft === 0 ? "Today" : "Past") : ""}</div>
                  </td>
                  <td>
                    <Link href={`/track/${h.id}`}>
                      <strong>{h.title}</strong>
                    </Link>
                    <div className="muted small">{ROOM_FULL[h.room_id] ?? h.room_id}</div>
                  </td>
                  {!offer || !tr ? (
                    <>
                      <td className="small">
                        {latestOf(h.id) ? `${latestOf(h.id)!.sold}${latestOf(h.id)!.capacity ? ` / ${latestOf(h.id)!.capacity}` : ""}` : "—"}
                      </td>
                      <td>{latestOf(h.id) ? money(Number(latestOf(h.id)!.gross)) : "—"}</td>
                      <td colSpan={4} className="muted small">
                        No offer for this date, so there’s no break-even or payout to compare.{" "}
                        <Link href={`/offers/new?holds=${h.id}`}>Build one</Link>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ minWidth: 130 }}>
                        <div className="sold-bar" title={`${tr.pctSold}% sold`}>
                          <span style={{ width: `${Math.min(100, tr.pctSold)}%` }} />
                          {tr.breakEven !== null && tr.cap > 0 && (
                            <i style={{ left: `${Math.min(100, (tr.breakEven / tr.cap) * 100)}%` }} title={`Break-even: ${tr.breakEven}`} />
                          )}
                        </div>
                        <div className="small">
                          {tr.sold} / {tr.cap} <span className="muted">({tr.pctSold}%)</span>
                        </div>
                        {counted && <div className="muted small">as of {fmtDate(counted.slice(0, 10))}</div>}
                      </td>
                      <td>{money(tr.gross)}</td>
                      <td className="small">
                        {tr.breakEven === null ? "—" : tr.toBreakEven === 0 ? "✓ Past it" : `${tr.toBreakEven} more (${tr.breakEven})`}
                      </td>
                      <td className="small">
                        {money(Math.round(tr.now.artist))} / {money(Math.round(tr.sellout.artist))}
                      </td>
                      <td className="small">{tr.last7 === null ? "—" : `${tr.last7 >= 0 ? "+" : ""}${tr.last7}`}</td>
                      <td>
                        <span className={`badge track-${tr.status}`}>{STATUS_TEXT[tr.status]}</span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">
        Break-even and artist payouts use each show’s offer: its costs, tax and deal. The tick on each bar marks break-even.
        “Last 7 days” is tickets sold in the past week, from the counts saved.
      </p>
    </>
  );
}
