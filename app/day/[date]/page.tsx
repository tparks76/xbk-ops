import Link from "next/link";
import { notFound } from "next/navigation";
import ChallengesPanel from "@/components/ChallengesPanel";
import ConfirmReleaseModal from "@/components/ConfirmReleaseModal";
import Flash from "@/components/Flash";
import HoldCard from "@/components/HoldCard";
import { getRooms, stackFor } from "@/lib/data";
import { ROOM_COLOR, holdsEmailText } from "@/lib/stack";
import { addDays, fmtDate, isValidISO, monthKey, todayISO } from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold } from "@/lib/types";

type Props = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ error?: string; ok?: string; released?: string; confirmed?: string; release?: string }>;
};

export default async function DayPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { date } = await params;
  if (!isValidISO(date)) notFound();
  const sp = await searchParams;

  const supabase = await createClient();
  const rooms = await getRooms();
  const { data: holdRows } = await supabase
    .from("holds")
    .select("*")
    .eq("date", date)
    .order("rank", { nullsFirst: true });
  const holds = (holdRows ?? []) as Hold[];

  const byId = new Map(holds.map((h) => [h.id, h]));

  // Every active or confirmed hold, matched to artists by name (ignoring capitals
  // and extra spaces). One list feeds the Release holds count, its pop-up and
  // Copy for email, so they always agree.
  const today = todayISO();
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  const { data: artistData } = holds.some((h) => h.status !== "released")
    ? await supabase
        .from("holds")
        .select("*")
        .in("status", ["hold", "offer_out", "confirmed"])
        .order("date")
    : { data: [] };
  const artistRows = (artistData ?? []) as Hold[];
  const rowsFor = (title: string) => artistRows.filter((r) => norm(r.title) === norm(title));
  // Holds that can still be released: everything not confirmed, past dates included.
  const releasable = (title: string) => rowsFor(title).filter((r) => r.status === "hold" || r.status === "offer_out");
  const activeCount = (title: string) => releasable(title).length;

  // After "Confirm", or from "Release holds…": the list for the pop-up.
  const justConfirmed = sp.confirmed ? byId.get(sp.confirmed) : undefined;
  const releaseFrom = sp.release ? byId.get(sp.release) : undefined;
  const pivot = justConfirmed?.status === "confirmed" ? justConfirmed : releaseFrom;
  const others: Hold[] = pivot ? releasable(pivot.title) : [];

  // Email list: from this date or today (whichever is earlier) onward.
  const emailFor = (title: string) =>
    holdsEmailText(title, rowsFor(title).filter((r) => r.date >= (date < today ? date : today)));
  const returnTo = `/day/${date}`;

  // Offers that cover holds on this date.
  const { data: offerRows } = holds.length
    ? await supabase.from("offers").select("id,hold_ids,updated_at").overlaps("hold_ids", holds.map((h) => h.id)).order("updated_at")
    : { data: [] };
  const offerFor = new Map<string, string>();
  for (const o of (offerRows ?? []) as { id: string; hold_ids: string[] }[]) {
    for (const hid of o.hold_ids) offerFor.set(hid, o.id); // latest wins
  }

  return (
    <>
      <div className="day-head">
        <Link className="button-link" href={`/day/${addDays(date, -1)}`}>
          ←
        </Link>
        <h1>{fmtDate(date, { weekday: "long", month: "long" })}</h1>
        <Link className="button-link" href={`/day/${addDays(date, 1)}`}>
          →
        </Link>
        <Link href={`/?m=${monthKey(date)}`}>Back to calendar</Link>
      </div>

      {pivot && others.length > 0 ? (
        <>
          <Flash error={sp.error} />
          <ConfirmReleaseModal
            confirmed={pivot}
            others={others}
            releasedHere={sp.released}
            date={date}
            mode={pivot === justConfirmed ? "confirm" : "release"}
          />
        </>
      ) : (
        <Flash error={sp.error} ok={sp.ok} released={sp.released} />
      )}

      <div className="columns">
        {rooms.map((room) => {
          const stack = stackFor(holds, room.id, date);
          const ranks = stack.active.map((h) => h.rank ?? 0);
          const maxRank = Math.max(0, ...ranks);
          const minRank = ranks.length ? Math.min(...ranks) : 0;
          const hasH1 = ranks.includes(1);
          return (
            <section key={room.id} className="col" style={{ ["--room" as string]: ROOM_COLOR[room.id] }}>
              <div className="col-head">
                <h2>{room.name}</h2>
                {staff.canBook && !stack.confirmed && (
                  <Link className="button-link" href={`/new?date=${date}&room=${room.id}`}>
                    + Hold
                  </Link>
                )}
              </div>

              {stack.confirmed && (
                <HoldCard
                  hold={stack.confirmed}
                  canBook={staff.canBook}
                  returnTo={returnTo}
                  maxRank={0}
                  minRank={0}
                  isChallenging={false}
                  emailText={emailFor(stack.confirmed.title)}
                  offerId={offerFor.get(stack.confirmed.id)}
                />
              )}

              {!stack.confirmed && stack.active.length === 0 && <div className="muted">Open</div>}

              {!stack.confirmed && stack.active.length > 0 && !hasH1 && (
                <div className="empty-h1">H1 open — promote a hold when you want to prioritize it</div>
              )}

              {stack.active.map((h) => (
                <HoldCard
                  key={h.id}
                  hold={h}
                  canBook={staff.canBook}
                  returnTo={returnTo}
                  maxRank={maxRank}
                  minRank={minRank}
                  challengerTitle={h.challenged_by ? byId.get(h.challenged_by)?.title : undefined}
                  isChallenging={stack.active.some((x) => x.challenged_by === h.id)}
                  emailText={emailFor(h.title)}
                  artistHoldCount={activeCount(h.title)}
                  offerId={offerFor.get(h.id)}
                />
              ))}
            </section>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <ChallengesPanel
          challenged={holds.filter((h) => h.challenge_deadline && (h.status === "hold" || h.status === "offer_out"))}
          titles={new Map(holds.map((h) => [h.id, h.title]))}
          showDate={false}
          title="Outstanding challenges on this date"
        />
      </div>
    </>
  );
}
