// Offer terms, the show budget math, and the text that goes to the agent.
// Pure functions: used on the offer form (live budget), the printable sheet
// and Copy for email, so all three always agree.

export type DealType = "flat" | "vs" | "door" | "bonus";

export type Tier = { name: string; price: number; qty: number };
export type Cost = { label: string; amount: number };
export type Bonus = { at: number; amount: number };

export type Terms = {
  dealType: DealType;
  guarantee: number;
  percent: number; // artist %, for vs and door deals
  pctBasis: "gross" | "net"; // % of gross, or % of net after listed costs
  bonuses: Bonus[];
  tiers: Tier[];
  taxPct: number; // taxes/fees taken off gross before anything else
  costs: Cost[];
  support: string;
  doors: string;
  showTime: string;
  curfew: string;
  ages: string;
  deposit: string;
  merch: string;
  hospitality: string;
  radius: string;
  expires: string; // YYYY-MM-DD
  notes: string;
};

export const DEAL_LABELS: Record<DealType, string> = {
  flat: "Flat guarantee",
  vs: "Guarantee vs. %",
  door: "Door deal (% only)",
  bonus: "Guarantee plus bonuses",
};

export function defaultTerms(): Terms {
  return {
    dealType: "flat",
    guarantee: 0,
    percent: 85,
    pctBasis: "net",
    bonuses: [],
    tiers: [
      { name: "Advance", price: 0, qty: 0 },
      { name: "Day of show", price: 0, qty: 0 },
    ],
    taxPct: 7,
    costs: [
      { label: "Sound & lights", amount: 0 },
      { label: "Staffing & security", amount: 0 },
      { label: "Marketing", amount: 0 },
      { label: "Hospitality", amount: 0 },
    ],
    support: "TBA",
    doors: "7:00 PM",
    showTime: "8:00 PM",
    curfew: "11:00 PM",
    ages: "All ages",
    deposit: "50% on signing",
    merch: "Artist sells, 0% venue split",
    hospitality: "$150 buyout",
    radius: "100 miles, 60 days before / 30 days after",
    expires: "",
    notes: "",
  };
}

export const VENUE_ADDRESS = "1159 24th Street, Des Moines, IA 50311";
export const VENUE_WEBSITE = "www.xbklive.com";

// Fill in anything missing (older offers, hand-edited data).
export function normalizeTerms(raw: unknown): Terms {
  const d = defaultTerms();
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Terms>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    ...d,
    ...t,
    dealType: (["flat", "vs", "door", "bonus"] as const).includes(t.dealType as DealType) ? (t.dealType as DealType) : d.dealType,
    pctBasis: t.pctBasis === "gross" ? "gross" : "net",
    guarantee: num(t.guarantee ?? d.guarantee),
    percent: num(t.percent ?? d.percent),
    taxPct: num(t.taxPct ?? d.taxPct),
    tiers: Array.isArray(t.tiers) ? t.tiers.map((x) => ({ name: String(x.name ?? ""), price: num(x.price), qty: num(x.qty) })) : d.tiers,
    costs: Array.isArray(t.costs) ? t.costs.map((x) => ({ label: String(x.label ?? ""), amount: num(x.amount) })) : d.costs,
    bonuses: Array.isArray(t.bonuses) ? t.bonuses.map((x) => ({ at: num(x.at), amount: num(x.amount) })) : d.bonuses,
  };
}

export const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });

const usesPercent = (t: Terms) => t.dealType === "vs" || t.dealType === "door";
const usesGuarantee = (t: Terms) => t.dealType !== "door";

export function capacity(t: Terms): number {
  return t.tiers.reduce((s, x) => s + Math.max(0, x.qty), 0);
}

export function totalCosts(t: Terms): number {
  return t.costs.reduce((s, c) => s + Math.max(0, c.amount), 0);
}

// Gross for n tickets, filling tiers in the order listed.
function grossFor(t: Terms, n: number): number {
  let left = n;
  let gross = 0;
  for (const tier of t.tiers) {
    const take = Math.min(left, Math.max(0, tier.qty));
    gross += take * Math.max(0, tier.price);
    left -= take;
    if (left <= 0) break;
  }
  return gross;
}

export type Budget = {
  tickets: number;
  gross: number;
  taxes: number;
  adjGross: number; // gross after taxes/fees
  costs: number;
  net: number; // adjusted gross after listed costs
  artist: number;
  venue: number;
};

export function budgetAt(t: Terms, tickets: number): Budget {
  const gross = grossFor(t, tickets);
  const taxes = (gross * Math.max(0, t.taxPct)) / 100;
  const adjGross = gross - taxes;
  const costs = totalCosts(t);
  const net = adjGross - costs;
  const base = t.pctBasis === "net" ? Math.max(0, net) : adjGross;
  const pct = (Math.max(0, t.percent) / 100) * base;
  let artist = 0;
  switch (t.dealType) {
    case "flat":
      artist = t.guarantee;
      break;
    case "vs":
      artist = Math.max(t.guarantee, pct);
      break;
    case "door":
      artist = pct;
      break;
    case "bonus":
      artist = t.guarantee + t.bonuses.filter((b) => b.at > 0 && tickets >= b.at).reduce((s, b) => s + b.amount, 0);
      break;
  }
  return { tickets, gross, taxes, adjGross, costs, net, artist, venue: adjGross - costs - artist };
}

// Fewest tickets where the venue covers costs and the artist; null if it never does.
export function breakEven(t: Terms): number | null {
  const cap = capacity(t);
  for (let n = 0; n <= cap; n++) {
    if (budgetAt(t, n).venue >= 0) return n;
  }
  return null;
}

// One-line deal description for the agent.
export function dealText(t: Terms): string {
  const after = t.pctBasis === "net" ? "net box office receipts after the listed costs" : "gross box office receipts";
  const taxNote = t.taxPct > 0 ? ` (after ${t.taxPct}% sales tax/fees)` : "";
  switch (t.dealType) {
    case "flat":
      return `${money(t.guarantee)} flat guarantee`;
    case "vs":
      return `${money(t.guarantee)} guarantee vs. ${t.percent}% of ${after}${taxNote}, whichever is greater`;
    case "door":
      return `${t.percent}% of ${after}${taxNote}; no guarantee`;
    case "bonus": {
      const b = t.bonuses
        .filter((x) => x.at > 0 && x.amount > 0)
        .sort((a, b2) => a.at - b2.at)
        .map((x) => `${money(x.amount)} at ${x.at} tickets sold`);
      return `${money(t.guarantee)} guarantee${b.length ? ` plus bonuses: ${b.join("; ")}` : ""}`;
    }
  }
}

export function showsCostsToAgent(t: Terms): boolean {
  return usesPercent(t) && t.pctBasis === "net";
}

export { usesGuarantee, usesPercent };

export type OfferHeader = {
  title: string;
  roomName: string;
  dates: string[]; // formatted
  agentName?: string | null;
  from?: string;
};

// Plain-text offer, ready to paste into an email.
export function offerEmailText(h: OfferHeader, t: Terms): string {
  const lines: string[] = [];
  lines.push(`OFFER: ${h.title}`);
  lines.push(`Venue: ${h.roomName}, ${VENUE_ADDRESS}`);
  lines.push(`Date${h.dates.length > 1 ? "s" : ""}: ${h.dates.join("; ")}`);
  if (h.dates.length > 1) lines.push(`(Terms below apply to each date.)`);
  lines.push("");
  lines.push(`Deal: ${dealText(t)}`);

  const tiers = t.tiers.filter((x) => x.qty > 0 || x.price > 0);
  if (tiers.length) {
    lines.push(`Tickets: ${tiers.map((x) => `${x.name || "Tickets"} ${money(x.price)} (${x.qty})`).join(" · ")}`);
    lines.push(`Capacity: ${capacity(t)} · Gross potential: ${money(budgetAt(t, capacity(t)).gross)}`);
  }
  if (showsCostsToAgent(t)) {
    const costs = t.costs.filter((c) => c.amount > 0);
    if (costs.length) {
      lines.push(`Costs deducted before percentage: ${costs.map((c) => `${c.label} ${money(c.amount)}`).join(", ")} (total ${money(totalCosts(t))})`);
    }
  }
  lines.push("");
  const detail: [string, string][] = [
    ["Support", t.support],
    ["Doors", t.doors],
    ["Show", t.showTime],
    ["Curfew", t.curfew],
    ["Ages", t.ages],
    ["Deposit", t.deposit],
    ["Merch", t.merch],
    ["Hospitality", t.hospitality],
    ["Radius", t.radius],
  ];
  for (const [k, v] of detail) if (v.trim()) lines.push(`${k}: ${v.trim()}`);
  if (t.expires) lines.push(`Offer expires: ${t.expires}`);
  if (t.notes.trim()) {
    lines.push("");
    lines.push(t.notes.trim());
  }
  lines.push("");
  if (h.from) lines.push(h.from);
  lines.push(VENUE_WEBSITE);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};
