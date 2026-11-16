import { defaultTerms } from "../lib/offer";
import { track, countFromTiers } from "../lib/track";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? pass++ : (fail++, console.log("FAIL:", m)));
const t = { ...defaultTerms("xbk"), dealType: "vs" as const, guarantee: 1000, percent: 70,
  tiers: [{ name: "Advance", price: 20, qty: 200 }, { name: "Day of show", price: 25, qty: 50 }] };
const c = (daysAgo: number, sold: number) => ({ counted_at: new Date(Date.parse("2026-11-15T12:00:00Z") - daysAgo * 864e5).toISOString(), sold, comps: 0, gross: sold * 20, tiers: [], source: "manual" });
const none = track(t, [], "2026-12-15", "2026-11-15");
ok(none.status === "no-data" && none.cap === 250 && none.daysLeft === 30, "no counts yet");
const tr = track(t, [c(0, 100), c(7, 65), c(14, 40)], "2026-12-15", "2026-11-15");
ok(tr.sold === 100 && tr.gross === 2000 && tr.pctSold === 40, "latest count used");
ok(tr.last7 === 35, "pace: 35 in the last 7 days, got " + tr.last7);
ok(tr.projected === 250, "projection capped at capacity: " + tr.projected);
ok(tr.now.artist === Math.max(1000, tr.now.artist) && tr.now.gross === 2000, "deal at today's sales");
ok(tr.breakEven !== null && tr.toBreakEven === Math.max(0, tr.breakEven - 100), "tickets to break-even");
const cnt = countFromTiers([{ name: "Advance", sold: 10, price: 20, gross: 0 }, { name: "DOS", sold: 3, price: 25, gross: 0 }], 4);
ok(cnt.sold === 13 && cnt.gross === 275 && cnt.comps === 4, "count from tiers");
console.log(`${pass} passed, ${fail} failed`);
