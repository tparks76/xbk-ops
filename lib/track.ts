// Track Shows: ticket sales set against the offer. Plain functions (no framework imports)
// so they can be unit-tested with Node.
import { breakEven, budgetAt, budgetForSales, capacity, type Budget, type Terms } from "./offer";

export type TierCount = { name: string; sold: number; price: number; gross: number };
export type Count = { counted_at: string; sold: number; comps: number; gross: number; tiers: TierCount[]; source: string };

export type Tracking = {
  cap: number;
  sold: number;
  comps: number;
  gross: number;
  pctSold: number; // 0–100
  breakEven: number | null; // tickets
  toBreakEven: number | null; // tickets still needed (0 = there)
  now: Budget; // the deal at today's sales
  sellout: Budget; // the deal at sellout (walk out)
  daysLeft: number;
  last7: number | null; // sold in the last 7 days (null = not enough history)
  projected: number | null; // tickets by show day at the last-7-days pace (capped at capacity)
  projectedBudget: Budget | null;
  status: "sold-out" | "on-track" | "watch" | "behind" | "no-data";
};

const DAY = 864e5;

export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(`${dateIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY);
}

// counts: newest first.
export function track(t: Terms, counts: Count[], dateIso: string, todayIso: string): Tracking {
  const cap = capacity(t);
  const latest = counts[0];
  const sold = latest?.sold ?? 0;
  const gross = Number(latest?.gross ?? 0);
  const be = breakEven(t);
  const daysLeft = daysUntil(dateIso, todayIso);

  // Pace: compare with the newest count that's at least 6 days older than the latest one.
  let last7: number | null = null;
  if (latest) {
    const t0 = Date.parse(latest.counted_at);
    const older = counts.find((c) => t0 - Date.parse(c.counted_at) >= 6 * DAY);
    if (older) {
      const days = Math.max(1, (t0 - Date.parse(older.counted_at)) / DAY);
      last7 = Math.round(((latest.sold - older.sold) / days) * 7);
    }
  }
  const projected =
    last7 !== null && daysLeft > 0 ? Math.min(cap || Infinity, sold + Math.round((last7 / 7) * daysLeft)) : latest ? sold : null;
  const avgPrice = sold > 0 ? gross / sold : 0;
  const projectedBudget = projected !== null ? budgetForSales(t, projected, avgPrice > 0 ? avgPrice * projected : budgetAt(t, projected).gross) : null;

  const pctSold = cap > 0 ? Math.round((sold / cap) * 100) : 0;
  let status: Tracking["status"] = "no-data";
  if (latest) {
    if (cap > 0 && sold >= cap) status = "sold-out";
    else if (be === null) status = "watch";
    else if (sold >= be) status = "on-track";
    else if (projected !== null && projected >= be) status = "watch";
    else status = "behind";
  }

  return {
    cap,
    sold,
    comps: latest?.comps ?? 0,
    gross,
    pctSold,
    breakEven: be,
    toBreakEven: be === null ? null : Math.max(0, be - sold),
    now: budgetForSales(t, sold, gross),
    sellout: budgetAt(t, cap),
    daysLeft,
    last7,
    projected,
    projectedBudget,
    status,
  };
}

export const STATUS_TEXT: Record<Tracking["status"], string> = {
  "sold-out": "Sold out",
  "on-track": "Past break-even",
  watch: "On pace to break even",
  behind: "Behind break-even",
  "no-data": "No counts yet",
};

// Turn the per-tier entry form into a count.
export function countFromTiers(tiers: TierCount[], comps: number): { sold: number; gross: number; comps: number; tiers: TierCount[] } {
  const clean = tiers
    .map((x) => ({ name: x.name, sold: Math.max(0, Math.round(x.sold || 0)), price: Number(x.price) || 0, gross: 0 }))
    .map((x) => ({ ...x, gross: Math.round(x.sold * x.price * 100) / 100 }));
  return {
    tiers: clean,
    sold: clean.reduce((s, x) => s + x.sold, 0),
    gross: Math.round(clean.reduce((s, x) => s + x.gross, 0) * 100) / 100,
    comps: Math.max(0, Math.round(comps || 0)),
  };
}
