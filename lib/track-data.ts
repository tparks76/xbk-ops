import { eventimEvents, eventimOrders, eventimReady, eventimTicketTypes, type EventimEvent } from "@/lib/eventim";
import { capacityFrom, totalsFromOrders } from "@/lib/eventim-sales";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameScore, roomFor } from "@/lib/ticket-email";

const todayCentral = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const ids = (v: string | null | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

type HoldRow = { id: string; room_id: string; date: string; title: string; eventim_event_id: string | null };

// Link confirmed holds to their Eventim events: same date and room; with several holds that
// night, the closest name. Early and late shows that night both link to the one hold.
export function autoLinks(holds: HoldRow[], events: EventimEvent[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of events) {
    if (!e.date || !e.id) continue;
    const room = roomFor(e.venue) ?? "xbk";
    const same = holds.filter((h) => h.date === e.date && h.room_id === room);
    if (!same.length) continue;
    const best = same.length === 1 ? same[0] : same.map((h) => ({ h, s: nameScore(e.name, h.title) })).sort((a, b) => b.s - a.s)[0]?.h;
    if (best) out.set(best.id, [...(out.get(best.id) ?? []), e.id]);
  }
  return out;
}

// Import sales from Eventim for confirmed shows (all upcoming ones, or the holds given).
// Unlinked shows are linked by date and room first. One count per show per day is kept;
// the first import also fills in earlier days from the order dates, so the sales chart has history.
export async function importEventimSales(holdIds?: string[]): Promise<{ done: number; message: string }> {
  if (!eventimReady()) return { done: 0, message: "Eventim isn't connected yet (Settings → Ticketing)." };
  const db = createAdminClient();
  let q = db.from("holds").select("id,room_id,date,title,eventim_event_id").eq("status", "confirmed");
  if (holdIds?.length) q = q.in("id", holdIds);
  else q = q.gte("date", new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));
  const { data } = await q;
  const holds = (data ?? []) as HoldRow[];
  if (!holds.length) return { done: 0, message: "No confirmed shows to import." };

  // Link any that aren't linked yet.
  const unlinked = holds.filter((h) => !h.eventim_event_id);
  if (unlinked.length) {
    const links = autoLinks(unlinked, await eventimEvents());
    for (const [holdId, evIds] of links) {
      const v = evIds.join(",");
      await db.from("holds").update({ eventim_event_id: v }).eq("id", holdId);
      const h = holds.find((x) => x.id === holdId);
      if (h) h.eventim_event_id = v;
    }
  }

  const today = todayCentral();
  let done = 0;
  const problems: string[] = [];
  for (const h of holds.filter((x) => x.eventim_event_id)) {
    try {
      const evs = ids(h.eventim_event_id);
      const orders = (await Promise.all(evs.map((id) => eventimOrders(id)))).flat();
      const types = (await Promise.all(evs.map((id) => eventimTicketTypes(id).catch(() => [])))).flat();
      const t = totalsFromOrders(orders, types);
      const capacity = capacityFrom(types);

      // One count per earlier day with sales, worked out from the order dates (rewritten each
      // time, so a correction in Eventim, or in how tickets are counted, carries back).
      const history = t.byDay.filter((d) => d.day < today);
      const rows = [
        ...history.map((d) => ({
          hold_id: h.id,
          source: "eventim",
          sales_day: d.day,
          counted_at: `${d.day}T23:59:00-06:00`,
          sold: d.sold,
          comps: d.comps,
          gross: d.gross,
          tiers: [],
          capacity,
          created_by: "eventim",
          note: "From Eventim order dates",
        })),
        {
          hold_id: h.id,
          source: "eventim",
          sales_day: today,
          counted_at: new Date().toISOString(),
          sold: t.sold,
          comps: t.comps,
          gross: t.gross,
          tiers: t.tiers,
          capacity,
          created_by: "eventim",
          note:
            [evs.length > 1 ? `${evs.length} Eventim events` : "", t.addOns.sold ? `plus ${t.addOns.sold} add-on${t.addOns.sold > 1 ? "s" : ""} ($${t.addOns.gross.toFixed(2)}) not counted as tickets` : "",
             t.comps ? `$0 tickets: ${Object.entries(t.compsBy).map(([k, v]) => `${v} ${k}`).join(", ")}` : ""]
              .filter(Boolean)
              .join(" · ") || null,
        },
      ];
      const { error } = await db.from("ticket_counts").upsert(rows, { onConflict: "hold_id,sales_day", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      done++;
    } catch (e) {
      problems.push(`${h.title}: ${(e as Error).message}`);
    }
  }
  const notLinked = holds.filter((x) => !x.eventim_event_id).length;
  const parts = [
    done ? `Imported sales for ${done} show${done > 1 ? "s" : ""}.` : "",
    notLinked ? `${notLinked} confirmed show${notLinked > 1 ? "s" : ""} had no matching Eventim event.` : "",
    problems.length ? `Problems: ${problems.slice(0, 3).join(" · ")}` : "",
  ].filter(Boolean);
  return { done, message: parts.join(" ") || "Nothing to import." };
}
