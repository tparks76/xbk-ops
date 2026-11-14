import Link from "next/link";
import DeleteOffer from "@/components/DeleteOffer";
import Flash from "@/components/Flash";
import { fmtDate } from "@/lib/dates";
import { STATUS_LABEL, dealText, normalizeTerms } from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Hold, Offer } from "@/lib/types";

type Search = Promise<{ q?: string; ok?: string; error?: string }>;

export default async function OffersPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase.from("offers").select("*").order("updated_at", { ascending: false }).limit(300);
  if (q) query = query.ilike("title", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  const { data } = await query;
  const offers = (data ?? []) as Offer[];

  const ids = [...new Set(offers.flatMap((o) => o.hold_ids))];
  const { data: hs } = ids.length ? await supabase.from("holds").select("id,date,status").in("id", ids) : { data: [] };
  const byId = new Map(((hs ?? []) as Pick<Hold, "id" | "date" | "status">[]).map((h) => [h.id, h]));
  const returnTo = q ? `/offers?q=${encodeURIComponent(q)}` : "/offers";

  return (
    <>
      <div className="day-head">
        <h1>Offers</h1>
        <form className="offer-search" action="/offers">
          <input name="q" type="search" placeholder="Search artist" defaultValue={q} aria-label="Search artist" />
          <button>Search</button>
          {q && <Link href="/offers">Clear</Link>}
        </form>
        <span className="spacer" />
        {staff.canBook && (
          <Link className="button-link primary-link" href="/offers/new">
            + New offer
          </Link>
        )}
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="panel">
        {offers.length === 0 ? (
          <div className="muted">
            {q
              ? `No offers for artists matching “${q}”.`
              : "No offers yet. Click “+ New offer”, or place holds from the calendar and choose “Build an offer”."}
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Artist</th>
                <th>Room</th>
                <th>Dates</th>
                <th>Deal</th>
                <th>Status</th>
                {staff.canBook && <th />}
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
                    {staff.canBook && (
                      <td>
                        <DeleteOffer id={o.id} title={o.title} returnTo={returnTo} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {offers.length > 0 && (
          <div className="muted small" style={{ marginTop: 8 }}>
            {offers.length} offer{offers.length === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}
          </div>
        )}
      </div>
    </>
  );
}
