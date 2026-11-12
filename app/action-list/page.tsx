import Link from "next/link";
import Countdown from "@/components/Countdown";
import { ROOM_SHORT } from "@/lib/data";
import { fmtDate, todayISO } from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold } from "@/lib/types";

const STALE_DAYS = 14;

export default async function ActionListPage() {
  await requireStaff();
  const supabase = await createClient();
  const today = todayISO();

  const { data } = await supabase
    .from("holds")
    .select("*")
    .gte("date", today)
    .in("status", ["hold", "offer_out"])
    .order("date");
  const active = (data ?? []) as Hold[];
  const byId = new Map(active.map((h) => [h.id, h]));

  const challenged = active
    .filter((h) => h.challenge_deadline)
    .sort((a, b) => a.challenge_deadline!.localeCompare(b.challenge_deadline!));
  const offers = active
    .filter((h) => h.status === "offer_out")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  const stale = active.filter((h) => h.updated_at < cutoff).sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const where = (h: Hold) => (
    <Link href={`/day/${h.date}`}>
      {fmtDate(h.date)} · {ROOM_SHORT[h.room_id]}
    </Link>
  );

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>Action list</h1>

      <div className="panel">
        <h2>Challenges running ({challenged.length})</h2>
        {challenged.length === 0 ? (
          <div className="muted">None.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Time left</th>
                <th>Date</th>
                <th>Challenged hold</th>
                <th>Agent</th>
                <th>Challenged by</th>
              </tr>
            </thead>
            <tbody>
              {challenged.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Countdown deadline={h.challenge_deadline!} />
                  </td>
                  <td>{where(h)}</td>
                  <td>
                    H{h.rank} {h.title}
                  </td>
                  <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
                  <td>{h.challenged_by ? byId.get(h.challenged_by)?.title : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Offers out ({offers.length})</h2>
        {offers.length === 0 ? (
          <div className="muted">None.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Date</th>
                <th>Hold</th>
                <th>Agent</th>
                <th>Last change</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((h) => (
                <tr key={h.id}>
                  <td>{where(h)}</td>
                  <td>
                    H{h.rank} {h.title}
                  </td>
                  <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
                  <td className="muted">{new Date(h.updated_at).toLocaleDateString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>
          Holds with no change in {STALE_DAYS}+ days ({stale.length})
        </h2>
        {stale.length === 0 ? (
          <div className="muted">None.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Date</th>
                <th>Hold</th>
                <th>Agent</th>
                <th>Last change</th>
              </tr>
            </thead>
            <tbody>
              {stale.map((h) => (
                <tr key={h.id}>
                  <td>{where(h)}</td>
                  <td>
                    H{h.rank} {h.title}
                  </td>
                  <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
                  <td className="muted">{new Date(h.updated_at).toLocaleDateString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
