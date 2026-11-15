import { defaultDetails, rentalFees, rentalProblems, isWeekend, rentalEmailText } from "../lib/rental.ts";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? pass++ : (fail++, console.log("FAIL:", m)));
const base = defaultDetails({
  eventName: "Spring Mixer", client: "Drake Alumni", contact: { name: "Jordan Lee", email: "j@x.org", cell: "", phone: "", alt: "", addr: "", csz: "" },
  xbkContact: { name: "Bill Rogers", email: "bill.rogers@xbklive.com" }, date: "2027-04-23", attendance: 140,
});
ok(isWeekend("2027-04-23") && !isWeekend("2027-04-22") && isWeekend("2027-04-25") && !isWeekend("2027-04-26"), "Fri–Sun weekend, Mon–Thu weekday");
let f = rentalFees("xbk", base, "2026-11-14");
ok(f.rate === 3000 && f.subtotal === 3000 && f.tax === 210 && f.total === 3210, "xBk weekend: " + JSON.stringify([f.rate, f.tax, f.total]));
ok(f.deposit === 1500 && f.balance === 1710 && f.balanceDue === "2027-04-13", "deposit 50% of rate, balance due 10 days before");
f = rentalFees("xbk", { ...base, depBasis: "total" }, "2026-11-14");
ok(f.deposit === 1605, "deposit 50% of total: " + f.deposit);
f = rentalFees("annex", { ...base, date: "2027-04-21", nonProfit: true, taxExempt: true, attendance: 40 }, "2026-11-14");
ok(f.rate === 375 && f.tax === 0, "Annex weekday non-profit tax exempt: " + f.rate);
f = rentalFees("xbk", { ...base, rate: 2000 }, "2026-11-14");
ok(f.rate === 2000, "hand-set rate kept");
f = rentalFees("xbk", { ...base, block: "custom", start: "14:00", end: "23:30", storage: true, bar: "pre", tab: 1000,
  vendor: [{ kind: "Chairs", type: "Chiavari", other: "", name: "", qty: 80, fee: 4.5 }],
  items: [{ kind: "Item", type: "", other: "", name: "Mic", qty: 1, fee: 50 }] }, "2026-11-14");
ok(f.extraHours === 4 && f.extra === 1000, "custom 9.5h → 4 extra hours: " + f.extraHours);
ok(f.subtotal === 3000 + 1000 + 150 + 360 + 50 + 1200, "subtotal adds everything: " + f.subtotal);
f = rentalFees("xbk", { ...base, date: "2026-11-30" }, "2026-11-14");
ok(f.within30 && f.deposit === f.total && f.balance === 0, "within 30 days: all due at signing");
ok(rentalProblems("xbk", base).length === 0, "complete form has no problems: " + rentalProblems("xbk", base));
ok(rentalProblems("annex", base).some((x) => x.includes("capacity")), "Annex capacity enforced");
ok(rentalProblems("xbk", { ...base, ent: "Other", food: "meal", vendor: [{ kind: "Tables", type: "", other: "", name: "", qty: 1, fee: null }] }).length === 4, "Other/caterer/type/fee required");
ok(rentalEmailText("xbk", base, rentalFees("xbk", base, "2026-11-14"), "Bill Rogers").includes("Deposit due now: $1,500.00"), "email shows deposit");
console.log(`${pass} passed, ${fail} failed`);
