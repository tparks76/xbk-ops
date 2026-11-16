// Eventim US (formerly See Tickets US) "Listing API" (Core API v2), from Eventim's OpenAPI document:
//   GET /api/v2/client/{clientId}/event                  events
//   GET /api/v2/client/{clientId}/event/{eventId}/sales   orders and tickets for an event
//   GET /api/v2/event/{eventId}/tickettype                ticket types (allotment = capacity)
// Auth: "api-key" and "api-secret" headers.

import type { EvOrder, EvTicketType } from "@/lib/eventim-sales";

const BASE = "https://prod-seetickets-core.seeticketsusa.us/api/v2";

export const eventimReady = () =>
  !!(process.env.EVENTIM_CLIENT_ID && process.env.EVENTIM_API_KEY && process.env.EVENTIM_API_SECRET);

async function get(path: string): Promise<unknown> {
  return (await getWithHeaders(path)).body;
}

async function getWithHeaders(path: string): Promise<{ body: unknown; headers: Headers }> {
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
  if (res.status === 403) throw new Error("Eventim says these API credentials don't have permission for this (ask Eventim to enable it)");
  if (!res.ok) throw new Error(`Eventim answered ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  try {
    return { body: JSON.parse(text), headers: res.headers };
  } catch {
    throw new Error("Eventim's answer wasn't readable data.");
  }
}

// Every order for an event (100 per page; follows the page cursor).
export async function eventimOrders(eventId: string): Promise<EvOrder[]> {
  const client = encodeURIComponent(process.env.EVENTIM_CLIENT_ID ?? "");
  const all: EvOrder[] = [];
  let token: string | null = null;
  for (let page = 0; page < 200; page++) {
    const q = new URLSearchParams({ pageSize: "100", startDate: "2015-01-01", ignoreLyteOrders: "true" });
    if (token) q.set("continuationToken", token);
    const { body, headers } = await getWithHeaders(`/client/${client}/event/${encodeURIComponent(eventId)}/sales?${q}`);
    const b = body as Record<string, unknown> | EvOrder[];
    const list = Array.isArray(b) ? b : ((b.orders ?? b.data ?? b.items ?? b.results ?? []) as EvOrder[]);
    all.push(...list);
    const next =
      (!Array.isArray(b) && (b.continuationToken ?? b.nextContinuationToken ?? (b.pagination as Record<string, unknown> | undefined)?.continuationToken)) ||
      headers.get("continuationtoken") ||
      headers.get("x-continuation-token");
    if (!next || list.length === 0 || next === token) break;
    token = String(next);
  }
  return all;
}

export async function eventimTicketTypes(eventId: string): Promise<EvTicketType[]> {
  const b = await get(`/event/${encodeURIComponent(eventId)}/tickettype`);
  return Array.isArray(b) ? (b as EvTicketType[]) : [];
}

// All events for the account, from `pastHours` ago onward (default: the last 90 days and everything ahead).
export async function eventimEventsRaw(pastHours = 2160): Promise<unknown> {
  return get(`/client/${encodeURIComponent(process.env.EVENTIM_CLIENT_ID ?? "")}/event?pastHours=${pastHours}`);
}

export type EventimEvent = { id: string; name: string; date: string | null; venue: string; raw: Record<string, unknown> };

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
    return { id: String(id ?? ""), name: String(name ?? "(no name)"), date, venue: String(e.venue ?? ""), raw: e };
  });
}

export async function eventimEvents(): Promise<EventimEvent[]> {
  return normalizeEvents(await eventimEventsRaw());
}
