// Turn Eventim's order list into ticket counts. Only totals are kept: no customer details.
// Plain functions, unit-tested with Node.

export type EvTicket = {
  id?: number;
  status?: string;
  faceValue?: number;
  totalPrice?: number;
  ticketType?: { id?: number; name?: string };
};
export type EvOrder = { id?: number; isValid?: boolean; createdAt?: string | null; tickets?: EvTicket[] };
export type EvPricing = { price?: number; facilityFee?: number; tax?: number; customerFee?: number; processingFee?: number };
export type EvTicketType = { id?: number; name?: string; allotment?: number; price?: number; faceValue?: number; _pricing?: EvPricing | null };

// Money collected, split up. Per-ticket fee fields are used when Eventim sends them; otherwise each
// ticket type's price list (withPricing) is used. "other" is whatever's left of the all-in total.
export type Fees = {
  face: number; // tickets' face value (= gross)
  addOns: number; // add-ons' face value
  facility: number;
  service: number; // customer / service fee
  processing: number;
  delivery: number;
  tax: number;
  discounts: number; // coupons
  other: number; // all-in total not accounted for above (fees Eventim doesn't itemize)
  allIn: number; // what buyers paid in total
  itemized: boolean; // false = no fee breakdown available, so all fees are in "other"
};

// Add-ons (table reservations, parking, merch bundles…) aren't admissions: they're counted
// separately and left out of tickets sold, gross and capacity.
export const isAddOn = (name?: string) => /^\s*add[\s-]?ons?\b|\(tickets? not incl|\bupgrade\b|\bparking\b|\bmerch\b/i.test(name ?? "");

// The ticket's face value. Eventim's documents call it faceValue, but fall back to other price fields.
export function priceOf(t: EvTicket & Record<string, unknown>): number {
  for (const k of ["faceValue", "facevalue", "face_value", "price", "ticketPrice", "basePrice"]) {
    const v = Number((t as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

// Last resort when neither the ticket nor its type has a face value: the all-in price less listed fees.
export function priceFromTotal(t: EvTicket & Record<string, unknown>): number {
  const total = Number(t.totalPrice);
  if (Number.isFinite(total) && total > 0) {
    const fees = ["facilityFee", "deliveryFee", "processingFee", "tax"].reduce((s, k) => s + (Number((t as Record<string, unknown>)[k]) || 0), 0);
    return Math.max(0, Math.round((total - fees) * 100) / 100);
  }
  return 0;
}

// Ticket statuses that count as sold. Anything refunded, cancelled, voided etc. doesn't.
export const isSold = (status?: string) => !/refund|cancel|void|revok|return|declin|fail|pending|reserv|expired|transferred_out/i.test(status ?? "purchased");

export type Totals = {
  sold: number; // paid tickets
  comps: number; // $0 face value
  gross: number; // face value of paid tickets
  tiers: { name: string; sold: number; price: number; gross: number; addon?: boolean }[];
  addOns: { sold: number; gross: number }; // left out of the ticket numbers
  compsBy: Record<string, number>; // "$0 tickets" by ticket type and status, to check against Eventim
  fees: Fees;
  statuses: Record<string, number>; // every ticket status seen, for checking
  byDay: { day: string; sold: number; gross: number; comps: number }[]; // cumulative, by order day
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Eventim's orders often leave out the ticket type's name and the face value (only the all-in
// totalPrice comes through), so both are looked up from the event's ticket types by id.
export function totalsFromOrders(orders: EvOrder[], types: EvTicketType[] = []): Totals {
  const typeById = new Map(types.filter((x) => x.id !== undefined).map((x) => [String(x.id), x]));
  const tiers = new Map<string, { sold: number; gross: number; prices: number[] }>();
  const statuses: Record<string, number> = {};
  const days = new Map<string, { sold: number; gross: number; comps: number }>();
  let sold = 0;
  let comps = 0;
  let gross = 0;
  const addOns = { sold: 0, gross: 0 };
  const compsBy: Record<string, number> = {};
  const f = { face: 0, addOns: 0, facility: 0, service: 0, processing: 0, delivery: 0, tax: 0, discounts: 0, allIn: 0 };
  let itemized = false;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.isValid === false) continue;
    // The same order can come back on two pages: count it once.
    const oid = o.id !== undefined ? `o${o.id}` : "";
    if (oid && seen.has(oid)) continue;
    if (oid) seen.add(oid);
    const day = (o.createdAt ?? "").slice(0, 10) || "unknown";
    for (const t of o.tickets ?? []) {
      const st = t.status ?? "purchased";
      statuses[st] = (statuses[st] ?? 0) + 1;
      if (!isSold(st)) continue;
      const type = t.ticketType?.id !== undefined ? typeById.get(String(t.ticketType.id)) : undefined;
      const name = t.ticketType?.name?.trim() || type?.name?.trim() || "Tickets";
      const typePrice = Number(type?.price ?? type?.faceValue);
      const face = priceOf(t) || (Number.isFinite(typePrice) && typePrice > 0 ? typePrice : 0) || priceFromTotal(t);
      // Fees for this ticket: from the ticket if Eventim sent them, else from its type's price list.
      const tk = t as Record<string, unknown>;
      const own = ["facilityFee", "processingFee", "tax", "deliveryFee", "serviceFee", "customerFee"].some((k) => tk[k] !== undefined);
      const pr = type?._pricing ?? null;
      if (own || pr) itemized = true;
      f.facility += own ? n(tk.facilityFee) : n(pr?.facilityFee);
      f.service += own ? n(tk.serviceFee ?? tk.customerFee) : n(pr?.customerFee);
      f.processing += own ? n(tk.processingFee) : n(pr?.processingFee);
      f.delivery += n(tk.deliveryFee);
      f.tax += own ? n(tk.tax) : n(pr?.tax);
      f.discounts += n(tk.couponAmount);
      f.allIn += n(t.totalPrice);
      if (isAddOn(name)) f.addOns += face;
      else f.face += face;
      if (isAddOn(name)) {
        addOns.sold++;
        addOns.gross += face;
        const tier = tiers.get(name) ?? { sold: 0, gross: 0, prices: [] };
        tier.sold++;
        tier.gross += face;
        tier.prices.push(face);
        tiers.set(name, tier);
        continue;
      }
      const d = days.get(day) ?? { sold: 0, gross: 0, comps: 0 };
      if (face <= 0) {
        const k = `${name} (${st})`;
        compsBy[k] = (compsBy[k] ?? 0) + 1;
        comps++;
        d.comps++;
      } else {
        sold++;
        gross += face;
        d.sold++;
        d.gross += face;
        const tier = tiers.get(name) ?? { sold: 0, gross: 0, prices: [] };
        tier.sold++;
        tier.gross += face;
        tier.prices.push(face);
        tiers.set(name, tier);
      }
      days.set(day, d);
    }
  }
  // Running totals by day (oldest first).
  let s = 0;
  let g = 0;
  let c = 0;
  const byDay = [...days.entries()]
    .filter(([d]) => d !== "unknown")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => {
      s += d.sold;
      g += d.gross;
      c += d.comps;
      return { day, sold: s, gross: round2(g), comps: c };
    });
  return {
    sold,
    comps,
    gross: round2(gross),
    tiers: [...tiers.entries()].map(([name, t]) => ({
      name,
      sold: t.sold,
      price: round2(t.prices.sort((a, b) => a - b)[Math.floor(t.prices.length / 2)] ?? 0),
      gross: round2(t.gross),
      ...(isAddOn(name) ? { addon: true } : {}),
    })),
    addOns: { sold: addOns.sold, gross: round2(addOns.gross) },
    compsBy,
    fees: (() => {
      const accounted = f.face + f.addOns + f.facility + f.service + f.processing + f.delivery + f.tax - f.discounts;
      return {
        face: round2(f.face),
        addOns: round2(f.addOns),
        facility: round2(f.facility),
        service: round2(f.service),
        processing: round2(f.processing),
        delivery: round2(f.delivery),
        tax: round2(f.tax),
        discounts: round2(f.discounts),
        other: round2(Math.max(0, f.allIn - accounted)),
        allIn: round2(f.allIn),
        itemized,
      };
    })(),
    statuses,
    byDay,
  };
}

// Capacity: the admissions' allotments (box office / day-of-show types usually have none of their own).
export const capacityFrom = (types: (EvTicketType & { sharedTicketType?: string | null })[]) =>
  types.filter((t) => !isAddOn(t.name) && !t.sharedTicketType).reduce((s, t) => s + (Number(t.allotment) || 0), 0) || null;
