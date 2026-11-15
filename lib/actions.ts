"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidISO } from "@/lib/dates";
import { normalizeTerms } from "@/lib/offer";
import { normalizeDetails, rentalProblems } from "@/lib/rental";
import { parseKind, type HoldKind } from "@/lib/types";
import { getStaff } from "@/lib/session";

// Every action posts back to the page it came from ("returnTo"),
// with ?error=... if the database refused the change.

function back(form: FormData, params: Record<string, string> = {}): never {
  let to = String(form.get("returnTo") || "/");
  if (!to.startsWith("/") || to.startsWith("//")) to = "/";
  const url = new URL(to, "http://x");
  url.searchParams.delete("error");
  url.searchParams.delete("released");
  url.searchParams.delete("ok");
  url.searchParams.delete("confirmed");
  url.searchParams.delete("release");
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
  const placed = (await rpc(form, "place_holds", {
    p_room: room,
    p_dates: dates,
    p_title: str(form, "title"),
    p_kind: parseKind(str(form, "kind")),
    p_agent_name: str(form, "agent_name"),
    p_agent_company: str(form, "agent_company"),
    p_agent_email: str(form, "agent_email"),
    p_notes: str(form, "notes"),
  })) as { id: string }[] | null;
  const sorted = [...dates].sort();
  const ids = ((placed ?? []) as { id: string }[]).map((h) => h.id).join(",");
  const kind = parseKind(str(form, "kind"));
  // Land on the day with the same "build an offer / rental form?" pop-up as the calendar.
  redirect(`/day/${sorted[0]}?ask=${ids}&kind=${kind}`);
}

export type CalendarHoldState = {
  error?: string;
  ok?: string;
  done?: number;
  title?: string;
  kind?: HoldKind;
  placed?: { id: string; date: string; room_id: string; rank: number | null; status: string }[];
};

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
  const { data, error } = await supabase.rpc("place_holds", {
    p_room: str(form, "room"),
    p_dates: dates,
    p_title: str(form, "title"),
    p_kind: parseKind(str(form, "kind")),
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
    title: str(form, "title"),
    kind: parseKind(str(form, "kind")),
    placed: ((data ?? []) as { id: string; date: string; room_id: string; rank: number | null; status: string }[]).map(
      (h) => ({ id: h.id, date: h.date, room_id: h.room_id, rank: h.rank, status: h.status }),
    ),
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

export async function releaseArtist(form: FormData) {
  const title = str(form, "title");
  const released = (await rpc(form, "release_artist", {
    p_title: title,
    p_reason: str(form, "reason"),
  })) as unknown[] | null;
  const n = released?.length ?? 0;
  back(form, { ok: `Released ${n} hold${n === 1 ? "" : "s"} for ${title}.` });
}

// From the after-confirm pop-up: release the checked holds, or all of them.
export async function releaseHolds(form: FormData) {
  const all = str(form, "all") === "1";
  const ids = (all ? form.getAll("all_ids") : form.getAll("pick")).map(String).filter(Boolean);
  if (ids.length === 0) {
    back(form, { error: "Tick at least one hold to release, or choose Keep all." });
  }
  const reason = str(form, "reason");
  for (const id of ids) {
    await rpc(form, "release_hold", { p_id: id, p_reason: reason });
  }
  let to = str(form, "doneTo") || "/";
  if (!to.startsWith("/") || to.startsWith("//")) to = "/";
  const n = `${ids.length} hold${ids.length === 1 ? "" : "s"}`;
  const msg = str(form, "mode") === "release" ? `Released ${n}.` : `Confirmed, and released ${ids.length} other ${ids.length === 1 ? "hold" : "holds"}.`;
  redirect(`${to}?ok=${encodeURIComponent(msg)}`);
}

export async function confirmHold(form: FormData) {
  const released = (await rpc(form, "confirm_hold", { p_id: str(form, "id") })) as
    | { title: string; agent_name: string | null; agent_email: string | null }[]
    | null;
  const names = (released ?? [])
    .map((h) => h.title + (h.agent_name ? ` (${h.agent_name})` : ""))
    .join("; ");
  const base: Record<string, string> = names ? { ok: "Confirmed.", released: names } : { ok: "Confirmed." };
  // "confirmed" opens the pop-up for releasing the artist's other holds.
  back(form, { ...base, confirmed: str(form, "id") });
}

export async function updateHold(form: FormData) {
  await rpc(form, "update_hold", {
    p_id: str(form, "id"),
    p_title: str(form, "title"),
    p_kind: parseKind(str(form, "kind")),
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

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export async function saveOffer(form: FormData) {
  const staff = await getStaff();
  if (!staff?.canBook) back(form, { error: "Only a booker or owner can save offers." });
  const supabase = await createClient();
  const id = str(form, "id");
  let terms;
  try {
    terms = normalizeTerms(JSON.parse(str(form, "terms") || "{}"));
  } catch {
    back(form, { error: "Couldn't read the offer terms. Try again." });
  }
  const fields = {
    title: str(form, "title"),
    agent_name: str(form, "agent_name") || null,
    agent_company: str(form, "agent_company") || null,
    agent_email: str(form, "agent_email").toLowerCase() || null,
    terms,
    updated_at: new Date().toISOString(),
  };
  if (!fields.title) back(form, { error: "Artist name is required." });

  const unassigned = str(form, "unassigned") === "1";
  if (id) {
    const update = unassigned ? { ...fields, room_id: str(form, "room_id") } : fields;
    const { error } = await supabase.from("offers").update(update).eq("id", id);
    if (error) back(form, { error: cleanError(error.message) });
    revalidatePath("/", "layout");
    redirect(`/offers/${id}?ok=${encodeURIComponent("Offer saved.")}`);
  }

  const holdIds = str(form, "hold_ids").split(",").filter(Boolean);
  if (holdIds.length === 0 && !unassigned) back(form, { error: "This offer isn't linked to any holds." });
  const { data, error } = await supabase
    .from("offers")
    .insert({ ...fields, hold_ids: holdIds, room_id: str(form, "room_id"), created_by: staff!.email })
    .select("id")
    .single();
  if (error) back(form, { error: cleanError(error.message) });
  revalidatePath("/", "layout");
  redirect(`/offers/${data!.id}?ok=${encodeURIComponent("Offer saved.")}`);
}

export async function markOfferSent(form: FormData) {
  await rpc(form, "mark_offer_sent", { p_offer: str(form, "id") });
  back(form, { ok: "Marked as sent. These holds now show Offer out." });
}

// ---------------------------------------------------------------------------
// Rentals
// ---------------------------------------------------------------------------

// Keep the calendar holds' names in step with the rental's Event name.
async function renameRentalHolds(holdIds: string[], title: string): Promise<string | null> {
  if (!holdIds.length || !title) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("holds")
    .select("id,title,kind,agent_name,agent_company,agent_email,notes,status")
    .in("id", holdIds);
  for (const h of (data ?? []) as Record<string, string | null>[]) {
    if (h.status === "released" || h.title === title) continue;
    const { error } = await supabase.rpc("update_hold", {
      p_id: h.id,
      p_title: title,
      p_kind: h.kind,
      p_agent_name: h.agent_name ?? "",
      p_agent_company: h.agent_company ?? "",
      p_agent_email: h.agent_email ?? "",
      p_notes: h.notes ?? "",
    });
    if (error) return cleanError(error.message);
  }
  return null;
}

export async function saveRental(form: FormData) {
  const staff = await getStaff();
  if (!staff?.canBook) back(form, { error: "Only a booker or owner can save rentals." });
  const supabase = await createClient();
  const id = str(form, "id");
  const roomId = str(form, "room_id");
  let details;
  try {
    details = normalizeDetails(JSON.parse(str(form, "details") || "{}"));
  } catch {
    back(form, { error: "Couldn't read the rental form. Try again." });
  }
  const problems = rentalProblems(roomId, details!);
  if (problems.length) back(form, { error: problems.join(" ") });

  const fields = {
    title: details!.eventName.trim(),
    contact_name: details!.contact.name.trim() || null,
    contact_email: details!.contact.email.trim().toLowerCase() || null,
    event_date: details!.date || null,
    details,
    updated_at: new Date().toISOString(),
  };
  const unassigned = str(form, "unassigned") === "1";

  if (id) {
    const update = unassigned ? { ...fields, room_id: roomId } : fields;
    const { data: saved, error } = await supabase.from("rentals").update(update).eq("id", id).select("hold_ids").single();
    if (error) back(form, { error: cleanError(error.message) });
    const renameError = await renameRentalHolds(saved!.hold_ids ?? [], fields.title);
    revalidatePath("/", "layout");
    if (renameError) redirect(`/rentals/${id}?error=${encodeURIComponent(`Rental saved, but the hold name couldn't be updated: ${renameError}`)}`);
    redirect(`/rentals/${id}?ok=${encodeURIComponent("Rental saved.")}`);
  }

  const holdIds = str(form, "hold_ids").split(",").filter(Boolean);
  if (holdIds.length === 0 && !unassigned) back(form, { error: "This rental isn't linked to any holds." });
  const { data, error } = await supabase
    .from("rentals")
    .insert({ ...fields, hold_ids: holdIds, room_id: roomId, created_by: staff!.email })
    .select("id")
    .single();
  if (error) {
    back(form, {
      error: /rentals/.test(error.message)
        ? "Couldn't save. Has the 0009_rentals.sql update been run in Supabase?"
        : cleanError(error.message),
    });
  }
  const renameError = await renameRentalHolds(holdIds, fields.title);
  revalidatePath("/", "layout");
  if (renameError) redirect(`/rentals/${data!.id}?error=${encodeURIComponent(`Rental saved, but the hold name couldn't be updated: ${renameError}`)}`);
  redirect(`/rentals/${data!.id}?ok=${encodeURIComponent("Rental saved.")}`);
}

export async function markRentalSent(form: FormData) {
  await rpc(form, "mark_rental_sent", { p_rental: str(form, "id") });
  back(form, { ok: "Marked as sent. These holds now show Offer out." });
}

export async function setRentalStatus(form: FormData) {
  const status = str(form, "status");
  if (!["draft", "sent", "signed", "cancelled"].includes(status)) back(form, { error: "Unknown status." });
  const supabase = await createClient();
  const { error } = await supabase
    .from("rentals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", str(form, "id"));
  if (error) back(form, { error: cleanError(error.message) });
  revalidatePath("/", "layout");
  back(form, { ok: "Status updated." });
}

export async function deleteRental(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const { data, error } = await supabase.from("rentals").delete().eq("id", id).select("id");
  if (error) back(form, { error: cleanError(error.message) });
  if (!data || data.length === 0) back(form, { error: "Couldn't delete that rental." });
  revalidatePath("/", "layout");
  redirect(`/rentals?ok=${encodeURIComponent("Rental deleted.")}`);
}

export async function deleteOffer(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const { data, error } = await supabase.from("offers").delete().eq("id", id).select("id");
  if (error) back(form, { error: cleanError(error.message) });
  if (!data || data.length === 0) {
    back(form, { error: "Couldn't delete that offer. Has the 0004_delete_offers.sql update been run in Supabase?" });
  }
  revalidatePath("/", "layout");
  redirect(`/offers?ok=${encodeURIComponent("Offer deleted.")}`);
}

// ---------------------------------------------------------------------------
// Date notes (competing events etc.; not holds)
// ---------------------------------------------------------------------------

export async function addDateNote(form: FormData) {
  const staff = await getStaff();
  if (!staff?.canBook) back(form, { error: "Only a booker or owner can add notes." });
  const date = str(form, "date");
  const body = str(form, "body");
  if (!isValidISO(date) || !body) back(form, { error: "Type a note first." });
  const supabase = await createClient();
  const { error } = await supabase.from("date_notes").insert({ date, body, created_by: staff!.email });
  if (error) {
    back(form, {
      error: error.message.includes("date_notes")
        ? "Notes aren't set up yet. Run 0005_date_notes.sql in Supabase."
        : cleanError(error.message),
    });
  }
  revalidatePath("/", "layout");
  back(form, { ok: "Note added." });
}

export async function deleteDateNote(form: FormData) {
  const supabase = await createClient();
  // Auto-added notes are hidden instead, so the daily sync doesn't bring them back.
  const { error } =
    str(form, "auto") === "1"
      ? await supabase.from("date_notes").update({ hidden: true }).eq("id", str(form, "id"))
      : await supabase.from("date_notes").delete().eq("id", str(form, "id"));
  if (error) back(form, { error: cleanError(error.message) });
  revalidatePath("/", "layout");
  back(form, { ok: str(form, "auto") === "1" ? "Event note hidden." : "Note deleted." });
}

// "Sync now" for outside music events (owner/booker).
export async function syncEventsNow(form: FormData) {
  const staff = await getStaff();
  if (!staff?.canBook) back(form, { error: "Only a booker or owner can sync events." });
  const { syncEvents } = await import("@/lib/sync-events");
  const r = await syncEvents();
  revalidatePath("/", "layout");
  const parts = r.venues.map((v) => `${v.name} ${v.error ? "(couldn't read)" : v.found}`);
  if (r.ticketmaster) parts.push(`Ticketmaster ${r.ticketmaster.error ? "(error)" : r.ticketmaster.found}`);
  const summary = `Outside events synced: ${parts.join(" · ") || "nothing to sync"}. ${r.removed} removed.`;
  if (r.error && r.saved === 0 && parts.length === 0) back(form, { error: `Event sync: ${r.error}` });
  back(form, { ok: summary });
}

// ---------------------------------------------------------------------------
// Watched venues
// ---------------------------------------------------------------------------

function cleanUrl(u: string): string | null {
  const t = u.trim().replace(/^webcal:/i, "https:");
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return url.toString();
  } catch {
    return null;
  }
}

export async function saveStaff(form: FormData) {
  const staff = await getStaff();
  if (staff?.role !== "owner") back(form, { error: "Only an owner can change staff." });
  const email = str(form, "email").toLowerCase();
  const name = str(form, "name");
  const isNew = str(form, "new") === "1";
  const { error } = await createClient().then((s) =>
    s.rpc("save_staff", {
      p_email: email,
      p_name: name,
      p_role: str(form, "role"),
      p_active: str(form, "active") === "1",
    }),
  );
  if (error) {
    back(form, {
      error: /save_staff/.test(error.message)
        ? "The Staff page isn't set up yet. Run 0010_staff_admin.sql in Supabase."
        : cleanError(error.message),
    });
  }
  revalidatePath("/", "layout");
  back(form, { ok: isNew ? `${name} added. They can sign in with Microsoft using ${email}.` : `${name} saved.` });
}

export async function saveVenue(form: FormData) {
  const staff = await getStaff();
  if (!staff?.canBook) back(form, { error: "Only a booker or owner can change venues." });
  const name = str(form, "name");
  const url = cleanUrl(str(form, "url"));
  if (!name || !url) back(form, { error: "Enter the venue name and a valid web address." });
  const fields = { name, url, ignore_words: str(form, "ignore_words"), active: str(form, "active") !== "0" };
  const supabase = await createClient();
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("watched_venues").update(fields).eq("id", id)
    : await supabase.from("watched_venues").insert(fields);
  if (error) {
    back(form, {
      error: error.message.includes("watched_venues")
        ? "Venues aren't set up yet. Run 0007_watched_venues.sql in Supabase."
        : cleanError(error.message),
    });
  }
  revalidatePath("/venues");
  back(form, { ok: id ? `${name} saved.` : `${name} added. Click Test to check it.` });
}

export async function deleteVenue(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  // Remove the venue's upcoming event notes too.
  await supabase.from("date_notes").delete().eq("source", "venue").like("external_id", `${id}:%`);
  const { error } = await supabase.from("watched_venues").delete().eq("id", id);
  if (error) back(form, { error: cleanError(error.message) });
  revalidatePath("/", "layout");
  back(form, { ok: "Venue removed." });
}
