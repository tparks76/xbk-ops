import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import RentalContract from "@/components/RentalContract";
import { todayISO } from "@/lib/dates";
import { normalizeDetails, rentalFees } from "@/lib/rental";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Rental } from "@/lib/types";

// The rental agreement that goes to the client. Print it, or "Save as PDF".
export default async function RentalContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("rentals").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const rental = data as Rental;
  const d = normalizeDetails(rental.details);
  const today = todayISO();
  const f = rentalFees(rental.room_id, d, today);

  return (
    <>
      <div className="no-print sheet-tools">
        <Link href={`/rentals/${rental.id}`}>← Back to rental</Link>
        <PrintButton />
        <span className="muted small">In the print window, choose “Save as PDF” to attach it to your email.</span>
      </div>
      <RentalContract d={d} f={f} today={today} />
    </>
  );
}
