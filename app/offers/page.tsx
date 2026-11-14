import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import { STATUS_LABEL, dealText, normalizeTerms } from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold, Offer } from "@/lib/types";

export default async function OffersPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select("*").order("updated_at", { ascending: false }).limit(200);
  const offers = (data ?? []) as Offer[];
  const ids = [...new Set(offers.flatMap((o) => o.hold_ids))];
  const { data: hs } = ids.length ? await supabase.from("holds").select("id,date,status").in("id", ids) : { data: [] };
  const byId = new Map(((hs ?? []) as Pick<Hold, "id" | "date" | "status">[]).map((h) => [h.id, h]));

  return (
    <>
      <div className="day-head">
        <h1>Offers</h1>
        <span className="spacer" />
        {staff.canBook && (
          <Link className="button-link primary-link" href="/offers/new">
            + New offer
          </Link>
        )}
      </div>
      <div className="panel">
        {offers.length === 0 ? (
          <div className="muted">No offers yet. Click “+ New offer”, or place holds from the calendar and choose “Build an offer”.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Artist</th>
                <th>Room</th>
                <th>Dates</th>
                <th>Deal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const dates = o.hold_ids
                  .map((id) => byId.get(id))
                  .filter((h): h is NonNullable<typeof h> => !!h && h.status !== "released")
                  .map((h) => h.date)
                  .sort();
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/offers/${o.id}`}>{o.title}</Link>
                    </td>
                    <td>{ROOM_FULL[o.room_id]}</td>
                    <td>
                      {o.hold_ids.length === 0
                        ? normalizeTerms(o.terms).dateText || "No date"
                        : dates.map((d) => fmtDate(d, { weekday: undefined })).join(", ") || "—"}
                    </td>
                    <td>{dealText(normalizeTerms(o.terms))}</td>
                    <td>
                      <span className={`badge status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
