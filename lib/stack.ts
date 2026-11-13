// Pure helpers shared by server and browser code (no database access here).
import type { Hold } from "@/lib/types";

export const ROOM_SHORT: Record<string, string> = { xbk: "xBk", annex: "Annex", idc: "IDC" };

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
