import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { eventimEventsRaw, eventimOrders, eventimReady, eventimTicketTypes, normalizeEvents } from "@/lib/eventim";
import { capacityFrom, totalsFromOrders } from "@/lib/eventim-sales";
import { requireStaff } from "@/lib/session";

export const maxDuration = 60;

// Ticketing (Eventim US): connection status, setup, and a test that shows what Eventim sends.
export default async function TicketingSettingsPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const ready = eventimReady();
  let result: {
    count: number;
    names: string[];
    sample: { name: string; date: string | null; orders: number; sold: number; comps: number; gross: number; capacity: number | null; tiers: string; statuses: string } | null;
    salesError: string;
  } | null = null;
  let error = "";
  if (ready && sp.test === "1") {
    try {
      const events = normalizeEvents(await eventimEventsRaw());
      const today = new Date().toISOString().slice(0, 10);
      // Try sales on the next upcoming event (totals only; no customer details are shown or kept).
      const next = events.filter((e) => e.date && e.date >= today).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0] ?? events[0];
      let sample = null;
      let salesError = "";
      if (next) {
        try {
          const orders = await eventimOrders(next.id);
          const types = await eventimTicketTypes(next.id).catch(() => []);
          const t = totalsFromOrders(orders);
          sample = {
            name: next.name,
            date: next.date,
            orders: orders.length,
            sold: t.sold,
            comps: t.comps,
            gross: t.gross,
            capacity: capacityFrom(types),
            tiers: t.tiers.map((x) => `${x.name}: ${x.sold} at $${x.price}`).join(" · ") || "—",
            statuses: Object.entries(t.statuses).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—",
          };
        } catch (e) {
          salesError = (e as Error).message;
        }
      }
      result = { count: events.length, names: events.slice(0, 10).map((e) => `${e.date ?? "?"} · ${e.name} · ${e.venue} (id ${e.id})`), sample, salesError };
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <>
      <div className="day-head">
        <h1>Ticketing</h1>
        <span className={`badge ${ready ? "confirmed" : ""}`}>{ready ? "Eventim connected" : "Not connected"}</span>
      </div>
      <div className="panel">
        <p>
          <Link href="/track">Track Shows</Link> sets each confirmed show’s ticket sales against its offer. Counts can be
          typed in on each show, and shows linked to their Eventim event can import sales from Eventim (once a day
          automatically each morning, or with Import sales now). Shows are matched to their Eventim event by date and room.
        </p>
      </div>
      {!ready && (
        <div className="panel">
          <h2>Connect Eventim US</h2>
          <ol className="setup-steps">
            <li>
              In the Eventim Client Dashboard, go to <strong>MARKET → API Credentials</strong> and create a new set of
              credentials. Tick every data option offered (events, orders, sales/reports). Copy the <strong>Client ID</strong>,{" "}
              <strong>API Key</strong> and <strong>API Secret</strong>; the secret is only shown once.
            </li>
            <li>
              In Vercel → your project → <strong>Settings → Environment Variables</strong>, add <code>EVENTIM_CLIENT_ID</code>,{" "}
              <code>EVENTIM_API_KEY</code> and <code>EVENTIM_API_SECRET</code>. Then ask Claude to redeploy.
            </li>
            <li>Come back here and click <strong>Test connection</strong>.</li>
          </ol>
        </div>
      )}
      {ready && (
        <div className="panel">
          <div className="day-head" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Test connection</h2>
            <Link className="button-link" href="/settings/ticketing?test=1">
              Test connection
            </Link>
          </div>
          {error && <div className="flash error">Eventim: {error}</div>}
          {result && (
            <>
              <p>
                Eventim sent <strong>{result.count}</strong> event{result.count === 1 ? "" : "s"}.
              </p>
              {result.names.length > 0 && (
                <ul className="small">
                  {result.names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {result.salesError && <div className="flash error">Sales: {result.salesError}</div>}
              {result.sample && (
                <div className="panel" style={{ background: "#f6f6f2" }}>
                  <strong>Sales check: {result.sample.name}</strong> ({result.sample.date})
                  <div className="small" style={{ marginTop: 4 }}>
                    {result.sample.orders} orders · <strong>{result.sample.sold} sold</strong> · {result.sample.comps} comps · $
                    {result.sample.gross.toFixed(2)} face value · capacity {result.sample.capacity ?? "?"}
                  </div>
                  <div className="small">By ticket type: {result.sample.tiers}</div>
                  <div className="small muted">Ticket statuses seen: {result.sample.statuses}</div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Compare these with Eventim’s Live Stats for the same show. If they match, sales import is working.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
