import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Pulls music events within 25 miles of Des Moines from Ticketmaster for the
// next 12 months and keeps them as date notes (source "ticketmaster").
// Runs daily from Vercel Cron and from the "Sync now" button.

const DES_MOINES = "41.5868,-93.6250";
const RADIUS_MILES = "25";
const MONTHS_AHEAD = 12;
const OUR_VENUES = [/xbk/i, /1159 24th/i, /ideal dress/i]; // our own rooms aren't "outside" events

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  _embedded?: { venues?: { name?: string; address?: { line1?: string }; city?: { name?: string } }[] };
};

export type SyncResult = { found: number; saved: number; removed: number; complete: boolean; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return ` ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

async function fetchWindow(apikey: string, start: Date, end: Date): Promise<TmEvent[]> {
  const out: TmEvent[] = [];
  // Ticketmaster stops paging at 1,000 results, so we ask month by month.
  for (let page = 0; page < 5; page++) {
    const p = new URLSearchParams({
      apikey,
      latlong: DES_MOINES,
      radius: RADIUS_MILES,
      unit: "miles",
      classificationName: "music",
      startDateTime: iso(start),
      endDateTime: iso(end),
      size: "200",
      page: String(page),
      sort: "date,asc",
    });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${p}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Ticketmaster returned ${res.status}`);
    const json = await res.json();
    out.push(...((json?._embedded?.events ?? []) as TmEvent[]));
    const totalPages = json?.page?.totalPages ?? 0;
    if (page + 1 >= totalPages) break;
    await sleep(250); // stay under 5 requests a second
  }
  return out;
}

export async function syncEvents(): Promise<SyncResult> {
  const apikey = process.env.TICKETMASTER_API_KEY;
  if (!apikey) return { found: 0, saved: 0, removed: 0, complete: false, error: "TICKETMASTER_API_KEY is not set in Vercel." };

  const db = createAdminClient();
  const events = new Map<string, TmEvent>();
  const cancelled = new Set<string>();
  let complete = true;

  const now = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const start = i === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1) - 1000);
    try {
      for (const e of await fetchWindow(apikey, start, end)) {
        if (e.dates?.status?.code === "cancelled") cancelled.add(e.id);
        else events.set(e.id, e);
      }
    } catch (err) {
      complete = false;
      if (i === 0) return { found: 0, saved: 0, removed: 0, complete, error: String((err as Error).message ?? err) };
    }
    await sleep(250);
  }

  const rows = [...events.values()]
    .map((e) => {
      const v = e._embedded?.venues?.[0];
      const venue = v?.name ?? "";
      const where = `${venue} ${v?.address?.line1 ?? ""}`;
      return {
        date: e.dates?.start?.localDate ?? "",
        body: `${e.name}${venue ? ` @ ${venue}` : ""}${fmtTime(e.dates?.start?.localTime)}`,
        created_by: "auto",
        source: "ticketmaster",
        external_id: e.id,
        venue: venue || null,
        url: e.url ?? null,
        skip: OUR_VENUES.some((r) => r.test(where)),
      };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !r.skip)
    .map(({ skip: _skip, ...r }) => r);

  let saved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // New events are added; known ones get their date/name/venue refreshed.
    // A note someone hid stays hidden (hidden isn't sent).
    const { error } = await db.from("date_notes").upsert(chunk, { onConflict: "source,external_id" });
    if (error) return { found: events.size, saved, removed: 0, complete: false, error: error.message };
    saved += chunk.length;
  }

  // Remove notes for cancelled events, and (only after a complete sync) for
  // upcoming events that no longer appear in the listings at all.
  let removed = 0;
  if (cancelled.size) {
    const { data } = await db
      .from("date_notes")
      .delete()
      .eq("source", "ticketmaster")
      .in("external_id", [...cancelled])
      .select("id");
    removed += data?.length ?? 0;
  }
  if (complete) {
    const today = now.toISOString().slice(0, 10);
    const { data: existing } = await db
      .from("date_notes")
      .select("id,external_id")
      .eq("source", "ticketmaster")
      .gte("date", today);
    const kept = new Set(rows.map((r) => r.external_id));
    const gone = (existing ?? []).filter((n) => n.external_id && !kept.has(n.external_id)).map((n) => n.id);
    for (let i = 0; i < gone.length; i += 200) {
      const { data } = await db.from("date_notes").delete().in("id", gone.slice(i, i + 200)).select("id");
      removed += data?.length ?? 0;
    }
  }

  return { found: events.size, saved, removed, complete };
}
