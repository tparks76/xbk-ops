import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import DeleteRental from "@/components/DeleteRental";
import Flash from "@/components/Flash";
import RentalForm from "@/components/RentalForm";
import { markRentalSent, setRentalStatus } from "@/lib/actions";
import { getRooms } from "@/lib/data";
import { fmtDateTime, todayISO } from "@/lib/dates";
import { holdLine, holdsByIds } from "@/lib/offer-data";
import { RENTAL_STATUS_LABEL, normalizeDetails, rentalEmailText, rentalFees } from "@/lib/rental";
import { contactStaff } from "@/lib/rental-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Rental } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function RentalPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("rentals").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const rental = data as Rental;
  const d = normalizeDetails(rental.details);
  if (!d.eventName) d.eventName = rental.title; // saved before the Event name field existed
  const holds = await holdsByIds(rental.hold_ids);
  const live = holds.filter((h) => h.status !== "released");
  const today = todayISO();
  const f = rentalFees(rental.room_id, d, today);
  const email = rentalEmailText(rental.room_id, d, f, d.xbkContact.name || staff.name);
  const here = `/rentals/${rental.id}`;

  const statusButton = (status: string, label: string) => (
    <form action={setRentalStatus}>
      <input type="hidden" name="id" value={rental.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={here} />
      <button>{label}</button>
    </form>
  );

  return (
    <>
      <div className="day-head">
        <h1>Rental: {rental.title}</h1>
        <span className={`badge status-${rental.status}`}>{RENTAL_STATUS_LABEL[rental.status]}</span>
        {rental.sent_at && <span className="muted small">sent {fmtDateTime(rental.sent_at)}</span>}
        <span className="spacer" />
        <Link className="button-link" href={`${here}/contract`}>
          Contract / PDF
        </Link>
        <CopyButton text={email} />
        {staff.canBook && rental.status === "draft" && (
          <form action={markRentalSent}>
            <input type="hidden" name="id" value={rental.id} />
            <input type="hidden" name="returnTo" value={here} />
            <button className="primary">Mark sent</button>
          </form>
        )}
        {staff.canBook && rental.status === "sent" && statusButton("signed", "Mark signed")}
        {staff.canBook && rental.status !== "cancelled" && rental.status !== "draft" && statusButton("cancelled", "Mark cancelled")}
        {staff.canBook && rental.status === "cancelled" && statusButton("draft", "Reopen as draft")}
        {staff.canBook && <DeleteRental id={rental.id} title={rental.title} returnTo={here} />}
      </div>
      <Flash error={sp.error} ok={sp.ok} />
      {rental.status === "signed" && live.some((h) => h.status !== "confirmed") && (
        <div className="flash info">Signed. Confirm the date on the calendar once the deposit is in.</div>
      )}
      <RentalForm
        rentalId={rental.id}
        holdIds={rental.hold_ids}
        holdDates={live.map((h) => h.date)}
        holds={holds.map(holdLine)}
        roomId={rental.room_id}
        rooms={rental.hold_ids.length ? [] : await getRooms()}
        staff={await contactStaff()}
        initial={d}
        today={today}
        returnTo={here}
        canEdit={staff.canBook}
      />
    </>
  );
}
