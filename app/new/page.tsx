import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import HoldFields from "@/components/HoldFields";
import { placeHolds } from "@/lib/actions";
import { getRooms } from "@/lib/data";
import { isValidISO, todayISO } from "@/lib/dates";
import { requireStaff } from "@/lib/session";

type Search = Promise<{ date?: string; room?: string; error?: string }>;

export default async function NewHoldPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!staff.canBook) redirect("/");
  const sp = await searchParams;
  const rooms = await getRooms();
  const date = isValidISO(sp.date) ? sp.date : todayISO();
  const room = rooms.some((r) => r.id === sp.room) ? sp.room : rooms[0]?.id;

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>New hold</h1>
      <Flash error={sp.error} />
      <form action={placeHolds} className="form">
        <input type="hidden" name="returnTo" value={`/new?date=${date}&room=${room ?? ""}`} />
        <label>
          Room
          <select name="room" defaultValue={room}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" name="date" required defaultValue={date} />
        </label>
        <HoldFields />
        <div className="muted small">New holds go in at H2 (or the next open rank). To hold several dates for one artist, select them on the calendar.</div>
        <div>
          <button className="primary">Place hold</button>
        </div>
      </form>
    </>
  );
}
