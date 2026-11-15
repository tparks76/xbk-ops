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

// rentals: mark sent flips the rental's holds to offer_out; MOD can't
await as('bill@xbk.com');
const RH = await q(`select * from place_holds('xbk', array['2027-09-10']::date[], 'Drake Alumni', 'rental')`);
const ren = (await q(`insert into rentals (hold_ids, room_id, title, event_date, details, created_by) values ($1, 'xbk', 'Drake Alumni', '2027-09-10', '{"rate":1500}', 'bill@xbk.com') returning *`, [RH.map(h => h.id)]))[0];
ok(ren.status === 'draft', 'rental starts as draft');
await as('mod@xbk.com');
ok((await err(() => q(`select * from mark_rental_sent($1)`, [ren.id]))) !== null, 'MOD cannot mark a rental sent');
await as('bill@xbk.com');
await q(`select * from mark_rental_sent($1)`, [ren.id]);
ok((await q(`select status from holds where id=$1`, [RH[0].id]))[0].status === 'offer_out', 'mark_rental_sent sets offer_out');
ok((await q(`select status, sent_at from rentals where id=$1`, [ren.id]))[0].sent_at !== null, 'rental sent_at set');
await q(`delete from rentals where id=$1`, [ren.id]);
ok((await q(`select count(*)::int n from holds where id=$1`, [RH[0].id]))[0].n === 1, 'deleting a rental keeps its hold');
await as('tobi@xbk.com');

// promoter rentals: a third hold type
await as('bill@xbk.com');
const PH = await q(`select * from place_holds('annex', array['2027-10-02']::date[], 'Promoter Night', 'promoter')`);
const CP = await q(`select * from place_holds('annex', array['2027-10-03']::date[], 'Co-Pro Night', 'copro')`);
ok(CP[0].kind === 'copro', 'co-pro hold placed');
ok(PH[0].kind === 'promoter' && PH[0].rank === 2, 'promoter hold placed at H2');
await as('tobi@xbk.com');

// artists: holds link to one artist record; known names and aliases use the standard spelling
await as('bill@xbk.com');
const A1 = await q(`select * from place_holds('xbk', array['2027-11-05']::date[], 'Lily  DeTaeye', 'show', 'Pat Agent', 'Big Agency', 'pat@agency.com')`);
const art = (await q(`select * from artists where key='lily detaeye'`))[0];
ok(art && A1[0].artist_id === art.id && A1[0].title === 'Lily DeTaeye', 'new name creates an artist (spaces tidied)');
ok(art.agent_email === 'pat@agency.com', 'artist picks up the default agent');
const A2 = await q(`select * from place_holds('annex', array['2027-11-06']::date[], 'lily detaeye', 'show')`);
ok(A2[0].artist_id === art.id && A2[0].title === 'Lily DeTaeye', 'same name, any case, reuses the artist and its spelling');
const PR1 = await q(`select * from place_holds('annex', array['2027-11-07']::date[], 'Smith Wedding', 'rental')`);
ok(PR1[0].artist_id === null && (await q(`select count(*)::int n from artists where key='smith wedding'`))[0].n === 0, 'private rentals are not artists');
await q(`select * from save_artist($1,'Lily DeTaeye Band','{}','{folk, indie}',null,'{"spotify":"https://open.spotify.com/artist/x","instagram":" "}','Pat Agent','Big Agency','pat@agency.com',null)`, [art.id]);
ok((await q(`select title from holds where id=$1`, [A1[0].id]))[0].title === 'Lily DeTaeye Band', 'renaming an artist renames its holds');
ok((await q(`select aliases from artists where id=$1`, [art.id]))[0].aliases.includes('Lily DeTaeye'), 'old name kept as an alias');
ok(JSON.stringify((await q(`select links from artists where id=$1`, [art.id]))[0].links) === '{"spotify":"https://open.spotify.com/artist/x"}', 'links saved, blanks dropped');
const A3 = await q(`select * from place_holds('xbk', array['2027-11-08']::date[], 'LILY DETAEYE', 'show')`);
ok(A3[0].artist_id === art.id && A3[0].title === 'Lily DeTaeye Band', 'alias finds the artist');
const DUP = await q(`select * from place_holds('xbk', array['2027-11-09']::date[], 'Lilly DeTaeye', 'show')`);
const dupId = DUP[0].artist_id;
ok(dupId && dupId !== art.id, 'typo makes a separate artist');
await q(`select * from merge_artists($1,$2)`, [art.id, dupId]);
const Dh = (await q(`select title, artist_id from holds where id=$1`, [DUP[0].id]))[0];
ok(Dh.artist_id === art.id && Dh.title === 'Lily DeTaeye Band', 'merge moves holds to the kept artist');
ok((await q(`select count(*)::int n from artists where id=$1`, [dupId]))[0].n === 0, 'merged duplicate removed');
await as('mod@xbk.com');
ok((await err(() => q(`select * from merge_artists($1,$1)`, [art.id]))) !== null, 'MOD cannot merge artists');
await as('tobi@xbk.com');

// deleting artists: holds stay; ignored names don't come back
await as('bill@xbk.com');
const T1 = await q(`select * from place_holds('xbk', array['2027-12-01']::date[], 'TBD', 'show')`);
const tbd = T1[0].artist_id;
ok(!!tbd, 'TBD became an artist');
await q(`select delete_artist($1, true)`, [tbd]);
ok((await q(`select artist_id, title from holds where id=$1`, [T1[0].id]))[0].title === 'TBD', 'hold kept after artist deleted');
const T2 = await q(`select * from place_holds('annex', array['2027-12-02']::date[], 'tbd', 'show')`);
ok(T2[0].artist_id === null && (await q(`select count(*)::int n from artists where key='tbd'`))[0].n === 0, 'ignored name not added back');
await q(`select unignore_artist_name('tbd')`);
ok((await q(`select count(*)::int n from holds where artist_id is not null and lower(title)='tbd'`))[0].n === 2, 'un-ignoring relinks its holds');
const X1 = await q(`select * from place_holds('xbk', array['2027-12-03']::date[], 'One Off Band', 'show')`);
await q(`select delete_artist($1, false)`, [X1[0].artist_id]);
await q(`update holds set notes='x' where id=$1`, [X1[0].id]);
ok((await q(`select count(*)::int n from artists where key='one off band'`))[0].n === 0, 'deleted (not ignored) artist stays deleted until the name is typed again');
await as('mod@xbk.com');
ok((await err(() => q(`select delete_artist($1, false)`, [T2[0].artist_id ?? tbd]))) !== null, 'MOD cannot delete artists');
await as('tobi@xbk.com');

// staff page: only owners change staff; owners can't lock themselves out
await as('bill@xbk.com');
ok((await err(() => q(`select * from save_staff('bill@xbk.com','Bill Rogers','owner',true)`))) !== null, 'booker cannot change staff');
await as('tobi@xbk.com');
await q(`select * from save_staff('bill@xbk.com','Bill Rogers','booker',true)`);
ok((await q(`select name from staff where email='bill@xbk.com'`))[0].name === 'Bill Rogers', 'owner renames staff');
await q(`select * from save_staff(' New.Person@XBK.com ','New Person','marketing',true)`);
ok((await q(`select role from staff where email='new.person@xbk.com'`))[0]?.role === 'marketing', 'owner adds staff (email lowercased)');
ok((await err(() => q(`select * from save_staff('tobi@xbk.com','Tobi','booker',true)`))) !== null, 'owner cannot demote self');
ok((await err(() => q(`select * from save_staff('tobi@xbk.com','Tobi','owner',false)`))) !== null, 'owner cannot deactivate self');
ok((await err(() => q(`select * from save_staff('nope','X','mod',true)`))) !== null, 'bad email rejected');

// date notes: one row per outside event, manual notes unaffected
await db.exec(`insert into date_notes (date, body, created_by) values ('2027-08-01','Manual a','tobi@xbk.com'), ('2027-08-01','Manual b','tobi@xbk.com')`);
await db.exec(`insert into date_notes (date, body, created_by, source, external_id) values ('2027-08-02','Band @ Arena','auto','ticketmaster','TM1') on conflict (source, external_id) do nothing`);
await db.exec(`insert into date_notes (date, body, created_by, source, external_id) values ('2027-08-02','Band @ Arena','auto','ticketmaster','TM1') on conflict (source, external_id) do nothing`);
ok((await q(`select count(*)::int n from date_notes where external_id='TM1'`))[0].n === 1, 'auto note not duplicated');
ok((await q(`select count(*)::int n from date_notes where source='manual'`))[0].n === 2, 'manual notes allowed many');

const ev = await q(`select count(*)::int n from hold_events`);
ok(ev[0].n > 15, 'activity logged: ' + ev[0].n);
console.log(`${pass} passed, ${fail} failed`);
