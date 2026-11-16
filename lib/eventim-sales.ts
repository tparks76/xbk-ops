// Turn Eventim's order list into ticket counts. Only totals are kept: no customer details.
// Plain functions, unit-tested with Node.

export type EvTicket = {
  status?: string;
  faceValue?: number;
  totalPrice?: number;
  ticketType?: { id?: number; name?: string };
};
export type EvOrder = { id?: number; isValid?: boolean; createdAt?: string | null; tickets?: EvTicket[] };
export type EvTicketType = { id?: number; name?: string; allotment?: number; price?: number; faceValue?: number };

// Ticket statuses that count as sold. Anything refunded, cancelled, voided etc. doesn't.
export const isSold = (status?: string) => !/refund|cancel|void|revok|return|declin|fail|pending|reserv|expired|transferred_out/i.test(status ?? "purchased");

export type Totals = {
  sold: number; // paid tickets
  comps: number; // $0 face value
  gross: number; // face value of paid tickets
  tiers: { name: string; sold: number; price: number; gross: number }[];
  statuses: Record<string, number>; // every ticket status seen, for checking
  byDay: { day: string; sold: number; gross: number; comps: number }[]; // cumulative, by order day
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalsFromOrders(orders: EvOrder[]): Totals {
  const tiers = new Map<string, { sold: number; gross: number; prices: number[] }>();
  const statuses: Record<string, number> = {};
  const days = new Map<string, { sold: number; gross: number; comps: number }>();
  let sold = 0;
  let comps = 0;
  let gross = 0;
  for (const o of orders) {
    if (o.isValid === false) continue;
    const day = (o.createdAt ?? "").slice(0, 10) || "unknown";
    for (const t of o.tickets ?? []) {
      const st = t.status ?? "purchased";
      statuses[st] = (statuses[st] ?? 0) + 1;
      if (!isSold(st)) continue;
      const face = Number(t.faceValue ?? 0) || 0;
      const d = days.get(day) ?? { sold: 0, gross: 0, comps: 0 };
      if (face <= 0) {
        comps++;
        d.comps++;
      } else {
        sold++;
        gross += face;
        d.sold++;
        d.gross += face;
        const name = t.ticketType?.name?.trim() || "Tickets";
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
    })),
    statuses,
    byDay,
  };
}

export const capacityFrom = (types: EvTicketType[]) => types.reduce((s, t) => s + (Number(t.allotment) || 0), 0) || null;
