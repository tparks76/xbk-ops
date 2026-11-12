import { createClient } from "@/lib/supabase/server";
import type { Hold, Room } from "@/lib/types";

export const ROOM_SHORT: Record<string, string> = { xbk: "xBk", annex: "Annex", idc: "IDC" };

export async function getRooms(): Promise<Room[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("rooms").select("*").order("sort");
  return (data ?? []) as Room[];
}

// Active and confirmed holds between two dates (inclusive).
export async function getHolds(from: string, to: string): Promise<Hold[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("holds")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .neq("status", "released")
    .order("date")
    .order("rank", { nullsFirst: true });
  return (data ?? []) as Hold[];
}

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
