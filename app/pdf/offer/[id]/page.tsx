import { notFound } from "next/navigation";
import OfferSheet from "@/components/OfferSheet";
import { checkPdfToken } from "@/lib/pdf-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hold, Offer } from "@/lib/types";

// The offer sheet for making a PDF on the server (for the show's Drive folder).
// Opened only with a short-lived signed link; there's no login here.
export default async function OfferPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!checkPdfToken(id, t)) notFound();
  const db = createAdminClient();
  const { data } = await db.from("offers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const offer = data as Offer;
  const { data: holdRows } = offer.hold_ids.length
    ? await db.from("holds").select("*").in("id", offer.hold_ids).order("date")
    : { data: [] };
  const { data: by } = await db.from("staff").select("name").eq("email", offer.created_by).maybeSingle();
  return <OfferSheet offer={offer} holds={(holdRows ?? []) as Hold[]} signer={(by as { name: string } | null)?.name ?? "xBk"} />;
}
