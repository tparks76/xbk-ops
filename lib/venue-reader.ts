// Reads upcoming events from a venue's own events page, without any API key.
// Tries, in order:
//   1. A calendar feed (.ics) — if the link itself is one
//   2. Standard event data embedded in the page (schema.org JSON-LD, which
//      ticketing platforms and website builders add so Google can list shows)
//   3. Squarespace event pages (?format=json)
//   4. WordPress "The Events Calendar" (its public events feed)
//   5. A calendar-feed link (.ics / iCal / webcal) found on the page
// Pure parsing helpers are exported for tests.

export type VenueEvent = { uid: string; title: string; date: string; time?: string; url?: string };
export type ReadResult = { events: VenueEvent[]; method: string };

const TZ = "America/Chicago";
const UA = "Mozilla/5.0 (compatible; xBkOps/1.0; +https://www.xbklive.com)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Local (Des Moines) date and HH:MM for an instant.
function localParts(d: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${hour}:${g("minute")}` };
}

// "2026-11-20", "2026-11-20T19:30:00-06:00", "2026-11-20T19:30", "2026-11-21T01:30:00Z", epoch ms
export function parseWhen(v: unknown): { date: string; time?: string } | null {
  if (typeof v === "number" && Number.isFinite(v)) return localParts(new Date(v));
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (m) return { date: m[1] };
  // Ends in Z: convert to Des Moines time.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : localParts(d);
  }
  // Local time as written (with or without an offset): keep the venue's own date/time.
  m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return { date: m[1], time: m[2] };
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : localParts(d);
}

// ---------------------------------------------------------------------------
// ICS
// ---------------------------------------------------------------------------

export function parseICS(text: string): VenueEvent[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: VenueEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) {
        const start = cur["DTSTART"];
        const when = start ? icsWhen(start.params, start.value) : null;
        const title = cur["SUMMARY"] ? unescapeIcs(cur["SUMMARY"].value) : "";
        if (when && title && cur["STATUS"]?.value !== "CANCELLED") {
          out.push({
            uid: cur["UID"]?.value ?? `${when.date}|${title}`,
            title,
            date: when.date,
            time: when.time,
            url: cur["URL"]?.value,
          });
        }
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i);
      const [name, ...params] = head.split(";");
      cur[name.toUpperCase()] = { params: params.join(";"), value: line.slice(i + 1) };
    }
  }
  return out;
}

function unescapeIcs(s: string) {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function icsWhen(params: string, value: string): { date: string; time?: string } | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}` };
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  if (m[7]) return localParts(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
  // Floating or TZID time: assume it's the venue's local time (Des Moines venues).
  void params;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org Event)
// ---------------------------------------------------------------------------

export function parseJsonLd(html: string): VenueEvent[] {
  const out: VenueEvent[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    walk(data, out);
  }
  return out;
}

function isEventType(t: unknown): boolean {
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === "string" && /Event$/i.test(x) && !/^(Organization|Place)$/i.test(x));
}

function walk(node: unknown, out: VenueEvent[], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  if (isEventType(o["@type"]) && o.startDate) {
    const when = parseWhen(o.startDate);
    const title = typeof o.name === "string" ? decodeEntities(o.name) : "";
    const status = String(o.eventStatus ?? "");
    if (when && title && !/Cancelled/i.test(status)) {
      const url = typeof o.url === "string" ? o.url : undefined;
      const id = typeof o["@id"] === "string" ? (o["@id"] as string) : typeof o.identifier === "string" ? o.identifier : undefined;
      out.push({ uid: id ?? url ?? `${when.date}|${title}`, title, date: when.date, time: when.time, url });
    }
  }
  for (const k of ["@graph", "itemListElement", "item", "event", "events", "subEvent"]) {
    if (o[k]) walk(o[k], out, depth + 1);
  }
}

// ---------------------------------------------------------------------------
// Squarespace & WordPress (The Events Calendar)
// ---------------------------------------------------------------------------

export function parseSquarespace(json: unknown, base: string): VenueEvent[] {
  const j = json as { upcoming?: unknown[]; items?: unknown[] };
  const list = (Array.isArray(j?.upcoming) ? j.upcoming : Array.isArray(j?.items) ? j.items : []) as Record<string, unknown>[];
  const out: VenueEvent[] = [];
  for (const e of list) {
    const when = parseWhen(e.startDate);
    const title = typeof e.title === "string" ? decodeEntities(e.title) : "";
    if (!when || !title) continue;
    const url = typeof e.fullUrl === "string" ? new URL(e.fullUrl, base).toString() : undefined;
    out.push({ uid: String(e.id ?? url ?? `${when.date}|${title}`), title, date: when.date, time: when.time, url });
  }
  return out;
}

export function parseTribe(json: unknown): VenueEvent[] {
  const list = ((json as { events?: unknown[] })?.events ?? []) as Record<string, unknown>[];
  const out: VenueEvent[] = [];
  for (const e of list) {
    const when = parseWhen(typeof e.start_date === "string" ? e.start_date.replace(" ", "T") : e.start_date);
    const title = typeof e.title === "string" ? decodeEntities(e.title) : "";
    if (!when || !title) continue;
    out.push({
      uid: String(e.id ?? e.url ?? `${when.date}|${title}`),
      title,
      date: when.date,
      time: e.all_day ? undefined : when.time,
      url: typeof e.url === "string" ? e.url : undefined,
    });
  }
  return out;
}

export function findIcsLink(html: string, base: string): string | null {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((x) => x[1].replace(/&amp;/g, "&"));
  const hit = hrefs.find((h) => /^webcal:/i.test(h) || /\.ics(\?|$)/i.test(h) || /[?&]ical=1/i.test(h));
  if (!hit) return null;
  try {
    return new URL(hit.replace(/^webcal:/i, "https:"), base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch + read
// ---------------------------------------------------------------------------

async function get(url: string, accept = "text/html,application/xhtml+xml,text/calendar,application/json;q=0.9,*/*;q=0.8") {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return { text: await res.text(), type: res.headers.get("content-type") ?? "" };
}

function upcoming(events: VenueEvent[]): VenueEvent[] {
  const today = localParts(new Date()).date;
  const seen = new Set<string>();
  return events
    .filter((e) => e.date >= today)
    .filter((e) => (seen.has(e.uid) ? false : (seen.add(e.uid), true)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

export async function readVenue(rawUrl: string): Promise<ReadResult> {
  const url = rawUrl.trim().replace(/^webcal:/i, "https:");
  const page = await get(url);

  if (/text\/calendar/i.test(page.type) || page.text.trimStart().startsWith("BEGIN:VCALENDAR")) {
    return { events: upcoming(parseICS(page.text)), method: "calendar feed" };
  }

  const fromLd = upcoming(parseJsonLd(page.text));
  if (fromLd.length) return { events: fromLd, method: "event data on page" };

  if (/squarespace/i.test(page.text)) {
    try {
      const u = new URL(url);
      u.searchParams.set("format", "json");
      const r = await get(u.toString(), "application/json");
      const ev = upcoming(parseSquarespace(JSON.parse(r.text), url));
      if (ev.length) return { events: ev, method: "Squarespace events" };
    } catch {
      /* try the next way */
    }
  }

  if (/tribe-events|the-events-calendar|wp-content/i.test(page.text)) {
    try {
      const origin = new URL(url).origin;
      const today = localParts(new Date()).date;
      const r = await get(`${origin}/wp-json/tribe/events/v1/events?per_page=100&start_date=${today}`, "application/json");
      const ev = upcoming(parseTribe(JSON.parse(r.text)));
      if (ev.length) return { events: ev, method: "WordPress events calendar" };
    } catch {
      /* try the next way */
    }
  }

  const ics = findIcsLink(page.text, url);
  if (ics) {
    try {
      const r = await get(ics, "text/calendar");
      const ev = upcoming(parseICS(r.text));
      if (ev.length) return { events: ev, method: "calendar feed linked on page" };
    } catch {
      /* fall through */
    }
  }

  return { events: [], method: "nothing readable found" };
}
