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
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Date(s)</div>
          <div className="row">
            <input type="date" name="date" required defaultValue={date} aria-label="Date" />
            <input type="date" name="date" aria-label="Alternate date" />
            <input type="date" name="date" aria-label="Alternate date" />
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Add alternates for “3/14, 3/15 or 3/16” requests — each date gets its own hold, grouped together.
          </div>
        </div>
        <HoldFields />
        <div className="muted small">New holds go in at H2 (or the next open rank). Promote to H1 from the date page.</div>
        <div>
          <button className="primary">Place hold</button>
        </div>
      </form>
    </>
  );
}
