import { eventimEvents, eventimReady, salesFrom } from "@/lib/eventim";
import { createAdminClient } from "@/lib/supabase/admin";

// Import today's sales from Eventim for shows linked to an Eventim event.
export async function importEventimSales(holdIds?: string[]): Promise<{ done: number; message: string }> {
  if (!eventimReady()) return { done: 0, message: "Eventim isn't connected yet (Settings → Ticketing)." };
  const db = createAdminClient();
  let q = db.from("holds").select("id,eventim_event_id,date").not("eventim_event_id", "is", null).eq("status", "confirmed");
  if (holdIds?.length) q = q.in("id", holdIds);
  else q = q.gte("date", new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));
  const { data: holds } = await q;
  const list = (holds ?? []) as { id: string; eventim_event_id: string }[];
  if (!list.length) return { done: 0, message: "No shows are linked to an Eventim event yet." };

  const events = await eventimEvents();
  let done = 0;
  const missing: string[] = [];
  for (const h of list) {
    const ev = events.find((e) => e.id === h.eventim_event_id);
    const s = ev ? salesFrom(ev.raw) : null;
    if (!s) {
      missing.push(h.eventim_event_id);
      continue;
    }
    await db.from("ticket_counts").insert({
      hold_id: h.id,
      source: "eventim",
      sold: Math.round(s.sold),
      gross: s.gross ?? 0,
      comps: s.comps ?? 0,
      tiers: [],
      created_by: "eventim",
    });
    done++;
  }
  return {
    done,
    message: done
      ? `Imported sales for ${done} show${done > 1 ? "s" : ""}.${missing.length ? ` ${missing.length} had no sales numbers in Eventim's data.` : ""}`
      : "Eventim's event listing doesn't include ticket sales, so there's nothing to import yet. Sales import turns on once Eventim gives sales access for your API credentials. Until then, use Add today's count.",
  };
}
