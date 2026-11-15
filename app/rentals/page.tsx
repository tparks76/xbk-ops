import Link from "next/link";
import DeleteRental from "@/components/DeleteRental";
import Flash from "@/components/Flash";
import { fmtDate, todayISO } from "@/lib/dates";
import { ROOM_FULL } from "@/lib/offer-data";
import { RENTAL_STATUS_LABEL, money, normalizeDetails, rentalFees } from "@/lib/rental";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Rental } from "@/lib/types";

type Search = Promise<{ q?: string; ok?: string; error?: string }>;

export default async function RentalsPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase.from("rentals").select("*").order("event_date", { ascending: true, nullsFirst: false }).limit(300);
  // Every word must appear in the event or contact name, in any order.
  for (const w of q.replace(/[%_\\*,()]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8)) {
    query = query.or(`title.ilike.%${w}%,contact_name.ilike.%${w}%`);
  }
  const { data, error } = await query;
  const rentals = (data ?? []) as Rental[];
  const today = todayISO();
  const returnTo = q ? `/rentals?q=${encodeURIComponent(q)}` : "/rentals";

  return (
    <>
      <div className="day-head">
        <h1>Rentals</h1>
        <form className="offer-search" action="/rentals">
          <input name="q" type="search" placeholder="Search event or contact" defaultValue={q} aria-label="Search event or contact" />
          <button>Search</button>
          {q && <Link href="/rentals">Clear</Link>}
        </form>
        <span className="spacer" />
        {staff.canBook && (
          <Link className="button-link primary-link" href="/rentals/new">
            + New rental
          </Link>
        )}
      </div>
      <Flash ok={sp.ok} error={sp.error ?? (error ? "Couldn't load rentals. Has the 0009_rentals.sql update been run in Supabase?" : undefined)} />
      <div className="panel">
        {rentals.length === 0 ? (
          <div className="muted">
            {q
              ? `No rentals matching “${q}”.`
              : "No rentals yet. Click “+ New rental”, or place a rental hold from the calendar and open the rental form."}
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Event</th>
                <th>Client</th>
                <th>Room</th>
                <th>Date</th>
                <th>Contact</th>
                <th>Total</th>
                <th>Status</th>
                {staff.canBook && <th />}
              </tr>
            </thead>
            <tbody>
              {rentals.map((r) => {
                const d = normalizeDetails(r.details);
                const f = rentalFees(r.room_id, d, today);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/rentals/${r.id}`}>{r.title}</Link>
                    </td>
                    <td>{d.client}</td>
                    <td>{ROOM_FULL[r.room_id]}</td>
                    <td>{r.event_date ? fmtDate(r.event_date) : "—"}</td>
                    <td>{r.contact_name ?? ""}</td>
                    <td>{money(f.total)}</td>
                    <td>
                      <span className={`badge status-${r.status}`}>{RENTAL_STATUS_LABEL[r.status]}</span>
                    </td>
                    {staff.canBook && (
                      <td>
                        <DeleteRental id={r.id} title={r.title} returnTo={returnTo} />
                      </td>
                    )}
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
