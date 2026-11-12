import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Flash from "@/components/Flash";
import HoldFields from "@/components/HoldFields";
import { updateHold } from "@/lib/actions";
import { ROOM_SHORT } from "@/lib/data";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold, HoldEvent } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function EditHoldPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  if (!staff.canBook) redirect("/");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("holds").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const hold = data as Hold;

  const { data: groupRows } = hold.group_id
    ? await supabase.from("holds").select("*").eq("group_id", hold.group_id).order("date")
    : { data: [] };
  const group = (groupRows ?? []) as Hold[];

  const { data: eventRows } = await supabase
    .from("hold_events")
    .select("*")
    .eq("hold_id", id)
    .order("created_at", { ascending: false });
  const events = (eventRows ?? []) as HoldEvent[];

  const statusText =
    hold.status === "confirmed"
      ? "Confirmed"
      : hold.status === "released"
        ? "Released"
        : `H${hold.rank}${hold.status === "offer_out" ? " · offer out" : ""}`;

  return (
    <>
      <div className="day-head">
        <h1>Edit hold</h1>
        <Link href={`/day/${hold.date}`}>
          {ROOM_SHORT[hold.room_id]} · {fmtDate(hold.date)} · {statusText}
        </Link>
      </div>
      <Flash error={sp.error} ok={sp.ok} />

      <form action={updateHold} className="form">
        <input type="hidden" name="id" value={hold.id} />
        <input type="hidden" name="returnTo" value={`/hold/${hold.id}/edit`} />
        <HoldFields hold={hold} />
        <div>
          <button className="primary">Save</button>
        </div>
      </form>

      {group.length > 1 && (
        <div className="panel" style={{ marginTop: 16, maxWidth: 560 }}>
          <h2>Placed together with</h2>
          <table className="list">
            <tbody>
              {group.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/day/${g.date}`}>{fmtDate(g.date)}</Link>
                  </td>
                  <td>{ROOM_SHORT[g.room_id]}</td>
                  <td>
                    {g.status === "confirmed" ? "Confirmed" : g.status === "released" ? "Released" : `H${g.rank}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16, maxWidth: 560 }}>
        <h2>History</h2>
        <table className="list">
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {fmtDateTime(e.created_at)}
                </td>
                <td>{e.detail ?? e.action}</td>
                <td className="muted">{e.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
