import Link from "next/link";
import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import OfferForm from "@/components/OfferForm";
import { getRooms } from "@/lib/data";
import { defaultTerms } from "@/lib/offer";
import { holdLine, holdsByIds } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";

type Search = Promise<{ holds?: string; error?: string }>;

export default async function NewOfferPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!staff.canBook) redirect("/");
  const sp = await searchParams;
  const ids = (sp.holds ?? "").split(",").filter(Boolean);
  const holds = (await holdsByIds(ids)).filter((h) => h.status !== "released");

  // From the Offers tab: an offer not tied to any calendar date.
  if (ids.length === 0) {
    const rooms = await getRooms();
    return (
      <>
        <div className="day-head">
          <h1>New offer</h1>
          <Link href="/offers">Back to offers</Link>
        </div>
        <Flash error={sp.error} />
        <OfferForm
          rooms={rooms}
          holdIds={[]}
          roomId={rooms[0]?.id ?? "xbk"}
          holds={[]}
          initial={{ title: "", agent_name: "", agent_company: "", agent_email: "", terms: defaultTerms(rooms[0]?.id ?? "xbk") }}
          returnTo="/offers/new"
          canEdit
        />
      </>
    );
  }

  if (holds.length === 0) {
    return (
      <div className="panel">
        <h1>New offer</h1>
        <p>These holds weren’t found or have been released.</p>
        <Link href="/">Back to calendar</Link>
      </div>
    );
  }

  const first = holds[0];
  return (
    <>
      <div className="day-head">
        <h1>New offer: {first.title}</h1>
        <Link href={`/day/${first.date}`}>Back to {first.date}</Link>
      </div>
      <Flash error={sp.error} />
      <OfferForm
        holdIds={holds.map((h) => h.id)}
        roomId={first.room_id}
        holds={holds.map(holdLine)}
        initial={{
          title: first.title,
          agent_name: first.agent_name ?? "",
          agent_company: first.agent_company ?? "",
          agent_email: first.agent_email ?? "",
          terms: defaultTerms(first.room_id),
        }}
        returnTo={`/offers/new?holds=${holds.map((h) => h.id).join(",")}`}
        canEdit
      />
    </>
  );
}
