"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import CopyButton from "@/components/CopyButton";
import HoldFields from "@/components/HoldFields";
import StackChip from "@/components/StackChip";
import { placeHoldsFromCalendar, type CalendarHoldState } from "@/lib/actions";
import { fmtDate, monthKey, parseISO } from "@/lib/dates";
import { holdsEmailText, nextRank, stackFor } from "@/lib/stack";
import type { Hold, Room } from "@/lib/types";

type Props = {
  m: string;
  today: string;
  weeks: string[][];
  allRooms: Room[];
  rooms: Room[]; // rooms shown (after the room filter)
  holds: Hold[];
  canBook: boolean;
};

export default function MonthGrid({ m, today, weeks, allRooms, rooms, holds, canBook }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(rooms.length === 1 ? rooms[0].id : allRooms[0]?.id ?? "xbk");
  const [flash, setFlash] = useState<{ text: string; email: string } | null>(null);
  const [offerAsk, setOfferAsk] = useState<{ text: string; email: string; ids: string[]; rental: boolean } | null>(null);
  const [state, formAction, pending] = useActionState<CalendarHoldState, FormData>(
    placeHoldsFromCalendar,
    {},
  );

  // After a successful save: close the window, clear the selection, reload holds.
  useEffect(() => {
    if (state.done) {
      setOpen(false);
      setSelected([]);
      // Holds are saved; now ask whether to build an offer for exactly these dates.
      setOfferAsk({
        text: state.ok ?? "",
        email: holdsEmailText(state.title ?? "", state.placed ?? []),
        ids: (state.placed ?? []).map((h) => h.id),
        rental: state.kind === "rental",
      });
      router.refresh();
    }
  }, [state.done, state.ok, state.title, state.kind, state.placed, router]);

  const sorted = useMemo(() => [...selected].sort(), [selected]);

  function toggle(d: string) {
    setFlash(null);
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
  }

  return (
    <>
      {flash && (
        <div className="flash ok flash-row">
          <span>{flash.text}</span>
          <CopyButton text={flash.email} />
        </div>
      )}
      {canBook && (
        <div className="muted small" style={{ marginBottom: 6 }}>
          Click days to select them for a hold · click a date number to open that day
        </div>
      )}

      <div className="month">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const isSel = selected.includes(d);
          return (
            <div
              key={d}
              role={canBook ? "button" : undefined}
              aria-pressed={canBook ? isSel : undefined}
              onClick={canBook ? () => toggle(d) : undefined}
              className={[
                "day",
                canBook ? "selectable" : "",
                isSel ? "selected" : "",
                monthKey(d) !== m ? "out" : "",
                d === today ? "today" : "",
              ].join(" ")}
            >
              <Link href={`/day/${d}`} className="num" onClick={(e) => e.stopPropagation()}>
                {parseISO(d).getUTCDate()}
              </Link>
              {rooms.map((r) => (
                <StackChip key={r.id} room={r.id} date={d} stack={stackFor(holds, r.id, d)} showRoom={rooms.length > 1} />
              ))}
            </div>
          );
        })}
      </div>

      {canBook && selected.length > 0 && !open && (
        <div className="select-bar">
          <strong>
            {selected.length} date{selected.length > 1 ? "s" : ""} selected
          </strong>
          <span className="muted">{sorted.map((d) => fmtDate(d, { weekday: undefined, year: undefined })).join(", ")}</span>
          <span className="spacer" />
          <button onClick={() => setSelected([])}>Clear</button>
          <button
            className="primary"
            onClick={() => {
              // One room filtered on the calendar: hold in that room. All rooms: xBk.
              setRoom(rooms.length === 1 ? rooms[0].id : "xbk");
              setOpen(true);
            }}
          >
            Hold these dates
          </button>
        </div>
      )}

      {offerAsk && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Holds placed ✓</h2>
            <div>{offerAsk.text}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {offerAsk.rental
                ? "Would you like to fill out the rental form for these dates?"
                : "Would you like to build an offer for these dates?"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="primary"
                onClick={() =>
                  router.push(`${offerAsk.rental ? "/rentals/new" : "/offers/new"}?holds=${offerAsk.ids.join(",")}`)
                }
              >
                {offerAsk.rental ? "Yes, open rental form" : "Yes, build offer"}
              </button>
              <button
                onClick={() => {
                  setFlash({ text: offerAsk.text, email: offerAsk.email });
                  setOfferAsk(null);
                }}
              >
                No, back to calendar
              </button>
              <span className="spacer" />
              <CopyButton text={offerAsk.email} label="Copy holds for email" />
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => !pending && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="col-head">
              <h2>
                New hold · {selected.length} date{selected.length > 1 ? "s" : ""}
              </h2>
              <button onClick={() => setOpen(false)} disabled={pending} aria-label="Close">
                ✕
              </button>
            </div>

            <form action={formAction} className="modal-form">
              <label>
                Room
                <select name="room" value={room} onChange={(e) => setRoom(e.target.value)}>
                  {allRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="field-label">Dates</div>
                <div className="date-chips">
                  {sorted.map((d) => {
                    const rank = nextRank(stackFor(holds, room, d));
                    return (
                      <span key={d} className={rank === null ? "date-chip bad" : "date-chip"}>
                        <input type="hidden" name="date" value={d} />
                        {fmtDate(d, { year: undefined })}
                        <span className="muted"> · {rank === null ? "already confirmed" : `goes in at H${rank}`}</span>
                        <button type="button" className="x" onClick={() => toggle(d)} aria-label="Remove date">
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>

              <HoldFields />

              {state.error && <div className="flash error">{state.error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" disabled={pending || selected.length === 0}>
                  {pending ? "Placing…" : `Place ${selected.length} hold${selected.length > 1 ? "s" : ""}`}
                </button>
                <button type="button" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
