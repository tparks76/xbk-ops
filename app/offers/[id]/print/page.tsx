import Link from "next/link";
import { notFound } from "next/navigation";
import OfferSheet from "@/components/OfferSheet";
import PrintButton from "@/components/PrintButton";
import { holdsByIds } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

// The offer sheet that goes to the agent. Print it, or "Save as PDF".
export default async function OfferSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const offer = data as Offer;
  const holds = await holdsByIds(offer.hold_ids);

  return (
    <>
      <div className="no-print sheet-tools">
        <Link href={`/offers/${offer.id}`}>← Back to offer</Link>
        <PrintButton />
        <span className="muted small">In the print window, choose “Save as PDF” to attach it to your email.</span>
      </div>
      <OfferSheet offer={offer} holds={holds} signer={staff.name} />
    </>
  );
}
