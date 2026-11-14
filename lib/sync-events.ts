import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Pulls music events within 25 miles of Des Moines for the next 12 months
// and keeps them as date notes. Two sources, each used only if its key is set:
//   - Ticketmaster (TICKETMASTER_API_KEY), source "ticketmaster"
//   - JamBase (JAMBASE_API_KEY), source "jambase"; shows Ticketmaster already
//     listed (same date, venue and headliner) are skipped so nothing doubles up.
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

type SourceResult = { rows: Row[]; cancelled: string[]; complete: boolean; error?: string; matchKeys?: string[] };

export type SyncResult = {
  found: number;
  saved: number;
  removed: number;
  complete: boolean;
  error?: string;
  sources: Record<string, { found: number; error?: string; skippedDupes?: number }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
// Same show from two sources: same date, venue and the start of the headliner's name.
const showKey = (date: string, venue: string, headliner: string) =>
  `${date}|${norm(venue).slice(0, 12)}|${norm(headliner).slice(0, 8)}`;

function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  const ap = h >= 12 ? "PM" : "AM";
  return ` ${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${ap}`;
}

const isOurs = (venue: string, address = "") => OUR_VENUES.some((r) => r.test(`${venue} ${address}`));

// ---------------------------------------------------------------------------
// Ticketmaster
// ---------------------------------------------------------------------------

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  _embedded?: {
    venues?: { name?: string; address?: { line1?: string } }[];
    attractions?: { name?: string }[];
  };
};

async function ticketmaster(apikey: string): Promise<SourceResult> {
  const events = new Map<string, TmEvent>();
  const cancelled = new Set<string>();
  let complete = true;
  const now = new Date();

  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const start = i === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1) - 1000);
    try {
      // Ticketmaster stops paging at 1,000 results, so we ask month by month.
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
        await sleep(250); // stay under 5 requests a second
      }
    } catch (err) {
      complete = false;
      if (i === 0) return { rows: [], cancelled: [], complete, error: (err as Error).message };
    }
    await sleep(250);
  }

  const rows: Row[] = [];
  const matchKeys: string[] = [];
  for (const e of events.values()) {
    const v = e._embedded?.venues?.[0];
    const venue = v?.name ?? "";
    const date = e.dates?.start?.localDate ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isOurs(venue, v?.address?.line1)) continue;
    rows.push({
      date,
      body: `${e.name}${venue ? ` @ ${venue}` : ""}${fmtTime(e.dates?.start?.localTime)}`,
      created_by: "auto",
      source: "ticketmaster",
      external_id: e.id,
      venue: venue || null,
      url: e.url ?? null,
    });
    const headliner = e._embedded?.attractions?.[0]?.name ?? e.name;
    matchKeys.push(showKey(date, venue, headliner), showKey(date, venue, e.name));
  }
  return { rows, cancelled: [...cancelled], complete, matchKeys };
}

// ---------------------------------------------------------------------------
// JamBase
// ---------------------------------------------------------------------------

type JbEvent = {
  identifier: string;
  name: string;
  url?: string;
  startDate?: string; // local time, no offset
  eventStatus?: string;
  location?: { name?: string; address?: { streetAddress?: string } };
  performer?: { name?: string; "x-isHeadliner"?: boolean }[];
};

async function jambase(apikey: string): Promise<SourceResult> {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + MONTHS_AHEAD, now.getUTCDate()));
  const events = new Map<string, JbEvent>();
  const cancelled = new Set<string>();

  for (let page = 1; page <= 30; page++) {
    const p = new URLSearchParams({
      geoLatitude: String(LAT),
      geoLongitude: String(LNG),
      geoRadiusAmount: String(RADIUS_MILES),
      geoRadiusUnits: "mi",
      eventDateFrom: ymd(now),
      eventDateTo: ymd(to),
      perPage: "100",
      page: String(page),
    });
    const res = await fetch(`https://api.data.jambase.com/v3/events?${p}`, {
      headers: { Authorization: `Bearer ${apikey}` },
      cache: "no-store",
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 5);
      await sleep(Math.min(30, wait) * 1000);
      page--;
      continue;
    }
    if (!res.ok) {
      return { rows: [], cancelled: [], complete: false, error: `JamBase returned ${res.status}` };
    }
    const json = await res.json();
    for (const e of (json?.events ?? []) as JbEvent[]) {
      if (!e?.identifier) continue;
      if (e.eventStatus === "cancelled") cancelled.add(e.identifier);
      else events.set(e.identifier, e);
    }
    const totalPages = json?.pagination?.totalPages ?? 1;
    if (page >= totalPages) break;
    await sleep(300);
  }

  const rows: Row[] = [];
  const keys: string[] = [];
  for (const e of events.values()) {
    const venue = e.location?.name ?? "";
    const date = (e.startDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isOurs(venue, e.location?.address?.streetAddress)) continue;
    const headliner = e.performer?.find((x) => x["x-isHeadliner"])?.name ?? e.performer?.[0]?.name ?? e.name;
    rows.push({
      date,
      body: `${headliner}${venue ? ` @ ${venue}` : ""}${fmtTime((e.startDate ?? "").slice(11, 16))}`,
      created_by: "auto",
      source: "jambase",
      external_id: e.identifier,
      venue: venue || null,
      url: e.url ?? null,
    });
    keys.push(showKey(date, venue, headliner));
  }
  return { rows, cancelled: [...cancelled], complete: true, matchKeys: keys };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function save(source: string, r: SourceResult) {
  const db = createAdminClient();
  let saved = 0;
  for (let i = 0; i < r.rows.length; i += 500) {
    // New events are added; known ones get their date/name/venue refreshed.
    // A note someone hid stays hidden (hidden isn't sent).
    const { error } = await db.from("date_notes").upsert(r.rows.slice(i, i + 500), { onConflict: "source,external_id" });
    if (error) return { saved, removed: 0, error: error.message };
    saved += Math.min(500, r.rows.length - i);
  }

  // Remove notes for cancelled events, and (only after a complete read) for
  // upcoming events that no longer appear in this source at all.
  let removed = 0;
  if (r.cancelled.length) {
    const { data } = await db.from("date_notes").delete().eq("source", source).in("external_id", r.cancelled).select("id");
    removed += data?.length ?? 0;
  }
  if (r.complete) {
    const { data: existing } = await db
      .from("date_notes")
      .select("id,external_id")
      .eq("source", source)
      .gte("date", ymd(new Date()));
    const kept = new Set(r.rows.map((x) => x.external_id));
    const gone = (existing ?? []).filter((n) => n.external_id && !kept.has(n.external_id)).map((n) => n.id);
    for (let i = 0; i < gone.length; i += 200) {
      const { data } = await db.from("date_notes").delete().in("id", gone.slice(i, i + 200)).select("id");
      removed += data?.length ?? 0;
    }
  }
  return { saved, removed };
}

export async function syncEvents(): Promise<SyncResult> {
  const tmKey = process.env.TICKETMASTER_API_KEY;
  const jbKey = process.env.JAMBASE_API_KEY;
  const out: SyncResult = { found: 0, saved: 0, removed: 0, complete: true, sources: {} };
  if (!tmKey && !jbKey) {
    return { ...out, complete: false, error: "No event source is set up. Add TICKETMASTER_API_KEY or JAMBASE_API_KEY in Vercel." };
  }

  const errors: string[] = [];
  let tmKeys = new Set<string>();

  if (tmKey) {
    const r = await ticketmaster(tmKey);
    out.sources.ticketmaster = { found: r.rows.length, error: r.error };
    if (r.error) errors.push(r.error);
    else {
      tmKeys = new Set(r.matchKeys);
      const s = await save("ticketmaster", r);
      out.saved += s.saved;
      out.removed += s.removed;
      if (s.error) errors.push(s.error);
    }
    out.found += r.rows.length;
    out.complete &&= r.complete;
  }

  if (jbKey) {
    const r = await jambase(jbKey);
    if (r.error) {
      errors.push(r.error);
      out.sources.jambase = { found: 0, error: r.error };
      out.complete = false;
    } else {
      // Skip shows Ticketmaster already listed.
      const before = r.rows.length;
      const keep = r.rows.filter((_, i) => !tmKeys.has(r.matchKeys![i]));
      const deduped = { ...r, rows: keep };
      out.sources.jambase = { found: before, skippedDupes: before - keep.length };
      const s = await save("jambase", deduped);
      out.found += keep.length;
      out.saved += s.saved;
      out.removed += s.removed;
      if (s.error) errors.push(s.error);
    }
  }

  if (errors.length) out.error = errors.join("; ");
  return out;
}
