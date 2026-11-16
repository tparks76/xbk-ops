import { emailTokens, parseDailyStats, matchRows, nameScore, roomFor } from "../lib/ticket-email";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? pass++ : (fail++, console.log("FAIL:", m)));
// Table cells, the way the HTML email lays them out
const html = `<html><body><p>November 15, 2026</p><table>
<tr><td>Total Tix Sold</td><td>1187</td></tr>
<tr><td><b>Dan Tedesco</b><br><span>xBk Live, Des Moines</span></td><td>Nov 17 2026</td><td>7</td><td>248</td><td>$170.00</td><td>1</td><td>$20.00</td></tr>
<tr><td><b>A Charlie Brown Chri A Charlie Brown Chri A Charlie Brown Chri</b><br><span>xBk Live, Des Moines</span></td><td>Dec 13 2026</td><td>17</td><td>73</td><td>$306.00</td><td>0</td><td>$0.00</td></tr>
<tr><td><b>A Charlie Brown Chri</b><br><span>xBk Live, Des Moines</span></td><td>Dec 13 2026</td><td>36</td><td>54</td><td>$648.00</td><td>0</td><td>$0.00</td></tr>
<tr><td><b>Otis Julius with spe</b><br><span>xBk Annex, Des Moines</span></td><td>Nov 21 2026</td><td>10</td><td>35</td><td>$150.00</td><td>0</td><td>$0.00</td></tr>
<tr><td><b>Janee &quot;Cool&quot; Harvey</b><br><span>xBk Live, Des Moines</span></td><td>Dec 16 2026</td><td>1,027</td><td>63</td><td>$1,324.00</td><td>6</td><td>$72.00</td></tr>
</table></body></html>`;
const { rows, reportDate } = parseDailyStats(emailTokens(html));
ok(reportDate === "2026-11-15", "report date " + reportDate);
ok(rows.length === 5, "5 rows, got " + rows.length);
ok(rows[0].name === "Dan Tedesco" && rows[0].date === "2026-11-17" && rows[0].sold === 7 && rows[0].unsold === 248 && rows[0].net === 170 && rows[0].change === 1, "Dan Tedesco row " + JSON.stringify(rows[0]));
ok(rows[1].name === "A Charlie Brown Chri", "tripled name cleaned: " + rows[1].name);
ok(rows[3].venue.includes("Annex") && roomFor(rows[3].venue) === "annex", "Annex venue");
ok(rows[4].sold === 1027 && rows[4].net === 1324 && rows[4].name.includes("Cool"), "commas and quotes " + JSON.stringify(rows[4]));
// The same rows as one line each (plain-text email)
const plain = parseDailyStats(["Dan Tedesco", "xBk Live, Des Moines Nov 17 2026 7 248 $170.00 1 $20.00"]).rows;
ok(plain.length === 1 && plain[0].sold === 7 && plain[0].name === "Dan Tedesco", "one-line rows " + JSON.stringify(plain));
ok(nameScore("Spanish Love Songs:", "Spanish Love Songs") === 1 && nameScore("Willi Carlisle - Gol", "Willi Carlisle") === 1, "name prefix");
ok(nameScore("Sam Miller (5PM Show", "Kelly Hunt") === 0, "different names");
const holds = [
  { id: "h1", room_id: "xbk", date: "2026-11-17", title: "Dan Tedesco" },
  { id: "h2", room_id: "xbk", date: "2026-12-13", title: "A Charlie Brown Christmas" },
  { id: "h3", room_id: "xbk", date: "2026-11-21", title: "James Tutson" },
];
const m = matchRows(rows, holds);
ok(m[0].holdId === "h1" && m[1].holdId === "h2" && m[2].holdId === "h2", "matched by date (two shows → one hold)");
ok(m[3].holdId === null, "Annex event doesn't match the xBk hold that night");
console.log(`${pass} passed, ${fail} failed`);
