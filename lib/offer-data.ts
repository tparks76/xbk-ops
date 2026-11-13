import { fmtDate } from "@/lib/dates";
import { ROOM_SHORT } from "@/lib/stack";
import { createClient } from "@/lib/supabase/server";
import type { Hold } from "@/lib/types";

export const ROOM_FULL: Record<string, string> = { xbk: "xBk", annex: "The Annex", idc: "Ideal Dress Club" };

export async function holdsByIds(ids: string[]): Promise<Hold[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("holds").select("*").in("id", ids).order("date");
  return (data ?? []) as Hold[];
}

export function holdLine(h: Hold) {
  const status = h.status === "confirmed" ? "Confirmed" : h.status === "released" ? "Released" : `H${h.rank}`;
  return {
    id: h.id,
    label: `${fmtDate(h.date)} · ${ROOM_SHORT[h.room_id] ?? h.room_id} · ${status}`,
    released: h.status === "released",
  };
}
