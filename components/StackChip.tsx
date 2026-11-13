"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Stack } from "@/lib/stack";
import { ROOM_COLOR, ROOM_SHORT } from "@/lib/stack";

// A room's holds on a date for calendar cells: one line per hold, in rank order.
// Holds are outlined in the room's color; a confirmed date is filled solid.
// Clicking a hold opens its day page, scrolled to that hold.
export default function StackChip({
  room,
  date,
  stack,
  showRoom,
}: {
  room: string;
  date: string;
  stack: Stack;
  showRoom: boolean;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation(); // don't also select the day
  const style = { ["--room" as string]: ROOM_COLOR[room] ?? "#555" } as CSSProperties;
  const label = showRoom ? <span className="room">{ROOM_SHORT[room] ?? room}</span> : null;

  if (stack.confirmed) {
    const h = stack.confirmed;
    return (
      <Link
        href={`/day/${date}#hold-${h.id}`}
        onClick={stop}
        className="chip confirmed"
        style={style}
        title={`Confirmed: ${h.title}`}
      >
        {label}✓ {h.title}
        {h.kind === "rental" && <span className="tag">Rental</span>}
      </Link>
    );
  }

  return (
    <>
      {stack.active.map((h) => (
        <Link
          key={h.id}
          href={`/day/${date}#hold-${h.id}`}
          onClick={stop}
          style={style}
          className={["chip", h.rank === 1 ? "h1" : ""].join(" ")}
          title={`H${h.rank} ${h.title}${h.agent_name ? ` — ${h.agent_name}` : ""}${
            h.status === "offer_out" ? " · offer out" : ""
          }${h.challenge_deadline ? " · challenge running" : ""}`}
        >
          {label}
          {h.challenge_deadline && <span aria-label="Challenge running">⏱ </span>}
          H{h.rank} {h.title}
          {h.status === "offer_out" && <span className="tag">Offer</span>}
          {h.kind === "rental" && <span className="tag">Rental</span>}
        </Link>
      ))}
    </>
  );
}
