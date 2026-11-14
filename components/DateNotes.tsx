import { addDateNote, deleteDateNote } from "@/lib/actions";
import { fmtDateTime } from "@/lib/dates";
import type { DateNote } from "@/lib/types";

// Notes for a date: yours (competing events and the like) and outside music
// events added automatically each day. Not holds.
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
  const mine = notes.filter((n) => !n.source || n.source === "manual");
  const auto = notes.filter((n) => n.source && n.source !== "manual");
  return (
    <section className={mine.length ? "panel date-notes has" : "panel date-notes"}>
      <h2>Notes</h2>
      {mine.length === 0 && auto.length === 0 && <div className="muted small">No notes for this date.</div>}
      {mine.map((n) => (
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

      {auto.length > 0 && (
        <div className="auto-notes">
          <div className="auto-notes-head">♪ Music in the metro ({auto.length}) · added automatically</div>
          {auto.map((n) => (
            <div key={n.id} className="date-note">
              <div className="date-note-body">
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noreferrer">
                    {n.body}
                  </a>
                ) : (
                  n.body
                )}
              </div>
              {canBook && (
                <form action={deleteDateNote}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="auto" value="1" />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button className="link-danger">Hide</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

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
