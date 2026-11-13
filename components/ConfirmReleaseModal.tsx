import Link from "next/link";
import { releaseHolds } from "@/lib/actions";
import { fmtDate } from "@/lib/dates";
import { ROOM_COLOR, ROOM_SHORT } from "@/lib/stack";
import type { Hold } from "@/lib/types";

// Shown right after confirming a hold: pick which of the artist's other
// upcoming holds to release.
export default function ConfirmReleaseModal({
  confirmed,
  others,
  releasedHere,
  date,
}: {
  confirmed: Hold;
  others: Hold[];
  releasedHere?: string;
  date: string;
}) {
  const closeHref = `/day/${date}?ok=${encodeURIComponent("Confirmed.")}`;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="col-head">
          <h2>
            Confirmed: {confirmed.title} · {ROOM_SHORT[confirmed.room_id]} · {fmtDate(confirmed.date, { year: undefined })}
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
          {confirmed.title} still has <strong>{others.length}</strong> other upcoming hold
          {others.length === 1 ? "" : "s"}. Select the ones to release:
        </div>

        <form action={releaseHolds} className="modal-form">
          <input type="hidden" name="returnTo" value={`/day/${date}?confirmed=${confirmed.id}`} />
          <input type="hidden" name="doneTo" value={`/day/${date}`} />
          {others.map((h) => (
            <input key={h.id} type="hidden" name="all_ids" value={h.id} />
          ))}

          <div className="pick-list">
            {others.map((h) => (
              <label key={h.id} className="pick">
                <input type="checkbox" name="pick" value={h.id} />
                <span className="pick-room" style={{ color: ROOM_COLOR[h.room_id] }}>
                  {ROOM_SHORT[h.room_id]}
                </span>
                <span>{fmtDate(h.date)}</span>
                <span className="muted">
                  H{h.rank}
                  {h.status === "offer_out" ? " · offer out" : ""}
                </span>
              </label>
            ))}
          </div>

          <input name="reason" placeholder="Reason (optional), e.g. Confirmed Nov 11 instead" aria-label="Reason" />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="danger">Release selected</button>
            <button className="danger" name="all" value="1">
              Release all {others.length}
            </button>
            <Link className="button-link" href={closeHref}>
              Keep all
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
