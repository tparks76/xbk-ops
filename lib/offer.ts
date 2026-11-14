// Offer terms, the show budget math, and the text that goes to the agent.
// Pure functions: used on the offer form (live budget), the printable sheet
// and Copy for email, so all three always agree.

export type DealType = "flat" | "vs" | "door" | "bonus";

export type Tier = { name: string; price: number; qty: number };
// approved = an approved show expense: deducted before the artist's % and listed on the offer.
export type Cost = { label: string; amount: number; approved: boolean };
// Variable costs are worked out on a sold-out house.
export type VarCost = { label: string; mode: "pct" | "per_ticket"; rate: number; approved: boolean };
export type Bonus = { at: number; amount: number };
export type SetupOption = { key: string; name: string; cap: number };

// Room setups and their capacities. Every room also has "Custom".
export const ROOM_SETUPS: Record<string, SetupOption[]> = {
  xbk: [
    { key: "ga", name: "GA", cap: 250 },
    { key: "seated", name: "Full seated", cap: 128 },
  ],
  annex: [{ key: "ga", name: "GA", cap: 50 }],
  idc: [{ key: "ga", name: "GA", cap: 600 }],
};

export function setupsFor(room: string): SetupOption[] {
  return ROOM_SETUPS[room] ?? ROOM_SETUPS.xbk;
}

// Switch to a setup (or "custom"), fitting ticket tiers to the new capacity.
export function applySetup(t: Terms, opt: SetupOption | "custom"): Terms {
  const next: Terms =
    opt === "custom"
      ? { ...t, setup: "custom", customCap: t.customCap || capacity(t) }
      : { ...t, setup: opt.key, setupName: opt.name, setupCap: opt.cap };
  return { ...next, tiers: fitTiers(t.tiers, capacity(next)) };
}

export const AGES = ["All ages", "18+", "21+"] as const;

export type Terms = {
  dealType: DealType;
  guarantee: number;
  percent: number; // artist %, for vs and door deals
  pctBasis: "gross" | "net"; // % of gross, or % of net after approved costs
  bonuses: Bonus[];
  setup: string; // a ROOM_SETUPS key, or "custom"
  setupName: string; // e.g. "GA", "Full seated"
  setupCap: number; // capacity of the chosen setup
  customCap: number; // capacity when setup is "custom"
  tiers: Tier[];
  taxPct: number; // sales tax/fees taken off gross before anything else
  costs: Cost[];
  varCosts: VarCost[];
  support: string;
  doors: string;
  showTime: string;
  curfew: string;
  ages: string;
  deposit: string;
  merch: string;
  hospitality: string; // older offers only; hospitality is now a cost
  radius: string;
  expires: string; // YYYY-MM-DD
  notes: string;
  dateText: string; // for offers not tied to calendar holds, e.g. "TBD" or "March 2027"
};

export const DEAL_LABELS: Record<DealType, string> = {
  flat: "Flat guarantee",
  vs: "Guarantee vs. %",
  door: "Door deal (% only)",
  bonus: "Guarantee plus bonuses",
};

export const VENUE_ADDRESS = "1159 24th Street, Des Moines, IA 50311";
export const VENUE_WEBSITE = "www.xbklive.com";

export function defaultCosts(): Cost[] {
  return [
    { label: "Support", amount: 250, approved: true },
    { label: "Sound & Lights", amount: 250, approved: true },
    { label: "Marketing", amount: 150, approved: true },
    { label: "Box Office", amount: 50, approved: true },
    { label: "Hospitality", amount: 100, approved: true },
  ];
}

export function defaultVarCosts(): VarCost[] {
  return [
    { label: "ASCAP", mode: "pct", rate: 0.8, approved: true },
    { label: "BMI", mode: "pct", rate: 0.5, approved: true },
    { label: "GMR", mode: "pct", rate: 0.16, approved: true },
    { label: "SESAC", mode: "per_ticket", rate: 0.0478, approved: true },
    { label: "Insurance", mode: "per_ticket", rate: 0.5, approved: true },
  ];
}

export function defaultTerms(room = "xbk"): Terms {
  const first = setupsFor(room)[0];
  return {
    dealType: "flat",
    guarantee: 0,
    percent: 70,
    pctBasis: "net",
    bonuses: [],
    setup: first.key,
    setupName: first.name,
    setupCap: first.cap,
    customCap: 0,
    tiers: [
      { name: "Advance", price: 0, qty: first.cap },
      { name: "Day of show", price: 0, qty: 0 },
    ],
    taxPct: 7,
    costs: defaultCosts(),
    varCosts: defaultVarCosts(),
    support: "TBA",
    doors: "7:00 PM",
    showTime: "8:00 PM",
    curfew: "11:00 PM",
    ages: "All ages",
    deposit: "",
    merch: "Artist sells, 0% venue split",
    hospitality: "",
    radius: "100 miles, 60 days before / 30 days after",
    expires: "",
    notes: "",
    dateText: "",
  };
}

// Fill in anything missing (older offers, hand-edited data).
export function normalizeTerms(raw: unknown): Terms {
  const d = defaultTerms();
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Terms>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const str = (v: unknown, dflt: string) => (typeof v === "string" ? v : dflt);
  const isOld = !("setup" in t); // saved before setups/variable costs existed
  const tiers = Array.isArray(t.tiers)
    ? t.tiers.map((x) => ({ name: String(x.name ?? ""), price: num(x.price), qty: num(x.qty) }))
    : d.tiers;
  return {
    ...d,
    ...t,
    dealType: (["flat", "vs", "door", "bonus"] as const).includes(t.dealType as DealType) ? (t.dealType as DealType) : d.dealType,
    pctBasis: t.pctBasis === "gross" ? "gross" : "net",
    guarantee: num(t.guarantee ?? d.guarantee),
    percent: num(t.percent ?? d.percent),
    taxPct: num(t.taxPct ?? d.taxPct),
    // Older offers: keep their capacity as a custom setup.
    setup: isOld ? "custom" : typeof t.setup === "string" && t.setup ? t.setup : d.setup,
    setupName: str(t.setupName, t.setup === "seated" ? "Full seated" : t.setup === "ga" ? "GA" : d.setupName),
    setupCap: num(t.setupCap) || (t.setup === "seated" ? 128 : t.setup === "ga" ? 250 : d.setupCap),
    customCap: isOld ? tiers.reduce((s, x) => s + x.qty, 0) : num(t.customCap),
    tiers,
    costs: Array.isArray(t.costs)
      ? t.costs.map((x) => ({ label: String(x.label ?? ""), amount: num(x.amount), approved: x.approved !== false }))
      : d.costs,
    varCosts: Array.isArray(t.varCosts)
      ? t.varCosts.map((x) => ({
          label: String(x.label ?? ""),
          mode: x.mode === "per_ticket" ? ("per_ticket" as const) : ("pct" as const),
          rate: num(x.rate),
          approved: x.approved !== false,
        }))
      : isOld
        ? []
        : d.varCosts,
    bonuses: Array.isArray(t.bonuses) ? t.bonuses.map((x) => ({ at: num(x.at), amount: num(x.amount) })) : d.bonuses,
    ages: str(t.ages, d.ages) || d.ages,
    deposit: str(t.deposit, d.deposit),
    hospitality: str(t.hospitality, ""),
    dateText: str(t.dateText, ""),
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

// Capacity comes from the room setup.
export function capacity(t: Terms): number {
  return Math.max(0, t.setup === "custom" ? t.customCap : t.setupCap);
}

export function tierTotal(t: Terms): number {
  return t.tiers.reduce((s, x) => s + Math.max(0, x.qty), 0);
}

// After a setup change: the first tier (Advance) takes the whole capacity,
// less anything already put in later tiers.
export function fitTiers(tiers: Tier[], cap: number): Tier[] {
  if (tiers.length === 0) return [{ name: "Advance", price: 0, qty: cap }];
  let left = cap;
  const rest = tiers.slice(1).map((x) => {
    const qty = Math.min(Math.max(0, x.qty), left);
    left -= qty;
    return { ...x, qty };
  });
  return [{ ...tiers[0], qty: left }, ...rest];
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

const afterTax = (t: Terms, gross: number) => gross - (gross * Math.max(0, t.taxPct)) / 100;

// Each variable cost in dollars, worked out on a sold-out house.
export function varCostAmount(t: Terms, v: VarCost): number {
  const cap = capacity(t);
  if (v.mode === "per_ticket") return Math.max(0, v.rate) * cap;
  return (Math.max(0, v.rate) / 100) * afterTax(t, grossFor(t, cap));
}

export function fixedCosts(t: Terms, approvedOnly = false): number {
  return t.costs.filter((c) => !approvedOnly || c.approved).reduce((s, c) => s + Math.max(0, c.amount), 0);
}

export function variableCosts(t: Terms, approvedOnly = false): number {
  return t.varCosts.filter((v) => !approvedOnly || v.approved).reduce((s, v) => s + varCostAmount(t, v), 0);
}

// All costs (the venue pays these) and approved show expenses (deducted before the artist's %).
export function totalCosts(t: Terms): number {
  return fixedCosts(t) + variableCosts(t);
}
export function approvedCosts(t: Terms): number {
  return fixedCosts(t, true) + variableCosts(t, true);
}

export type Budget = {
  tickets: number;
  gross: number;
  taxes: number;
  adjGross: number; // gross after sales tax/fees
  costs: number; // all costs
  approved: number; // approved show expenses
  net: number; // adjusted gross after approved show expenses (the deal's net)
  artist: number;
  venue: number;
};

export function budgetAt(t: Terms, tickets: number): Budget {
  const gross = grossFor(t, tickets);
  const adjGross = afterTax(t, gross);
  const taxes = gross - adjGross;
  const costs = totalCosts(t);
  const approved = approvedCosts(t);
  const net = adjGross - approved;
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
  return { tickets, gross, taxes, adjGross, costs, approved, net, artist, venue: adjGross - costs - artist };
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
  const after = t.pctBasis === "net" ? "net box office receipts after approved show expenses" : "gross box office receipts";
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

// Approved show expenses go on the offer when the artist's % is paid after them.
export function showsCostsToAgent(t: Terms): boolean {
  return usesPercent(t) && t.pctBasis === "net";
}

// $0.50, $0.0478: at least two decimals, more when the rate has them.
export function perTicket(rate: number): string {
  const decimals = (String(rate).split(".")[1] ?? "").length;
  return `$${rate.toFixed(Math.max(2, Math.min(4, decimals)))}`;
}

// The approved expenses as lines for the offer sheet and email.
export function approvedLines(t: Terms): { label: string; amount: number; note?: string }[] {
  const fixed = t.costs.filter((c) => c.approved && c.amount > 0).map((c) => ({ label: c.label, amount: c.amount }));
  const vars = t.varCosts
    .filter((v) => v.approved && v.rate > 0)
    .map((v) => ({
      label: v.label,
      amount: varCostAmount(t, v),
      note: v.mode === "pct" ? `${v.rate}% of gross` : `${perTicket(v.rate)} per ticket × ${capacity(t)}`,
    }));
  return [...fixed, ...vars];
}

export function setupLabel(t: Terms): string {
  return t.setup === "custom" ? `Capacity ${capacity(t)}` : `${t.setupName} (${t.setupCap})`;
}

export { usesGuarantee, usesPercent };

export type OfferHeader = {
  title: string;
  roomName: string;
  dates: string[]; // formatted
  agentName?: string | null;
  from?: string;
};

const cents = (n: number) => Math.round(n * 100) / 100;

// Plain-text offer, ready to paste into an email.
export function offerEmailText(h: OfferHeader, t: Terms): string {
  const lines: string[] = [];
  lines.push(`OFFER: ${h.title}`);
  lines.push(`Venue: ${h.roomName}, ${VENUE_ADDRESS}`);
  lines.push(`Date${h.dates.length > 1 ? "s" : ""}: ${h.dates.join("; ")}`);
  if (h.dates.length > 1) lines.push(`(Terms below apply to each date.)`);
  lines.push("");
  lines.push(`Deal: ${dealText(t)}`);
  lines.push(`Setup: ${setupLabel(t)}`);

  const tiers = t.tiers.filter((x) => x.qty > 0 || x.price > 0);
  if (tiers.length) {
    lines.push(`Tickets: ${tiers.map((x) => `${x.name || "Tickets"} ${money(x.price)} (${x.qty})`).join(" · ")}`);
    const so = budgetAt(t, capacity(t));
    lines.push(`Gross potential: ${money(cents(so.gross))}`);
    if (t.taxPct > 0) {
      lines.push(`Less ${t.taxPct}% sales tax/fees: −${money(cents(so.taxes))} · Gross after tax: ${money(cents(so.adjGross))}`);
    }
  }
  if (showsCostsToAgent(t)) {
    const costs = approvedLines(t);
    if (costs.length) {
      lines.push(
        `Approved show expenses: ${costs.map((c) => `${c.label} ${money(cents(c.amount))}`).join(", ")} (total ${money(cents(approvedCosts(t)))})`,
      );
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
