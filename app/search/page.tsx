import { KIND_LABEL } from "@/lib/types";
import Link from "next/link";
import { fmtDate, todayISO } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import { ROOM_COLOR } from "@/lib/stack";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold, Offer } from "@/lib/types";

type Search = Promise<{ q?: string; released?: string }>;

// Keyword search across holds (artist/event, agent, agency, email, notes) and offers.
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const withReleased = sp.released === "1";
  const today = todayISO();

  let holds: Hold[] = [];
  let offers: Offer[] = [];
  if (q) {
    // Every word must appear somewhere (any order); characters that would
    // break the database filter are dropped.
    const words = q
      .replace(/[,()"\\%*:]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);
    const anyCol = (cols: string[], w: string) => cols.map((c) => `${c}.ilike.*${w}*`).join(",");
    const holdCols = ["title", "agent_name", "agent_company", "agent_email", "notes"];
    const offerCols = ["title", "agent_name", "agent_company", "agent_email"];
    const supabase = await createClient();

    let hq = supabase.from("holds").select("*").order("date").limit(500);
    for (const w of words) hq = hq.or(anyCol(holdCols, w));
    if (!withReleased) hq = hq.neq("status", "released");
    const { data: h } = await hq;
    holds = (h ?? []) as Hold[];

    let oq = supabase.from("offers").select("*").order("updated_at", { ascending: false }).limit(100);
    for (const w of words) oq = oq.or(anyCol(offerCols, w));
    const { data: o } = await oq;
    offers = (o ?? []) as Offer[];
  }

  const upcoming = holds.filter((h) => h.date >= today);
  const past = holds.filter((h) => h.date < today).reverse();
  const status = (h: Hold) =>
    h.status === "confirmed" ? "Confirmed" : h.status === "released" ? "Released" : `H${h.rank}${h.status === "offer_out" ? " · offer out" : ""}`;

  const rows = (list: Hold[]) => (
    <table className="list">
      <thead>
        <tr>
          <th>Date</th>
          <th>Room</th>
          <th>Artist / event</th>
          <th>Status</th>
          <th>Agent</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {list.map((h) => (
          <tr key={h.id}>
            <td style={{ whiteSpace: "nowrap" }}>
              <Link href={`/day/${h.date}#hold-${h.id}`}>{fmtDate(h.date)}</Link>
            </td>
            <td style={{ color: ROOM_COLOR[h.room_id], fontWeight: 600 }}>{ROOM_FULL[h.room_id]}</td>
            <td>
              {h.title}
              {h.kind !== "show" && (
                <span className={`badge ${h.kind}`} style={{ marginLeft: 6 }}>
                  {KIND_LABEL[h.kind]}
                </span>
              )}
            </td>
            <td>{status(h)}</td>
            <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
            <td className="muted small">{h.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="day-head">
        <h1>Search</h1>
        <form className="offer-search" action="/search">
          <input name="q" type="search" defaultValue={q} placeholder="Artist, agent, agency, notes…" autoFocus />
          <label className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" name="released" value="1" defaultChecked={withReleased} /> Include released
          </label>
          <button>Search</button>
        </form>
        <span className="spacer" />
        <Link href="/">Back to calendar</Link>
      </div>

      {!q ? (
        <div className="muted">Type an artist, agent, agency, email or a word from the notes.</div>
      ) : holds.length === 0 && offers.length === 0 ? (
        <div className="panel muted">Nothing found for “{q}”.</div>
      ) : (
        <>
          <div className="panel">
            <h2>Upcoming ({upcoming.length})</h2>
            {upcoming.length ? rows(upcoming) : <div className="muted">None.</div>}
          </div>
          {past.length > 0 && (
            <div className="panel">
              <h2>Past ({past.length})</h2>
              {rows(past)}
            </div>
          )}
          {offers.length > 0 && (
            <div className="panel">
              <h2>Offers ({offers.length})</h2>
              <table className="list">
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/offers/${o.id}`}>{o.title}</Link>
                      </td>
                      <td>{ROOM_FULL[o.room_id]}</td>
                      <td>{[o.agent_name, o.agent_company].filter(Boolean).join(", ")}</td>
                      <td>
                        <span className={`badge status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
