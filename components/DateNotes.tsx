import { addDateNote, deleteDateNote } from "@/lib/actions";
import { fmtDateTime } from "@/lib/dates";
import type { DateNote } from "@/lib/types";

// Notes for a date (competing events and the like). Not holds.
export default function DateNotes({
  date,
  notes,
  canBook,
  returnTo,
}: {
  date: string;
  notes: DateNote[];
  canBook: boolean;
  returnTo: string;
}) {
  return (
    <section className={notes.length ? "panel date-notes has" : "panel date-notes"}>
      <h2>Notes</h2>
      {notes.length === 0 && <div className="muted small">No notes for this date.</div>}
      {notes.map((n) => (
        <div key={n.id} className="date-note">
          <div className="date-note-body">{n.body}</div>
          <div className="muted small">
            {n.created_by} · {fmtDateTime(n.created_at)}
          </div>
          {canBook && (
            <form action={deleteDateNote}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="link-danger">Delete</button>
            </form>
          )}
        </div>
      ))}
      {canBook && (
        <form action={addDateNote} className="date-note-add">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <textarea name="body" rows={2} placeholder="e.g. Big show at Wells Fargo Arena; Hinterland weekend" required />
          <button>Add note</button>
        </form>
      )}
    </section>
  );
}
