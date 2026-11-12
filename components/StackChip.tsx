import type { Stack } from "@/lib/data";
import { ROOM_SHORT } from "@/lib/data";

// One-line summary of a room's holds on a date, for calendar cells.
export default function StackChip({
  room,
  stack,
  showRoom,
  full = false,
}: {
  room: string;
  stack: Stack;
  showRoom: boolean;
  full?: boolean;
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
  if (stack.active.length === 0) return null;

  const challenged = stack.active.some((h) => h.challenge_deadline);
  const list = full ? stack.active : stack.active.slice(0, 1);

  return (
    <>
      {list.map((h, i) => (
        <div
          key={h.id}
          className={[
            "chip",
            h.rank === 1 ? "h1" : "",
            h.status === "offer_out" ? "offer" : "",
            h.challenge_deadline || (challenged && !full && i === 0) ? "challenged" : "",
            h.kind === "rental" ? "rental" : "",
          ].join(" ")}
          title={stack.active.map((x) => `H${x.rank} ${x.title}`).join("\n")}
        >
          {i === 0 && label}H{h.rank} {h.title}
          {!full && stack.active.length > 1 && <span className="more">+{stack.active.length - 1}</span>}
        </div>
      ))}
    </>
  );
}
