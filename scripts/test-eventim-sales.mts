import { totalsFromOrders, capacityFrom, isSold } from "../lib/eventim-sales";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? pass++ : (fail++, console.log("FAIL:", m)));
const orders = [
  { id: 1, isValid: true, createdAt: "2026-11-01T18:00:00Z", tickets: [
    { status: "purchased", faceValue: 20, ticketType: { name: "Advance" } },
    { status: "purchased", faceValue: 20, ticketType: { name: "Advance" } } ] },
  { id: 2, isValid: true, createdAt: "2026-11-03T18:00:00Z", tickets: [
    { status: "purchased", faceValue: 25, ticketType: { name: "Day of Show" } },
    { status: "refunded", faceValue: 20, ticketType: { name: "Advance" } },
    { status: "purchased", faceValue: 0, ticketType: { name: "Guest List" } } ] },
  { id: 3, isValid: false, createdAt: "2026-11-04T18:00:00Z", tickets: [{ status: "purchased", faceValue: 20 }] },
];
const t = totalsFromOrders(orders);
ok(t.sold === 3 && t.gross === 65 && t.comps === 1, "totals " + JSON.stringify([t.sold, t.gross, t.comps]));
ok(t.tiers.find((x) => x.name === "Advance")?.sold === 2 && t.tiers.find((x) => x.name === "Day of Show")?.price === 25, "tiers");
ok(t.statuses.refunded === 1, "statuses kept for checking");
ok(t.byDay.length === 2 && t.byDay[0].sold === 2 && t.byDay[1].sold === 3 && t.byDay[1].gross === 65, "running totals by day " + JSON.stringify(t.byDay));
ok(capacityFrom([{ allotment: 200 }, { allotment: 55 }]) === 255 && capacityFrom([]) === null, "capacity");
ok(isSold("purchased") && !isSold("cancelled") && !isSold("Refunded"), "statuses");
console.log(`${pass} passed, ${fail} failed`);
