import Link from "next/link";
import Countdown from "@/components/Countdown";
import { fmtDate } from "@/lib/dates";
import { ROOM_SHORT } from "@/lib/stack";
import type { Hold } from "@/lib/types";

// Holds with a challenge deadline running, soonest deadline first.
export default function ChallengesPanel({
  challenged,
  titles,
  showDate = true,
  title = "Outstanding challenges",
}: {
  challenged: Hold[];
  titles: Map<string, string>; // hold id → title, for "challenged by"
  showDate?: boolean;
  title?: string;
}) {
  if (challenged.length === 0) return null;
  const rows = [...challenged].sort((a, b) =>
    (a.challenge_deadline ?? "").localeCompare(b.challenge_deadline ?? ""),
  );
  return (
    <div className="panel challenges">
      <h2>
        {title} ({rows.length})
      </h2>
      <table className="list">
        <thead>
          <tr>
            <th>Time left</th>
            {showDate && <th>Date</th>}
            <th>Room</th>
            <th>Challenged hold</th>
            <th>Agent</th>
            <th>Challenged by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td>
                <Countdown deadline={h.challenge_deadline!} />
              </td>
              {showDate && (
                <td>
                  <Link href={`/day/${h.date}`}>{fmtDate(h.date, { year: undefined })}</Link>
                </td>
              )}
              <td>{ROOM_SHORT[h.room_id] ?? h.room_id}</td>
              <td>
                H{h.rank} {h.title}
              </td>
              <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
              <td>{h.challenged_by ? titles.get(h.challenged_by) ?? "" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
