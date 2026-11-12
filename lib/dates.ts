// All calendar dates are plain "YYYY-MM-DD" strings, worked on in UTC so
// that time zones never shift a show to the wrong day.

export const TZ = "America/Chicago";

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

export function isValidISO(d: string | undefined | null): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && toISO(parseISO(d)) === d;
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

export function isValidMonth(m: string | undefined): m is string {
  return !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  const x = new Date(Date.UTC(y, mo - 1 + n, 1));
  return toISO(x).slice(0, 7);
}

export function monthLabel(m: string): string {
  return parseISO(m + "-01").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysInMonth(m: string): string[] {
  const out: string[] = [];
  let d = m + "-01";
  while (monthKey(d) === m) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// Weeks (Sunday first) covering the whole month.
export function monthGrid(m: string): string[][] {
  const first = m + "-01";
  const start = addDays(first, -parseISO(first).getUTCDay());
  const weeks: string[][] = [];
  let d = start;
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(d);
      d = addDays(d, 1);
    }
    weeks.push(week);
  } while (monthKey(d) === m);
  return weeks;
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return parseISO(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  });
}

export function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}
