import Link from "next/link";
import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import RentalForm from "@/components/RentalForm";
import { getRooms } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { holdLine, holdsByIds } from "@/lib/offer-data";
import { defaultDetails } from "@/lib/rental";
import { contactStaff } from "@/lib/rental-data";
import { requireStaff } from "@/lib/session";

type Search = Promise<{ holds?: string; error?: string }>;

export default async function NewRentalPage({ searchParams }: { searchParams: Search }) {
  const staff = await requireStaff();
  if (!staff.canBook) redirect("/");
  const sp = await searchParams;
  const ids = (sp.holds ?? "").split(",").filter(Boolean);
  const holds = (await holdsByIds(ids)).filter((h) => h.status !== "released");
  const people = await contactStaff();
  const contact = people[0] ?? { name: "", email: "" };

  // From the Rentals tab: a rental not tied to calendar holds.
  if (ids.length === 0) {
    const rooms = await getRooms();
    return (
      <>
        <div className="day-head">
          <h1>New rental</h1>
          <Link href="/rentals">Back to rentals</Link>
        </div>
        <Flash error={sp.error} />
        <RentalForm
          holdIds={[]}
          holdDates={[]}
          holds={[]}
          roomId={rooms[0]?.id ?? "xbk"}
          rooms={rooms}
          staff={people}
          initial={defaultDetails({ xbkContact: contact })}
          today={todayISO()}
          returnTo="/rentals/new"
          canEdit
        />
      </>
    );
  }

  if (holds.length === 0) {
    return (
      <div className="panel">
        <h1>New rental</h1>
        <p>These holds weren’t found or have been released.</p>
        <Link href="/">Back to calendar</Link>
      </div>
    );
  }

  const first = holds[0];
  return (
    <>
      <div className="day-head">
        <h1>Rental form: {first.title}</h1>
        <Link href={`/day/${first.date}`}>Back to {first.date}</Link>
      </div>
      <Flash error={sp.error} />
      <RentalForm
        holdIds={holds.map((h) => h.id)}
        holdDates={holds.map((h) => h.date)}
        holds={holds.map(holdLine)}
        roomId={first.room_id}
        staff={people}
        initial={defaultDetails({
          eventName: first.title,
          contact: {
            name: first.agent_name ?? "",
            email: first.agent_email ?? "",
            cell: "",
            phone: "",
            alt: "",
            addr: "",
            csz: "",
          },
          date: first.date,
          xbkContact: contact,
        })}
        today={todayISO()}
        returnTo={`/rentals/new?holds=${holds.map((h) => h.id).join(",")}`}
        canEdit
      />
    </>
  );
}
