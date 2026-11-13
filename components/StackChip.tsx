import type { Stack } from "@/lib/stack";
import { ROOM_SHORT } from "@/lib/stack";

// A room's holds on a date for calendar cells: one line per hold, in rank order.
export default function StackChip({
  room,
  stack,
  showRoom,
}: {
  room: string;
  stack: Stack;
  showRoom: boolean;
}) {
  const label = showRoom ? <span className="room">{ROOM_SHORT[room] ?? room}</span> : null;

  if (stack.confirmed) {
    const h = stack.confirmed;
    return (
      <div className={`chip confirmed ${h.kind === "rental" ? "rental" : ""}`} title={h.title}>
        {label}✓ {h.title}
      </div>
    );
  }

  return (
    <>
      {stack.active.map((h) => (
        <div
          key={h.id}
          className={[
            "chip",
            h.rank === 1 ? "h1" : "",
            h.status === "offer_out" ? "offer" : "",
            h.challenge_deadline ? "challenged" : "",
            h.kind === "rental" ? "rental" : "",
          ].join(" ")}
          title={`H${h.rank} ${h.title}${h.agent_name ? ` — ${h.agent_name}` : ""}`}
        >
          {label}H{h.rank} {h.title}
        </div>
      ))}
    </>
  );
}
