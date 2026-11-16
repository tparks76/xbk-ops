// Eventim US (formerly See Tickets US) connection.
// The endpoint and headers are the ones Eventim's own WordPress plugin uses ("See Tickets Core API").
// Eventim hasn't published the rest of the API, so sales numbers are read from whatever the event
// data includes; Settings → Ticketing shows the raw data so the mapping can be checked.

const BASE = "https://prod-seetickets-core.seeticketsusa.us/api/v2";

export const eventimReady = () =>
  !!(process.env.EVENTIM_CLIENT_ID && process.env.EVENTIM_API_KEY && process.env.EVENTIM_API_SECRET);

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "api-key": process.env.EVENTIM_API_KEY ?? "",
      "api-secret": process.env.EVENTIM_API_SECRET ?? "",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Eventim answered ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Eventim's answer wasn't readable data.");
  }
}

// All events for the account, from `pastHours` ago onward (default: the last 90 days and everything ahead).
export async function eventimEventsRaw(pastHours = 2160): Promise<unknown> {
  return get(`/client/${encodeURIComponent(process.env.EVENTIM_CLIENT_ID ?? "")}/event?pastHours=${pastHours}`);
}

export type EventimEvent = { id: string; name: string; date: string | null; raw: Record<string, unknown> };

// Find the list of events in the answer, wherever it sits.
function findList(j: unknown): Record<string, unknown>[] {
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  if (j && typeof j === "object") {
    for (const k of ["events", "data", "items", "results", "event"]) {
      const v = (j as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object") {
        const inner = findList(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

export function normalizeEvents(j: unknown): EventimEvent[] {
  return findList(j).map((e) => {
    const id = pick(e, ["id", "eventid", "eventId", "event_id", "eventID", "uuid"]);
    const name = pick(e, ["title", "name", "eventName", "event_name", "headliners"]);
    const nested = (e.datesTimes as { date?: unknown } | undefined)?.date;
    const when = pick(e, ["eventStart", "date", "eventDate", "event_date", "startDate", "start_date", "startDateTime", "start", "showDate"]) ?? nested;
    const sort = typeof e.sortdate === "string" && /^\d{8}$/.test(e.sortdate) ? `${e.sortdate.slice(0, 4)}-${e.sortdate.slice(4, 6)}-${e.sortdate.slice(6)}` : null;
    // Eventim's times are the venue's local time written as UTC, so the date part is the show date.
    const date = sort ?? (typeof when === "string" ? (when.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null) : null);
    return { id: String(id ?? ""), name: String(name ?? "(no name)"), date, raw: e };
  });
}

export async function eventimEvents(): Promise<EventimEvent[]> {
  return normalizeEvents(await eventimEventsRaw());
}

// Sales numbers inside an event's data, if Eventim includes them (field names vary by API version).
export function salesFrom(raw: Record<string, unknown>): { sold: number; gross: number | null; comps: number | null } | null {
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  const sold = num(pick(raw, ["ticketsSold", "tickets_sold", "soldCount", "sold", "quantitySold", "totalSold", "total_sold"]));
  if (sold === null) return null;
  return {
    sold,
    gross: num(pick(raw, ["grossSales", "gross_sales", "gross", "faceValueTotal", "totalGross", "revenue"])),
    comps: num(pick(raw, ["comps", "compCount", "ticketsComped", "complimentary"])),
  };
}
