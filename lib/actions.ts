"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidISO } from "@/lib/dates";

// Every action posts back to the page it came from ("returnTo"),
// with ?error=... if the database refused the change.

function back(form: FormData, params: Record<string, string> = {}): never {
  let to = String(form.get("returnTo") || "/");
  if (!to.startsWith("/") || to.startsWith("//")) to = "/";
  const url = new URL(to, "http://x");
  url.searchParams.delete("error");
  url.searchParams.delete("released");
  url.searchParams.delete("ok");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  redirect(url.pathname + url.search);
}

function cleanError(message: string): string {
  return message.replace(/^.*?ERROR:\s*/i, "").slice(0, 300);
}

async function rpc(form: FormData, fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) back(form, { error: cleanError(error.message) });
  revalidatePath("/", "layout");
  return data;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function placeHolds(form: FormData) {
  const room = str(form, "room");
  const dates = form
    .getAll("date")
    .map((d) => String(d).trim())
    .filter(Boolean);
  if (dates.length === 0 || !dates.every(isValidISO)) {
    back(form, { error: "Pick at least one valid date." });
  }
  await rpc(form, "place_holds", {
    p_room: room,
    p_dates: dates,
    p_title: str(form, "title"),
    p_kind: str(form, "kind") === "rental" ? "rental" : "show",
    p_agent_name: str(form, "agent_name"),
    p_agent_company: str(form, "agent_company"),
    p_agent_email: str(form, "agent_email"),
    p_notes: str(form, "notes"),
  });
  const sorted = [...dates].sort();
  redirect(`/day/${sorted[0]}?ok=${encodeURIComponent(`Hold placed on ${dates.length} date(s).`)}`);
}

export type CalendarHoldState = { error?: string; ok?: string; done?: number };

// Used by the "Hold these dates" window on the calendar: returns a message
// instead of leaving the page, so the window can show errors in place.
export async function placeHoldsFromCalendar(
  prev: CalendarHoldState,
  form: FormData,
): Promise<CalendarHoldState> {
  const dates = form
    .getAll("date")
    .map((d) => String(d).trim())
    .filter(Boolean);
  if (dates.length === 0 || !dates.every(isValidISO)) {
    return { error: "Pick at least one date on the calendar." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("place_holds", {
    p_room: str(form, "room"),
    p_dates: dates,
    p_title: str(form, "title"),
    p_kind: str(form, "kind") === "rental" ? "rental" : "show",
    p_agent_name: str(form, "agent_name"),
    p_agent_company: str(form, "agent_company"),
    p_agent_email: str(form, "agent_email"),
    p_notes: str(form, "notes"),
  });
  if (error) return { error: cleanError(error.message) };
  revalidatePath("/", "layout");
  return {
    ok: `${str(form, "title")}: held on ${dates.length} date${dates.length > 1 ? "s" : ""}.`,
    done: (prev.done ?? 0) + 1,
  };
}

export async function moveHold(form: FormData) {
  await rpc(form, "move_hold", { p_id: str(form, "id"), p_rank: Number(str(form, "rank")) });
  back(form);
}

export async function setOfferOut(form: FormData) {
  await rpc(form, "set_offer_out", { p_id: str(form, "id"), p_out: str(form, "out") === "1" });
  back(form);
}

export async function challengeHolds(form: FormData) {
  const hours = Number(str(form, "hours") || 48);
  await rpc(form, "challenge", { p_challenger: str(form, "id"), p_hours: hours });
  back(form, { ok: `Challenge started: ${hours} hours to respond.` });
}

export async function cancelChallenge(form: FormData) {
  await rpc(form, "cancel_challenge", { p_challenger: str(form, "id") });
  back(form, { ok: "Challenge withdrawn." });
}

export async function releaseHold(form: FormData) {
  await rpc(form, "release_hold", { p_id: str(form, "id"), p_reason: str(form, "reason") });
  back(form, { ok: "Released." });
}

export async function confirmHold(form: FormData) {
  const released = (await rpc(form, "confirm_hold", { p_id: str(form, "id") })) as
    | { title: string; agent_name: string | null; agent_email: string | null }[]
    | null;
  const names = (released ?? [])
    .map((h) => h.title + (h.agent_name ? ` (${h.agent_name})` : ""))
    .join("; ");
  back(form, names ? { ok: "Confirmed.", released: names } : { ok: "Confirmed." });
}

export async function updateHold(form: FormData) {
  await rpc(form, "update_hold", {
    p_id: str(form, "id"),
    p_title: str(form, "title"),
    p_kind: str(form, "kind") === "rental" ? "rental" : "show",
    p_agent_name: str(form, "agent_name"),
    p_agent_company: str(form, "agent_company"),
    p_agent_email: str(form, "agent_email"),
    p_notes: str(form, "notes"),
  });
  back(form, { ok: "Saved." });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
