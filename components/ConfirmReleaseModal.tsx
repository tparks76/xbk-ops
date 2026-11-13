import Link from "next/link";
import { releaseHolds } from "@/lib/actions";
import { fmtDate, todayISO } from "@/lib/dates";
import { ROOM_COLOR, ROOM_SHORT } from "@/lib/stack";
import type { Hold } from "@/lib/types";

// Pick which of an artist's upcoming holds to release.
// mode "confirm": shown right after confirming `confirmed` (lists the artist's other holds).
// mode "release": opened from "Release holds…" (lists all of the artist's holds).
export default function ConfirmReleaseModal({
  confirmed,
  others,
  releasedHere,
  date,
  mode = "confirm",
}: {
  confirmed: Hold;
  others: Hold[];
  releasedHere?: string;
  date: string;
  mode?: "confirm" | "release";
}) {
  const isConfirm = mode === "confirm";
  const today = todayISO();
  const closeHref = isConfirm ? `/day/${date}?ok=${encodeURIComponent("Confirmed.")}` : `/day/${date}`;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="col-head">
          <h2>
            {isConfirm
              ? `Confirmed: ${confirmed.title} · ${ROOM_SHORT[confirmed.room_id]} · ${fmtDate(confirmed.date, { year: undefined })}`
              : `Release holds: ${confirmed.title}`}
          </h2>
          <Link className="button-link" href={closeHref} aria-label="Close">
            ✕
          </Link>
        </div>

        {releasedHere && (
          <div className="flash info">
            <strong>Released on this date:</strong> {releasedHere}
          </div>
        )}

        <div>
          {isConfirm ? (
            <>
              {confirmed.title} still has <strong>{others.length}</strong> other hold
              {others.length === 1 ? "" : "s"}. Select the ones to release:
            </>
          ) : (
            <>
              {confirmed.title} has <strong>{others.length}</strong> hold{others.length === 1 ? "" : "s"}
              {others.length > 1 ? " across all rooms" : ""}.
              The date you clicked from is ticked. Tick more to release them too. Confirmed dates aren’t listed.
            </>
          )}
        </div>

        <form action={releaseHolds} className="modal-form">
          <input
            type="hidden"
            name="returnTo"
            value={isConfirm ? `/day/${date}?confirmed=${confirmed.id}` : `/day/${date}?release=${confirmed.id}`}
          />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="doneTo" value={`/day/${date}`} />
          {others.map((h) => (
            <input key={h.id} type="hidden" name="all_ids" value={h.id} />
          ))}

          <div className="pick-list">
            {others.map((h) => (
              <label key={h.id} className="pick">
                <input type="checkbox" name="pick" value={h.id} defaultChecked={!isConfirm && h.id === confirmed.id} />
                <span className="pick-room" style={{ color: ROOM_COLOR[h.room_id] }}>
                  {ROOM_SHORT[h.room_id]}
                </span>
                <span>{fmtDate(h.date)}</span>
                {h.date < today && <span className="tag-past">past date</span>}
                <span className="muted">
                  H{h.rank}
                  {h.status === "offer_out" ? " · offer out" : ""}
                </span>
              </label>
            ))}
          </div>

          <input name="reason" placeholder={isConfirm ? "Reason (optional), e.g. Confirmed Nov 11 instead" : "Reason (optional), e.g. Tour cancelled"} aria-label="Reason" />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="danger">Release selected</button>
            {others.length > 1 && (
              <button className="danger" name="all" value="1">
                Release all {others.length}
              </button>
            )}
            <Link className="button-link" href={closeHref}>
              {isConfirm ? "Keep all" : "Cancel"}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
