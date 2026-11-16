// Reads Eventim's "Daily Event Stats" email: one row per event with tickets sold, unsold,
// face value collected and the last 24 hours' change. Plain functions, unit-tested with Node.

export type ReportRow = {
  name: string; // Eventim cuts names to about 20 characters
  venue: string; // "xBk Live, Des Moines"
  date: string; // ISO
  sold: number;
  unsold: number;
  net: number; // face value collected
  change: number; // tickets in the last 24 hours
  changeNet: number;
};

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// HTML email → the text in each table cell / line, in order.
export function emailTokens(html: string): string[] {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|tr|p|div|li|h\d|table|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#8217;/g, "’")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const money = (s: string) => Number(s.replace(/[$,]/g, ""));
const isInt = (s: string) => /^-?\d[\d,]*$/.test(s);
const isMoney = (s: string) => /^-?\$-?[\d,]+(\.\d+)?$/.test(s);
const DATE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4})$/;

// Eventim sometimes repeats a name three times in one cell ("A Charlie Brown Chri A Charlie Brown Chri ...").
function dedupeName(s: string): string {
  const words = s.split(" ");
  for (let n = 1; n <= words.length / 2; n++) {
    const part = words.slice(0, n).join(" ");
    const rest = s.slice(part.length).trim();
    if (rest && (rest === part || rest.split(part).every((x) => !x.trim()))) return part;
  }
  return s;
}

export function parseDailyStats(tokens: string[]): { rows: ReportRow[]; reportDate: string | null } {
  // Some emails put a whole row on one line ("xBk Live, Des Moines Nov 17 2026 7 248 $170.00 1 $20.00");
  // split those so dates and numbers stand alone.
  const t: string[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^(.*?)\s*\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{4})\b\s*(.*)$/);
    if (m && (m[1] || m[3])) {
      if (m[1]) t.push(m[1].trim());
      t.push(m[2]);
      if (m[3]) t.push(...m[3].trim().split(/\s+/));
    } else t.push(tok);
  }

  const rows: ReportRow[] = [];
  let reportDate: string | null = null;
  for (let i = 0; i < t.length; i++) {
    const d = t[i].match(DATE);
    if (!d) continue;
    const nums = t.slice(i + 1, i + 6);
    if (!(isInt(nums[0] ?? "") && isInt(nums[1] ?? "") && isMoney(nums[2] ?? "") && isInt(nums[3] ?? "") && isMoney(nums[4] ?? ""))) continue;
    // Look back for the venue ("…, Des Moines") and the name above it.
    let venue = "";
    let name = "";
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const s = t[j];
      if (!venue && /,\s*[A-Z][a-z]+/.test(s) && /xbk|annex|ideal|live/i.test(s)) {
        venue = s;
        continue;
      }
      if (!name && !isInt(s) && !isMoney(s) && !DATE.test(s)) {
        name = dedupeName(s);
        break;
      }
    }
    const iso = `${d[3]}-${MONTHS[d[1]]}-${d[2].padStart(2, "0")}`;
    rows.push({
      name,
      venue,
      date: iso,
      sold: Number(nums[0].replace(/,/g, "")),
      unsold: Number(nums[1].replace(/,/g, "")),
      net: money(nums[2]),
      change: Number(nums[3].replace(/,/g, "")),
      changeNet: money(nums[4]),
    });
    i += 5;
  }
  // The email's own date line ("November 15, 2026").
  const long = tokens.join("\n").match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\b/);
  if (long) {
    const m = String(["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(long[1]) + 1).padStart(2, "0");
    reportDate = `${long[3]}-${m}-${long[2].padStart(2, "0")}`;
  }
  return { rows, reportDate };
}

// Which room an Eventim venue name means.
export function roomFor(venue: string): string | null {
  const v = venue.toLowerCase();
  if (v.includes("annex")) return "annex";
  if (v.includes("ideal") || v.includes("idc")) return "idc";
  if (v.includes("xbk")) return "xbk";
  return null;
}

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// How well a (cut-off) Eventim name fits a hold's name: 0–1.
export function nameScore(eventimName: string, holdTitle: string): number {
  const a = key(eventimName);
  const b = key(holdTitle);
  if (!a || !b) return 0;
  if (b.startsWith(a) || a.startsWith(b)) return 1;
  const aw = a.split(" ").filter((w) => w.length > 1);
  const bw = new Set(b.split(" "));
  const hits = aw.filter((w, i) => bw.has(w) || (i === aw.length - 1 && [...bw].some((x) => x.startsWith(w)))).length;
  return aw.length ? hits / aw.length : 0;
}

export type HoldLite = { id: string; room_id: string; date: string; title: string };

// Match each row to a confirmed hold on the same date in the same room. One hold per room and date,
// so two Eventim events that night (early and late shows) both count toward it.
export function matchRows(rows: ReportRow[], holds: HoldLite[]): { row: ReportRow; holdId: string | null }[] {
  return rows.map((row) => {
    const room = roomFor(row.venue);
    const same = holds.filter((h) => h.date === row.date && (!room || h.room_id === room));
    if (same.length === 0) return { row, holdId: null };
    if (same.length === 1) return { row, holdId: same[0].id };
    const best = same.map((h) => ({ h, s: nameScore(row.name, h.title) })).sort((x, y) => y.s - x.s)[0];
    return { row, holdId: best.s > 0 ? best.h.id : null };
  });
}
