import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { eventimEventsRaw, eventimReady, normalizeEvents, salesFrom } from "@/lib/eventim";
import { requireStaff } from "@/lib/session";

export const maxDuration = 60;

// Ticketing (Eventim US): connection status, setup, and a test that shows what Eventim sends.
export default async function TicketingSettingsPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const ready = eventimReady();
  let result: { count: number; sample: string; names: string[]; hasSales: boolean } | null = null;
  let error = "";
  if (ready && sp.test === "1") {
    try {
      const raw = await eventimEventsRaw();
      const events = normalizeEvents(raw);
      result = {
        count: events.length,
        names: events.slice(0, 10).map((e) => `${e.date ?? "?"} · ${e.name} (id ${e.id || "?"})`),
        hasSales: events.some((e) => salesFrom(e.raw) !== null),
        sample: JSON.stringify(events.length ? events[0].raw : raw, null, 2).slice(0, 6000),
      };
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
          automatically, or with the Import button).
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
                Eventim sent <strong>{result.count}</strong> event{result.count === 1 ? "" : "s"}.{" "}
                {result.hasSales
                  ? "Sales numbers were found, so imports will work."
                  : "No sales numbers were found in the event data yet. Copy the sample below and send it to Claude so the import can be matched up."}
              </p>
              {result.names.length > 0 && (
                <ul className="small">
                  {result.names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="day-head" style={{ marginBottom: 4 }}>
                <span className="muted small">What Eventim sends for one event:</span>
                <CopyButton text={result.sample} />
              </div>
              <pre className="code-block">{result.sample}</pre>
            </>
          )}
        </div>
      )}
    </>
  );
}
