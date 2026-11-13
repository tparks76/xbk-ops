import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import Countdown from "@/components/Countdown";
import {
  cancelChallenge,
  challengeHolds,
  confirmHold,
  moveHold,
  releaseArtist,
  releaseHold,
  setOfferOut,
} from "@/lib/actions";
import type { Hold } from "@/lib/types";

type Props = {
  hold: Hold;
  canBook: boolean;
  returnTo: string;
  maxRank: number;
  minRank: number;
  challengerTitle?: string; // title of the hold challenging this one
  isChallenging: boolean; // this hold has an open challenge on others
  emailText?: string; // this artist's upcoming holds, for pasting into an email
  artistHoldCount?: number; // this artist's upcoming active holds, all rooms
};

function Hidden({ hold, returnTo }: { hold: Hold; returnTo: string }) {
  return (
    <>
      <input type="hidden" name="id" value={hold.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

export default function HoldCard({
  hold,
  canBook,
  returnTo,
  maxRank,
  minRank,
  challengerTitle,
  isChallenging,
  emailText,
  artistHoldCount = 0,
}: Props) {
  const rank = hold.rank ?? 0;
  const confirmed = hold.status === "confirmed";

  return (
    <div
      id={`hold-${hold.id}`}
      className={[
        "hold",
        confirmed ? "is-confirmed" : "",
        hold.kind === "rental" ? "is-rental" : "",
        hold.challenge_deadline ? "is-challenged" : "",
      ].join(" ")}
    >
      <div className="hold-head">
        <span className={confirmed ? "badge confirmed" : rank === 1 ? "badge h1" : "badge"}>
          {confirmed ? "Confirmed" : `H${rank}`}
        </span>
        <strong className="hold-title">{hold.title}</strong>
        {hold.kind === "rental" && <span className="badge rental">Rental</span>}
        {hold.status === "offer_out" && <span className="badge offer">Offer out</span>}
      </div>

      {(hold.agent_name || hold.agent_company || hold.agent_email) && (
        <div className="muted">
          {[hold.agent_name, hold.agent_company].filter(Boolean).join(", ")}
          {hold.agent_email && (
            <>
              {" · "}
              <a href={`mailto:${hold.agent_email}`}>{hold.agent_email}</a>
            </>
          )}
        </div>
      )}
      {hold.notes && <div className="notes">{hold.notes}</div>}

      {hold.challenge_deadline && (
        <div className="challenge-line">
          Challenged{challengerTitle ? ` by ${challengerTitle}` : ""} ·{" "}
          <Countdown deadline={hold.challenge_deadline} />
        </div>
      )}
      {isChallenging && <div className="challenge-line">Has an open challenge on the holds above</div>}

      <div className="muted small">Placed by {hold.placed_by}</div>

      {emailText && !canBook && (
        <div className="hold-actions">
          <CopyButton text={emailText} />
        </div>
      )}

      {canBook && (
        <div className="hold-actions">
          {emailText && <CopyButton text={emailText} />}
          {!confirmed && (
            <>
              {rank !== 1 && (
                <form action={moveHold}>
                  <Hidden hold={hold} returnTo={returnTo} />
                  <input type="hidden" name="rank" value="1" />
                  <button>Promote to H1</button>
                </form>
              )}
              {rank > 2 && (
                <form action={moveHold}>
                  <Hidden hold={hold} returnTo={returnTo} />
                  <input type="hidden" name="rank" value={rank - 1} />
                  <button title="Move up one rank">▲</button>
                </form>
              )}
              {rank < maxRank && (
                <form action={moveHold}>
                  <Hidden hold={hold} returnTo={returnTo} />
                  <input type="hidden" name="rank" value={rank + 1} />
                  <button title="Move down one rank">▼</button>
                </form>
              )}
              <form action={setOfferOut}>
                <Hidden hold={hold} returnTo={returnTo} />
                <input type="hidden" name="out" value={hold.status === "offer_out" ? "0" : "1"} />
                <button>{hold.status === "offer_out" ? "Clear offer" : "Mark offer out"}</button>
              </form>
              {rank > minRank && !isChallenging && (
                <form action={challengeHolds} className="inline-form">
                  <Hidden hold={hold} returnTo={returnTo} />
                  <button>Challenge above</button>
                  <input name="hours" type="number" min={1} max={336} defaultValue={48} aria-label="Hours" />
                  <span className="muted small">hrs</span>
                </form>
              )}
              {isChallenging && (
                <form action={cancelChallenge}>
                  <Hidden hold={hold} returnTo={returnTo} />
                  <button>Withdraw challenge</button>
                </form>
              )}
              <form action={confirmHold}>
                <Hidden hold={hold} returnTo={returnTo} />
                <button className="primary">Confirm</button>
              </form>
            </>
          )}
          <form action={releaseHold} className="inline-form">
            <Hidden hold={hold} returnTo={returnTo} />
            <input name="reason" placeholder="Reason (optional)" aria-label="Reason" />
            <button className="danger">{confirmed ? "Cancel date" : "Release"}</button>
          </form>
          <Link className="button-link" href={`/hold/${hold.id}/edit`}>
            Edit
          </Link>
        </div>
      )}

      {canBook && artistHoldCount > 1 && (
        <details className="release-all">
          <summary>Release all {artistHoldCount} holds for {hold.title}…</summary>
          <form action={releaseArtist} className="inline-form">
            <input type="hidden" name="title" value={hold.title} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="reason" placeholder="Reason (optional)" aria-label="Reason" />
            <button className="danger">Release all {artistHoldCount}</button>
          </form>
          <div className="muted small">Every upcoming hold in all rooms. Confirmed dates are not affected.</div>
        </details>
      )}
    </div>
  );
}
