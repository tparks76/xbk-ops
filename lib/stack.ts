// Pure helpers shared by server and browser code (no database access here).
import type { Hold } from "@/lib/types";

export const ROOM_SHORT: Record<string, string> = { xbk: "xBk", annex: "Annex", idc: "IDC" };

// Calendar colors: holds are outlined in the room color, confirmed dates are filled.
export const ROOM_COLOR: Record<string, string> = {
  xbk: "#c62828", // red
  annex: "#2e7d32", // green
  idc: "#1565c0", // blue
};

export type Stack = {
  confirmed: Hold | null;
  active: Hold[]; // in rank order
};

export function stackFor(holds: Hold[], room: string, date: string): Stack {
  const here = holds.filter((h) => h.room_id === room && h.date === date);
  return {
    confirmed: here.find((h) => h.status === "confirmed") ?? null,
    active: here
      .filter((h) => h.status === "hold" || h.status === "offer_out")
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
  };
}

// The rank a new hold would get on this room/date, or null if the date is confirmed.
export function nextRank(stack: Stack): number | null {
  if (stack.confirmed) return null;
  const max = Math.max(1, ...stack.active.map((h) => h.rank ?? 0));
  return Math.max(2, max + 1);
}

const ROOM_NAME: Record<string, string> = { xbk: "xBk", annex: "The Annex", idc: "Ideal Dress Club" };

export type EmailHold = {
  date: string;
  room_id: string;
  rank: number | null;
  status: string;
};

// Plain text listing an artist's held dates and hold numbers, ready to paste into an email.
export function holdsEmailText(title: string, rows: EmailHold[]): string {
  const live = rows
    .filter((r) => r.status !== "released")
    .sort((a, b) => a.date.localeCompare(b.date) || a.room_id.localeCompare(b.room_id));
  if (live.length === 0) return "";
  const rooms = [...new Set(live.map((r) => r.room_id))];
  const one = rooms.length === 1;
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  const status = (r: EmailHold) => (r.status === "confirmed" ? "Confirmed" : `H${r.rank}`);
  const header = one ? `${title} — holds at ${ROOM_NAME[rooms[0]] ?? rooms[0]}:` : `${title} — holds:`;
  const lines = live.map((r) =>
    one ? `• ${fmt(r.date)} — ${status(r)}` : `• ${fmt(r.date)} — ${ROOM_NAME[r.room_id] ?? r.room_id} — ${status(r)}`,
  );
  return [header, ...lines].join("\n");
}
