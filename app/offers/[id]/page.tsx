import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import Flash from "@/components/Flash";
import OfferForm from "@/components/OfferForm";
import { markOfferSent } from "@/lib/actions";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { STATUS_LABEL, normalizeTerms, offerEmailText } from "@/lib/offer";
import { ROOM_FULL, holdLine, holdsByIds } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function OfferPage({ params, searchParams }: Props) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const offer = data as Offer;
  const terms = normalizeTerms(offer.terms);
  const holds = await holdsByIds(offer.hold_ids);
  const live = holds.filter((h) => h.status !== "released");

  const email = offerEmailText(
    {
      title: offer.title,
      roomName: ROOM_FULL[offer.room_id] ?? offer.room_id,
      dates: live.map((h) => fmtDate(h.date)),
      from: staff.name,
    },
    terms,
  );

  return (
    <>
      <div className="day-head">
        <h1>Offer: {offer.title}</h1>
        <span className={`badge status-${offer.status}`}>{STATUS_LABEL[offer.status]}</span>
        {offer.sent_at && <span className="muted small">sent {fmtDateTime(offer.sent_at)}</span>}
        <span className="spacer" />
        <Link className="button-link" href={`/offers/${offer.id}/print`}>
          Offer sheet / PDF
        </Link>
        <CopyButton text={email} />
        {staff.canBook && offer.status === "draft" && (
          <form action={markOfferSent}>
            <input type="hidden" name="id" value={offer.id} />
            <input type="hidden" name="returnTo" value={`/offers/${offer.id}`} />
            <button className="primary">Mark offer sent</button>
          </form>
        )}
      </div>
      <Flash error={sp.error} ok={sp.ok} />
      <OfferForm
        offerId={offer.id}
        holdIds={offer.hold_ids}
        roomId={offer.room_id}
        holds={holds.map(holdLine)}
        initial={{
          title: offer.title,
          agent_name: offer.agent_name ?? "",
          agent_company: offer.agent_company ?? "",
          agent_email: offer.agent_email ?? "",
          terms,
        }}
        returnTo={`/offers/${offer.id}`}
        canEdit={staff.canBook}
      />
    </>
  );
}
