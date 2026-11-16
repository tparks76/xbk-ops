import { createAdminClient } from "@/lib/supabase/admin";
import { emailTokens, matchRows, parseDailyStats, type HoldLite } from "@/lib/ticket-email";

// Save one "Daily Event Stats" email: a ticket count for every confirmed hold it matches.
export async function importDailyStatsEmail(input: { html?: string; text?: string; messageId?: string; date?: string }) {
  const db = createAdminClient();
  if (input.messageId) {
    const { data: seen } = await db.from("ticket_reports").select("id").eq("message_id", input.messageId).maybeSingle();
    if (seen) return { ok: true, message: "Already imported.", matched: 0, unmatched: 0 };
  }
  let parsed = parseDailyStats(emailTokens(input.html ?? ""));
  if (!parsed.rows.length && input.text) parsed = parseDailyStats(input.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const receivedAt = input.date && !Number.isNaN(Date.parse(input.date)) ? new Date(input.date).toISOString() : new Date().toISOString();

  if (!parsed.rows.length) {
    // Keep the start of the email so the reader can be fixed.
    await db.from("ticket_reports").insert({
      message_id: input.messageId ?? null,
      received_at: receivedAt,
      rows: [{ problem: "No events could be read", sample: emailTokens(input.html ?? input.text ?? "").slice(0, 120) }],
    });
    return { ok: false, message: "No events could be read from the email.", matched: 0, unmatched: 0 };
  }

  const dates = [...new Set(parsed.rows.map((r) => r.date))];
  const { data: holdRows } = await db
    .from("holds")
    .select("id,room_id,date,title")
    .eq("status", "confirmed")
    .in("date", dates);
  const matches = matchRows(parsed.rows, (holdRows ?? []) as HoldLite[]);

  // One count per hold (early and late shows that night add together).
  const byHold = new Map<string, { sold: number; unsold: number; net: number; change: number; names: string[] }>();
  for (const { row, holdId } of matches) {
    if (!holdId) continue;
    const t = byHold.get(holdId) ?? { sold: 0, unsold: 0, net: 0, change: 0, names: [] };
    t.sold += row.sold;
    t.unsold += row.unsold;
    t.net += row.net;
    t.change += row.change;
    t.names.push(row.name);
    byHold.set(holdId, t);
  }
  if (byHold.size) {
    await db.from("ticket_counts").insert(
      [...byHold.entries()].map(([holdId, t]) => ({
        hold_id: holdId,
        counted_at: receivedAt,
        source: "email",
        sold: t.sold,
        gross: Math.round(t.net * 100) / 100,
        capacity: t.sold + t.unsold,
        comps: 0,
        tiers: [],
        note: `Eventim daily email${t.names.length > 1 ? ` (${t.names.length} events)` : ""} · ${t.change >= 0 ? "+" : ""}${t.change} in 24 hrs`,
        created_by: "eventim email",
      })),
    );
  }
  const unmatched = matches.filter((m) => !m.holdId).length;
  await db.from("ticket_reports").insert({
    message_id: input.messageId ?? null,
    received_at: receivedAt,
    report_date: parsed.reportDate,
    rows: matches.map(({ row, holdId }) => ({ ...row, hold_id: holdId })),
    matched: matches.length - unmatched,
    unmatched,
  });
  return {
    ok: true,
    message: `Read ${parsed.rows.length} events: ${byHold.size} shows updated, ${unmatched} not on the calendar as confirmed.`,
    matched: byHold.size,
    unmatched,
  };
}
