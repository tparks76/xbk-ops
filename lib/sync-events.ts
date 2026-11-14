import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readVenue } from "@/lib/venue-reader";

// Keeps outside music events on the calendar as date notes. Sources:
//   - Watched venues (Venues page): each venue's own events page, read daily.
//     Notes: source "venue", external_id "<venue id>:<event id>".
//   - Ticketmaster (optional; only if TICKETMASTER_API_KEY is set in Vercel):
//     music within 25 miles of Des Moines. Notes: source "ticketmaster".
// Runs daily from Vercel Cron and from the "Sync now" button.

const LAT = 41.5868;
const LNG = -93.625;
const RADIUS_MILES = 25;
const MONTHS_AHEAD = 12;
const OUR_VENUES = [/xbk/i, /1159 24th/i, /ideal dress/i]; // our own rooms aren't "outside" events

type Row = {
  date: string;
  body: string;
  created_by: string;
  source: string;
  external_id: string;
  venue: string | null;
  url: string | null;
};

export type VenueSync = { name: string; found: number; method?: string; error?: string };
export type SyncResult = {
  saved: number;
  removed: number;
  error?: string;
  ticketmaster?: { found: number; error?: string };
  venues: VenueSync[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
const showKey = (date: string, headliner: string) => `${date}|${norm(headliner).slice(0, 10)}`;

function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  const ap = h >= 12 ? "PM" : "AM";
  return ` ${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${ap}`;
}

// ---------------------------------------------------------------------------
// Ticketmaster (optional)
// ---------------------------------------------------------------------------

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  _embedded?: { venues?: { name?: string; address?: { line1?: string } }[]; attractions?: { name?: string }[] };
};

async function ticketmaster(apikey: string) {
  const events = new Map<string, TmEvent>();
  const cancelled = new Set<string>();
  let complete = true;
  const now = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const start = i === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1) - 1000);
    try {
      for (let page = 0; page < 5; page++) {
        const p = new URLSearchParams({
          apikey,
          latlong: `${LAT},${LNG}`,
          radius: String(RADIUS_MILES),
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
        for (const e of (json?._embedded?.events ?? []) as TmEvent[]) {
          if (e.dates?.status?.code === "cancelled") cancelled.add(e.id);
          else events.set(e.id, e);
        }
        if (page + 1 >= (json?.page?.totalPages ?? 0)) break;
        await sleep(250);
      }
    } catch (err) {
      complete = false;
      if (i === 0) return { rows: [] as Row[], keys: new Set<string>(), cancelled: [], complete, error: (err as Error).message };
    }
    await sleep(250);
  }
  const rows: Row[] = [];
  const keys = new Set<string>();
  for (const e of events.values()) {
    const v = e._embedded?.venues?.[0];
    const venue = v?.name ?? "";
    const date = e.dates?.start?.localDate ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || OUR_VENUES.some((r) => r.test(`${venue} ${v?.address?.line1 ?? ""}`))) continue;
    rows.push({
      date,
      body: `${e.name}${venue ? ` @ ${venue}` : ""}${fmtTime(e.dates?.start?.localTime)}`,
      created_by: "auto",
      source: "ticketmaster",
      external_id: e.id,
      venue: venue || null,
      url: e.url ?? null,
    });
    keys.add(showKey(date, e._embedded?.attractions?.[0]?.name ?? e.name));
    keys.add(showKey(date, e.name));
  }
  return { rows, keys, cancelled: [...cancelled], complete };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createAdminClient>;

async function upsert(db: Db, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    // New events are added; known ones refreshed. Hidden notes stay hidden.
    const { error } = await db.from("date_notes").upsert(rows.slice(i, i + 500), { onConflict: "source,external_id" });
    if (error) throw new Error(error.message);
  }
}

// Delete upcoming notes from this source (and id prefix) that weren't seen this time.
async function removeMissing(db: Db, source: string, keep: Set<string>, prefix?: string) {
  let q = db.from("date_notes").select("id,external_id").eq("source", source).gte("date", ymd(new Date()));
  if (prefix) q = q.like("external_id", `${prefix}%`);
  const { data } = await q;
  const gone = (data ?? []).filter((n) => n.external_id && !keep.has(n.external_id)).map((n) => n.id);
  let removed = 0;
  for (let i = 0; i < gone.length; i += 200) {
    const { data: d } = await db.from("date_notes").delete().in("id", gone.slice(i, i + 200)).select("id");
    removed += d?.length ?? 0;
  }
  return removed;
}

export function splitWords(s: string): string[] {
  return s
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function syncEvents(): Promise<SyncResult> {
  const db = createAdminClient();
  const out: SyncResult = { saved: 0, removed: 0, venues: [] };
  const errors: string[] = [];

  // Optional Ticketmaster first, so venue events it already lists aren't doubled.
  let tmKeys = new Set<string>();
  const tmKey = process.env.TICKETMASTER_API_KEY;
  if (tmKey) {
    const r = await ticketmaster(tmKey);
    out.ticketmaster = { found: r.rows.length, error: r.error };
    if (r.error) errors.push(`Ticketmaster: ${r.error}`);
    else {
      tmKeys = r.keys;
      try {
        await upsert(db, r.rows);
        out.saved += r.rows.length;
        if (r.cancelled.length) {
          const { data } = await db.from("date_notes").delete().eq("source", "ticketmaster").in("external_id", r.cancelled).select("id");
          out.removed += data?.length ?? 0;
        }
        if (r.complete) out.removed += await removeMissing(db, "ticketmaster", new Set(r.rows.map((x) => x.external_id)));
      } catch (e) {
        errors.push(`Ticketmaster: ${(e as Error).message}`);
      }
    }
  }

  // Watched venues.
  const { data: venues, error: vErr } = await db.from("watched_venues").select("*").eq("active", true).order("name");
  if (vErr) errors.push(`Venues list: ${vErr.message}`);
  for (const v of (venues ?? []) as { id: string; name: string; url: string; ignore_words: string }[]) {
    const status: VenueSync = { name: v.name, found: 0 };
    try {
      const { events, method } = await readVenue(v.url);
      const skip = splitWords(v.ignore_words);
      const rows: Row[] = events
        .filter((e) => !skip.some((w) => e.title.toLowerCase().includes(w)))
        .filter((e) => !tmKeys.has(showKey(e.date, e.title)))
        .map((e) => ({
          date: e.date,
          body: `${e.title} @ ${v.name}${fmtTime(e.time)}`,
          created_by: "auto",
          source: "venue",
          external_id: `${v.id}:${e.uid}`.slice(0, 500),
          venue: v.name,
          url: e.url ?? null,
        }));
      await upsert(db, rows);
      out.saved += rows.length;
      // Only clear out dropped shows when the page was actually read.
      if (events.length > 0) out.removed += await removeMissing(db, "venue", new Set(rows.map((r) => r.external_id)), `${v.id}:`);
      status.found = rows.length;
      status.method = method;
      await db
        .from("watched_venues")
        .update({ last_checked: new Date().toISOString(), last_found: rows.length, last_method: method, last_error: null })
        .eq("id", v.id);
    } catch (e) {
      status.error = (e as Error).message;
      await db
        .from("watched_venues")
        .update({ last_checked: new Date().toISOString(), last_error: status.error })
        .eq("id", v.id);
    }
    out.venues.push(status);
  }

  if (!tmKey && (venues ?? []).length === 0 && !vErr) errors.push("No venues to watch yet. Add some on the Venues page.");
  if (errors.length) out.error = errors.join("; ");
  return out;
}
