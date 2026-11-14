// Rental form: data, defaults, fee math and checks.
// Plain functions only (no framework imports) so they can be unit-tested with Node.

export type RoomInfo = {
  name: string;
  cap: number;
  weekday: number; // Mon–Thu
  weekend: number; // Fri–Sun
  address: string;
  provisional?: boolean; // rates not final yet
  included: string[] | null; // contract section 4; null = still to be set
};

export const RENTAL_ROOMS: Record<string, RoomInfo> = {
  xbk: {
    name: "xBk",
    cap: 250,
    weekday: 1500,
    weekend: 3000,
    address: "1159 24th Street, Des Moines, IA 50311",
    included: [
      "1 bartender",
      "1 host/door person",
      "1 sound engineer (if needed)",
      "Use of 16’x16’ stage",
      "Use of private 10’x10’ Green Room (Dressing Room)",
      "Use of patio space w/ 6 picnic tables",
      "(10) 4-person low top tables (Main Floor)",
      "(12) 2 to 4 person high top tables (Main Floor)",
      "Table seating for up to 36 people in the mezzanine",
      "(2) 6-foot folding tables",
      "(1) 8-foot folding table",
      "Other production items included on the attached Addendum C (Technical Rider)",
    ],
  },
  annex: {
    name: "The Annex",
    cap: 50,
    weekday: 750,
    weekend: 1500,
    address: "1163 24th Street, Unit B, Des Moines, IA 50311",
    included: [
      "Seating for up to 50 guests",
      "1 bartender",
      "1 host/door person",
      "Use of patio space (if available)",
      "Other production items included on the attached Addendum C (Technical Rider)",
    ],
  },
  idc: {
    name: "Ideal Dress Club",
    cap: 600,
    weekday: 2500,
    weekend: 5000,
    address: "2413 University Ave, Des Moines, IA",
    provisional: true,
    included: null,
  },
};

export const roomInfo = (roomId: string): RoomInfo => RENTAL_ROOMS[roomId] ?? RENTAL_ROOMS.xbk;

export const LISTS = {
  eventType: [
    "Birthday or private party",
    "Wedding ceremony",
    "Wedding reception",
    "Rehearsal dinner",
    "Corporate event or meeting",
    "Holiday or office party",
    "Fundraiser or gala",
    "Product launch or expo",
    "Private concert or showcase",
    "Recital",
    "Dance party",
    "Class, workshop or lecture",
    "Graduation party",
    "Celebration of life",
    "Film or photo shoot",
    "Other",
  ],
  setup: [
    "Tables and chairs (standard)",
    "Tables plus dance floor",
    "Ceremony rows",
    "Classroom or presentation",
    "Expo or vendor tables",
    "Open floor, standing",
  ],
  ent: ["None", "House music only", "DJ", "Acoustic, 1–2 performers", "Full band or drum kit", "Speeches or presentation (mic)", "Other"],
  Tables: [
    "6 ft banquet (rectangle)",
    "8 ft banquet (rectangle)",
    "60 in round (seats 8)",
    "72 in round (seats 10)",
    "30 in cocktail / high-top",
    "36 in cocktail / high-top",
    "Kids table",
    "Other",
  ],
  Chairs: ["White folding", "Black folding", "Chiavari", "Cross-back / farmhouse", "Ghost (clear)", "Banquet (padded)", "Barstool", "Other"],
  Linens: ["Banquet tablecloth", "Round tablecloth", "Cocktail table cover", "Table runner", "Napkins", "Other"],
};

export const BLOCKS = { eve: "Evening block (5pm–11pm)", day: "Daytime block (10am–4pm)", custom: "Custom time" } as const;
export const FOODS = { none: "No food", meal: "Catered meal", apps: "Appetizers or light food" } as const;
export const BARS = {
  pre: "Pre-paid tab by client (+20% gratuity)",
  lim: "Limited complimentary options (+20% gratuity)",
  ongo: "Ongoing tab, paid at end of night (+20% gratuity)",
  cash: "Cash bar",
  none: "No bar or drink service",
} as const;

export type VendorKind = "Tables" | "Chairs" | "Linens";
export type Line = { kind: VendorKind | "Item"; type: string; other: string; name: string; qty: number; fee: number | null };
export type Person = { name: string; email: string; cell: string; phone: string; alt: string; addr: string; csz: string };

export type RentalDetails = {
  client: string; // organization or client name
  contact: Person;
  nonProfit: boolean;
  taxExempt: boolean;
  hasClient2: boolean;
  client2: Person;
  xbkContact: { name: string; email: string };
  date: string; // ISO
  eventType: string;
  description: string;
  attendance: number | null;
  block: keyof typeof BLOCKS;
  start: string; // "18:00"
  end: string;
  setup: string;
  ent: string;
  entOther: string;
  food: keyof typeof FOODS;
  catName: string;
  catPhone: string;
  catEmail: string;
  storage: boolean;
  vendor: Line[];
  items: Line[];
  bar: keyof typeof BARS;
  tab: number | null;
  incl: string;
  rate: number | null; // null = the starting rate for the room, day and non-profit status
  depBasis: "rate" | "total";
  notes: string; // staff only
};

const emptyPerson = (): Person => ({ name: "", email: "", cell: "", phone: "", alt: "", addr: "", csz: "" });

export function defaultDetails(init: Partial<RentalDetails> = {}): RentalDetails {
  return {
    client: "",
    contact: emptyPerson(),
    nonProfit: false,
    taxExempt: false,
    hasClient2: false,
    client2: emptyPerson(),
    xbkContact: { name: "", email: "" },
    date: "",
    eventType: LISTS.eventType[0],
    description: "",
    attendance: null,
    block: "eve",
    start: "18:00",
    end: "22:00",
    setup: LISTS.setup[0],
    ent: "None",
    entOther: "",
    food: "none",
    catName: "",
    catPhone: "",
    catEmail: "",
    storage: false,
    vendor: [],
    items: [],
    bar: "cash",
    tab: null,
    incl: "",
    rate: null,
    depBasis: "rate",
    notes: "",
    ...init,
  };
}

// Fill in anything missing from a saved rental (older saves, hand edits).
export function normalizeDetails(raw: unknown): RentalDetails {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RentalDetails>;
  const d = defaultDetails(r);
  d.contact = { ...emptyPerson(), ...(r.contact ?? {}) };
  d.client2 = { ...emptyPerson(), ...(r.client2 ?? {}) };
  d.xbkContact = { name: "", email: "", ...(r.xbkContact ?? {}) };
  d.vendor = Array.isArray(r.vendor) ? r.vendor : [];
  d.items = Array.isArray(r.items) ? r.items : [];
  return d;
}

export const money = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round(n * 100) / 100;

export function isWeekend(iso: string): boolean {
  if (!iso) return false;
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6 || dow === 0; // Fri, Sat, Sun
}

export function lineName(l: Line): string {
  if (l.kind === "Item") return l.name.trim();
  return l.type === "Other" ? l.other.trim() : l.type;
}
export const lineTotal = (l: Line) => (l.qty || 0) * (l.fee ?? 0);

function minutes(t: string): number {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 864e5);
}

export const TAX_RATE = 0.07;
export const EXTRA_HOUR_FEE = 250;
export const STORAGE_FEE = 150;
export const GRATUITY = 0.2;

export type RentalFees = {
  room: RoomInfo;
  weekend: boolean;
  defaultRate: number; // the room's rate for that day
  startRate: number; // after the non-profit 50%
  rate: number; // charged
  hours: number;
  extraHours: number;
  extra: number;
  storage: number;
  vendorTotal: number;
  itemTotal: number;
  barTotal: number; // tab + gratuity, for pre-paid and limited tabs
  gratuity: number;
  subtotal: number;
  tax: number;
  total: number;
  within30: boolean; // event less than 30 days out: everything due at signing
  deposit: number;
  balance: number;
  balanceDue: string; // ISO, ten days before the event
};

export function rentalFees(roomId: string, d: RentalDetails, todayIso: string): RentalFees {
  const room = roomInfo(roomId);
  const weekend = isWeekend(d.date);
  const defaultRate = weekend ? room.weekend : room.weekday;
  const startRate = defaultRate * (d.nonProfit ? 0.5 : 1);
  const rate = d.rate ?? startRate;

  let hours = (minutes(d.end) - minutes(d.start)) / 60;
  if (hours < 0) hours += 24;
  const extraHours = d.block === "custom" ? Math.max(0, Math.ceil(hours - 6)) : 0;
  const extra = extraHours * EXTRA_HOUR_FEE;
  const storage = d.storage ? STORAGE_FEE : 0;
  const vendorTotal = round2(d.vendor.reduce((s, l) => s + lineTotal(l), 0));
  const itemTotal = round2(d.items.reduce((s, l) => s + lineTotal(l), 0));
  const tabbed = d.bar === "pre" || d.bar === "lim";
  const gratuity = tabbed ? round2((d.tab ?? 0) * GRATUITY) : 0;
  const barTotal = tabbed ? round2((d.tab ?? 0) + gratuity) : 0;

  const subtotal = round2(rate + extra + storage + vendorTotal + itemTotal + barTotal);
  const tax = d.taxExempt ? 0 : round2(subtotal * TAX_RATE);
  const total = round2(subtotal + tax);
  const within30 = d.date ? daysBetween(todayIso, d.date) < 30 : false;
  const deposit = within30 ? total : round2((d.depBasis === "rate" ? rate : total) * 0.5);
  return {
    room,
    weekend,
    defaultRate,
    startRate,
    rate,
    hours,
    extraHours,
    extra,
    storage,
    vendorTotal,
    itemTotal,
    barTotal,
    gratuity,
    subtotal,
    tax,
    total,
    within30,
    deposit,
    balance: round2(total - deposit),
    balanceDue: d.date ? addDays(d.date, -10) : "",
  };
}

// Everything that must be filled in before the rental can be saved.
export function rentalProblems(roomId: string, d: RentalDetails): string[] {
  const room = roomInfo(roomId);
  const errs: string[] = [];
  if (!d.client.trim()) errs.push("Enter the organization or client name.");
  if (!d.contact.name.trim()) errs.push("Enter the contact name.");
  if (!d.contact.email.trim()) errs.push("Enter the contact's email.");
  if (!d.xbkContact.name.trim()) errs.push("Choose the xBk contact.");
  if (!d.date) errs.push("Pick the event date.");
  if (!d.start || !d.end) errs.push("Enter the event start and end times.");
  if (!d.attendance || d.attendance < 1) errs.push("Enter the anticipated attendance.");
  else if (d.attendance > room.cap) errs.push(`Attendance is over ${room.name}'s capacity of ${room.cap}.`);
  if (d.ent === "Other" && !d.entOther.trim()) errs.push("Describe the entertainment when you pick Other.");
  if (d.food !== "none" && !d.catName.trim()) errs.push("Enter the caterer.");
  if ((d.bar === "pre" || d.bar === "lim" || d.bar === "ongo") && d.tab === null) errs.push("Enter the tab amount.");
  for (const l of d.vendor) {
    const k = l.kind.toLowerCase();
    if (!l.type) errs.push(`Choose a type for each ${k} line.`);
    else if (l.type === "Other" && !l.other.trim()) errs.push(`Describe the "Other" ${k}.`);
    if (l.fee === null) errs.push(`Enter the fee for each ${k} line.`);
  }
  for (const l of d.items) {
    if (!l.name.trim()) errs.push("Name each rental item.");
    if (l.fee === null) errs.push("Enter the fee for each rental item.");
  }
  if (d.rate !== null && d.rate < 0) errs.push("The rental rate can't be negative.");
  return [...new Set(errs)];
}

export const RENTAL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  cancelled: "Cancelled",
};

export function fmtLongDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Cover email to go with the contract PDF.
export function rentalEmailText(roomId: string, d: RentalDetails, f: RentalFees, from: string): string {
  const first = d.contact.name.trim().split(/\s+/)[0] || "there";
  const lines = [
    `Hi ${first},`,
    "",
    `Attached is the rental agreement for ${d.client.trim() || "your event"} at ${f.room.name} on ${fmtLongDate(d.date)}, ${fmtTime(d.start)} to ${fmtTime(d.end)}.`,
    "",
    `Total fees: ${money(f.subtotal)}`,
    d.taxExempt ? "Sales tax: tax exempt (please send your Iowa exemption certificate)" : `Sales tax (7%): ${money(f.tax)}`,
    `Total: ${money(f.total)}`,
    f.within30
      ? `Because the event is less than 30 days away, the full ${money(f.total)} is due when you sign.`
      : `Deposit due now: ${money(f.deposit)}. Remaining balance of ${money(f.balance)} due by ${fmtLongDate(f.balanceDue)}.`,
    "",
    "To reserve the date, please sign the agreement, fill in the payment section and send it back. The reservation is released if the deposit isn't paid within three days of the invoice.",
  ];
  if (d.nonProfit) lines.push("", "Please include proof of non-profit status with the signed agreement.");
  lines.push("", "Let me know if you have any questions.", "", "Thanks,", from, `${f.room.name} · www.xbklive.com`);
  return lines.join("\n");
}
