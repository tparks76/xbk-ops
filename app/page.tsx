import Link from "next/link";
import Flash from "@/components/Flash";
import ChallengesPanel from "@/components/ChallengesPanel";
import MonthGrid from "@/components/MonthGrid";
import MonthPicker from "@/components/MonthPicker";
import StackChip from "@/components/StackChip";
import { getHolds, getRooms, stackFor } from "@/lib/data";
import { ROOM_COLOR } from "@/lib/stack";
import {
  addMonths,
  daysInMonth,
  fmtDate,
  isValidMonth,
  monthGrid,
  monthKey,
  parseISO,
  todayISO,
} from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold } from "@/lib/types";

type Search = Promise<{ m?: string; view?: string; room?: string; error?: string }>;

export default async function CalendarPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  const m = isValidMonth(sp.m) ? sp.m : monthKey(today);
  const view = sp.view === "rooms" ? "rooms" : "month";

  const allRooms = await getRooms();
  const roomFilter = allRooms.some((r) => r.id === sp.room) ? sp.room! : "all";
  const rooms = roomFilter === "all" ? allRooms : allRooms.filter((r) => r.id === roomFilter);

  const grid = monthGrid(m);
  const from = view === "month" ? grid[0][0] : `${m}-01`;
  const to = view === "month" ? grid[grid.length - 1][6] : daysInMonth(m).at(-1)!;
  const holds = await getHolds(from, to);

  // Every running challenge from today on, whatever month is showing.
  const supabase = await createClient();
  const { data: chRows } = await supabase
    .from("holds")
    .select("*")
    .gte("date", today)
    .in("status", ["hold", "offer_out"])
    .not("challenge_deadline", "is", null);
  const challenged = (chRows ?? []) as Hold[];
  const challengerIds = [...new Set(challenged.map((h) => h.challenged_by).filter(Boolean))] as string[];
  const { data: chBy } = challengerIds.length
    ? await supabase.from("holds").select("id,title").in("id", challengerIds)
    : { data: [] };
  const challengerTitles = new Map((chBy ?? []).map((h: { id: string; title: string }) => [h.id, h.title]));

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({ m, view, room: roomFilter, ...over });
    return `/?${p.toString()}`;
  };

  return (
    <>
      <Flash error={sp.error} />
      <ChallengesPanel challenged={challenged} titles={challengerTitles} />
      <div className="toolbar">
        <Link className="button-link" href={link({ m: addMonths(m, -1) })}>
          ←
        </Link>
        <MonthPicker m={m} view={view} room={roomFilter} thisYear={Number(today.slice(0, 4))} />
        <Link className="button-link" href={link({ m: addMonths(m, 1) })}>
          →
        </Link>
        <Link className="button-link" href={link({ m: monthKey(today) })}>
          Today
        </Link>
        <form className="offer-search" action="/search">
          <input name="q" type="search" placeholder="Search artist, agent, notes…" aria-label="Search" />
          <button>Search</button>
        </form>
        <div className="spacer" />
        <div className="seg">
          <Link className={view === "month" ? "on" : ""} href={link({ view: "month" })}>
            Month
          </Link>
          <Link className={view === "rooms" ? "on" : ""} href={link({ view: "rooms" })}>
            Rooms side-by-side
          </Link>
        </div>
        <div className="seg">
          <Link className={roomFilter === "all" ? "on" : ""} href={link({ room: "all" })}>
            All rooms
          </Link>
          {allRooms.map((r) => (
            <Link
              key={r.id}
              className={roomFilter === r.id ? "room-btn on" : "room-btn"}
              style={{ ["--room" as string]: ROOM_COLOR[r.id] }}
              href={link({ room: r.id })}
            >
              {r.name}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid
          m={m}
          today={today}
          weeks={grid}
          allRooms={allRooms}
          rooms={rooms}
          holds={holds}
          canBook={staff.canBook}
        />
      ) : (
        <table className="rooms">
          <thead>
            <tr>
              <th>Date</th>
              {rooms.map((r) => (
                <th key={r.id}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daysInMonth(m).map((d) => {
              const dow = parseISO(d).getUTCDay();
              return (
                <tr key={d} className={dow === 0 || dow >= 5 ? "weekend" : ""}>
                  <td className="date">
                    <Link href={`/day/${d}`}>{fmtDate(d, { year: undefined })}</Link>
                  </td>
                  {rooms.map((r) => {
                    const s = stackFor(holds, r.id, d);
                    const open = !s.confirmed && s.active.length === 0;
                    return (
                      <td key={r.id} className={open ? "open" : ""}>
                        {open ? "Open" : <StackChip room={r.id} date={d} stack={s} showRoom={false} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
