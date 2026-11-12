import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import HoldCard from "@/components/HoldCard";
import { getRooms, stackFor } from "@/lib/data";
import { addDays, fmtDate, fmtDateTime, isValidISO, monthKey } from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold, HoldEvent } from "@/lib/types";

type Props = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ error?: string; ok?: string; released?: string }>;
};

export default async function DayPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { date } = await params;
  if (!isValidISO(date)) notFound();
  const sp = await searchParams;

  const supabase = await createClient();
  const rooms = await getRooms();
  const { data: holdRows } = await supabase
    .from("holds")
    .select("*")
    .eq("date", date)
    .order("rank", { nullsFirst: true });
  const holds = (holdRows ?? []) as Hold[];
  const { data: eventRows } = await supabase
    .from("hold_events")
    .select("*")
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(60);
  const events = (eventRows ?? []) as HoldEvent[];

  const byId = new Map(holds.map((h) => [h.id, h]));
  const returnTo = `/day/${date}`;
  const released = holds.filter((h) => h.status === "released");

  return (
    <>
      <div className="day-head">
        <Link className="button-link" href={`/day/${addDays(date, -1)}`}>
          ←
        </Link>
        <h1>{fmtDate(date, { weekday: "long", month: "long" })}</h1>
        <Link className="button-link" href={`/day/${addDays(date, 1)}`}>
          →
        </Link>
        <Link href={`/?m=${monthKey(date)}`}>Back to calendar</Link>
      </div>

      <Flash error={sp.error} ok={sp.ok} released={sp.released} />

      <div className="columns">
        {rooms.map((room) => {
          const stack = stackFor(holds, room.id, date);
          const ranks = stack.active.map((h) => h.rank ?? 0);
          const maxRank = Math.max(0, ...ranks);
          const minRank = ranks.length ? Math.min(...ranks) : 0;
          const hasH1 = ranks.includes(1);
          return (
            <section key={room.id} className="col">
              <div className="col-head">
                <h2>{room.name}</h2>
                {staff.canBook && !stack.confirmed && (
                  <Link className="button-link" href={`/new?date=${date}&room=${room.id}`}>
                    + Hold
                  </Link>
                )}
              </div>

              {stack.confirmed && (
                <HoldCard
                  hold={stack.confirmed}
                  canBook={staff.canBook}
                  returnTo={returnTo}
                  maxRank={0}
                  minRank={0}
                  isChallenging={false}
                />
              )}

              {!stack.confirmed && stack.active.length === 0 && <div className="muted">Open</div>}

              {!stack.confirmed && stack.active.length > 0 && !hasH1 && (
                <div className="empty-h1">H1 open — promote a hold when you want to prioritize it</div>
              )}

              {stack.active.map((h) => (
                <HoldCard
                  key={h.id}
                  hold={h}
                  canBook={staff.canBook}
                  returnTo={returnTo}
                  maxRank={maxRank}
                  minRank={minRank}
                  challengerTitle={h.challenged_by ? byId.get(h.challenged_by)?.title : undefined}
                  isChallenging={stack.active.some((x) => x.challenged_by === h.id)}
                />
              ))}
            </section>
          );
        })}
      </div>

      {released.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Released on this date</h2>
          <table className="list">
            <thead>
              <tr>
                <th>Room</th>
                <th>Artist / event</th>
                <th>Agent</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {released.map((h) => (
                <tr key={h.id}>
                  <td>{rooms.find((r) => r.id === h.room_id)?.name}</td>
                  <td>{h.title}</td>
                  <td>{[h.agent_name, h.agent_company].filter(Boolean).join(", ")}</td>
                  <td>{h.released_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Activity</h2>
        {events.length === 0 ? (
          <div className="muted">Nothing yet.</div>
        ) : (
          <table className="list">
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {fmtDateTime(e.created_at)}
                  </td>
                  <td>{rooms.find((r) => r.id === e.room_id)?.name}</td>
                  <td>
                    <strong>{byId.get(e.hold_id)?.title}</strong> — {e.detail ?? e.action}
                  </td>
                  <td className="muted">{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
