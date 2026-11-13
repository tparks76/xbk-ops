import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
`);
import { readdirSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(f, dir), 'utf8'));
}
await db.exec(`insert into staff values ('tobi@xbk.com','Tobi','owner'),('bill@xbk.com','Bill','booker'),('mod@xbk.com','Mo','mod');`);

const as = (email) => db.exec(`set test.jwt = '${JSON.stringify({ email })}'`);
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('FAIL:', msg)); };
const q = async (sql, p) => (await db.query(sql, p)).rows;
const stack = async (room, date) =>
  (await q(`select title, rank, status from holds where room_id=$1 and date=$2 and status in ('hold','offer_out') order by rank`, [room, date]))
    .map(r => `${r.title}:H${r.rank}`).join(' ');
const err = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

await as('bill@xbk.com');
const D = '2027-03-14';
const a = (await q(`select * from place_hold('xbk',$1,'Alpha')`, [D]))[0];
ok(a.rank === 2, 'first hold is H2');
const b = (await q(`select * from place_hold('xbk',$1,'Beta')`, [D]))[0];
const c = (await q(`select * from place_hold('xbk',$1,'Gamma')`, [D]))[0];
ok(await stack('xbk', D) === 'Alpha:H2 Beta:H3 Gamma:H4', 'ranks 2,3,4');

const ann = (await q(`select * from place_hold('annex',$1,'AnnexAct')`, [D]))[0];
ok(ann.rank === 2, 'annex independent');

// multi-date
const multi = await q(`select * from place_holds('idc', array['2027-04-01','2027-04-02','2027-04-01']::date[], 'Delta', 'rental')`);
ok(multi.length === 2 && multi[0].group_id && multi[0].group_id === multi[1].group_id && multi[0].kind === 'rental', 'multi-date grouped, deduped');

// promote Beta (H3) to H1 -> Beta H1, Alpha H2, Gamma H3
await q(`select * from move_hold($1, 1)`, [b.id]);
ok(await stack('xbk', D) === 'Beta:H1 Alpha:H2 Gamma:H3', 'promote: ' + await stack('xbk', D));
// move Gamma up to H2 -> Alpha pushed to H3
await q(`select * from move_hold($1, 2)`, [c.id]);
ok(await stack('xbk', D) === 'Beta:H1 Gamma:H2 Alpha:H3', 'move up: ' + await stack('xbk', D));
// move Gamma to H9 -> clamps to bottom
await q(`select * from move_hold($1, 9)`, [c.id]);
ok(await stack('xbk', D) === 'Beta:H1 Alpha:H2 Gamma:H3', 'move down clamp: ' + await stack('xbk', D));

// release H1 -> nobody moves into H1
await q(`select * from release_hold($1, 'tour cancelled')`, [b.id]);
ok(await stack('xbk', D) === 'Alpha:H2 Gamma:H3', 'release H1: ' + await stack('xbk', D));
// add two more, release H2 -> shift up, still never H1
const e = (await q(`select * from place_hold('xbk',$1,'Echo')`, [D]))[0];
ok(e.rank === 4, 'Echo H4');
await q(`select * from release_hold($1)`, [a.id]);
ok(await stack('xbk', D) === 'Gamma:H2 Echo:H3', 'release H2 shifts: ' + await stack('xbk', D));

// offer out
await q(`select * from set_offer_out($1, true)`, [e.id]);
ok((await q(`select status from holds where id=$1`, [e.id]))[0].status === 'offer_out', 'offer out');

// challenge: Echo (H3) challenges Gamma (H2)
const ch = await q(`select * from challenge($1, 48)`, [e.id]);
ok(ch.length === 1 && ch[0].title === 'Gamma' && ch[0].challenge_deadline, 'challenge marks holds above');
ok(await err(() => q(`select * from challenge($1)`, [ch[0].id])) !== null, 'H2 with nothing above cannot challenge');
await q(`select cancel_challenge($1)`, [e.id]);
ok((await q(`select challenge_deadline from holds where id=$1`, [c.id]))[0].challenge_deadline === null, 'cancel challenge');
await q(`select * from challenge($1, 24)`, [e.id]);
// challenged Gamma releases -> Echo moves to H2, challenge cleared
await q(`select * from release_hold($1, 'passed on challenge')`, [c.id]);
ok(await stack('xbk', D) === 'Echo:H2', 'challenged releases, challenger moves up: ' + await stack('xbk', D));

// confirm releases others
const f = (await q(`select * from place_hold('xbk',$1,'Foxtrot')`, [D]))[0];
const rel = await q(`select * from confirm_hold($1)`, [e.id]);
ok(rel.length === 1 && rel[0].title === 'Foxtrot' && rel[0].released_reason.includes('Echo'), 'confirm releases others');
ok(await stack('xbk', D) === '', 'no active holds after confirm');
ok((await err(() => q(`select * from place_hold('xbk',$1,'Golf')`, [D]))) !== null, 'cannot hold a confirmed date');
// cancel confirmed then hold again
await q(`select * from release_hold($1, 'show cancelled')`, [e.id]);
const g = (await q(`select * from place_hold('xbk',$1,'Golf')`, [D]))[0];
ok(g.rank === 2, 'date reopens at H2');

// permissions
await as('mod@xbk.com');
ok((await err(() => q(`select * from place_hold('xbk','2027-05-01','Nope')`))) !== null, 'MOD cannot place holds');
await as('stranger@gmail.com');
ok((await err(() => q(`select * from place_hold('xbk','2027-05-01','Nope')`))) !== null, 'stranger cannot place holds');
await as('tobi@xbk.com');
ok((await q(`select * from place_hold('xbk','2027-05-01','OwnerHold')`))[0].placed_by === 'tobi@xbk.com', 'owner can place');

// release all holds for an artist (case-insensitive, keeps confirmed, closes gaps)
await as('bill@xbk.com');
const R1 = '2027-06-01', R2 = '2027-06-02';
await q(`select * from place_hold('xbk',$1,'Other')`, [R1]);
const z1 = (await q(`select * from place_hold('xbk',$1,'Zulu')`, [R1]))[0];
const z2 = (await q(`select * from place_hold('annex',$1,'Zulu')`, [R2]))[0];
await q(`select * from place_hold('xbk',$1,'Behind')`, [R1]);
const z3 = (await q(`select * from place_hold('idc',$1,'Zulu')`, [R2]))[0];
await q(`select * from confirm_hold($1)`, [z3.id]);
const rel2 = await q(`select * from release_artist('zulu', null)`);
ok(rel2.length === 2, 'release_artist released 2 holds: ' + rel2.length);
ok(await stack('xbk', R1) === 'Other:H2 Behind:H3', 'gap closed after artist release: ' + await stack('xbk', R1));
ok((await q(`select status from holds where id=$1`, [z3.id]))[0].status === 'confirmed', 'confirmed date untouched');
await as('mod@xbk.com');
ok((await err(() => q(`select * from release_artist('Other')`))) !== null, 'MOD cannot release artist');
await as('tobi@xbk.com');

// offers: mark sent flips the offer's holds to offer_out
await as('bill@xbk.com');
const O1 = (await q(`select * from place_holds('annex', array['2027-07-01','2027-07-02']::date[], 'Oscar')`));
const off = (await q(`insert into offers (hold_ids, room_id, title, created_by) values ($1, 'annex', 'Oscar', 'bill@xbk.com') returning *`, [O1.map(h => h.id)]))[0];
await q(`select * from mark_offer_sent($1)`, [off.id]);
const st = await q(`select status from holds where id = any($1)`, [O1.map(h => h.id)]);
ok(st.every(r => r.status === 'offer_out'), 'mark_offer_sent sets offer_out');
ok((await q(`select status from offers where id=$1`, [off.id]))[0].status === 'sent', 'offer marked sent');
await as('tobi@xbk.com');

const ev = await q(`select count(*)::int n from hold_events`);
ok(ev[0].n > 15, 'activity logged: ' + ev[0].n);
console.log(`${pass} passed, ${fail} failed`);
