import { createClient } from "@/lib/supabase/server";
import type { Hold, Room } from "@/lib/types";

export { ROOM_SHORT, stackFor, type Stack } from "@/lib/stack";

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
