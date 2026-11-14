import Link from "next/link";
import { holdLine, holdsByIds } from "@/lib/offer-data";
import { requireStaff } from "@/lib/session";

// Placeholder: the rental form's fields are still being defined.
export default async function NewRentalPage({ searchParams }: { searchParams: Promise<{ holds?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const ids = (sp.holds ?? "").split(",").filter(Boolean);
  const holds = (await holdsByIds(ids)).filter((h) => h.status !== "released");
  const first = holds[0];

  return (
    <>
      <div className="day-head">
        <h1>Rental form{first ? `: ${first.title}` : ""}</h1>
        {first && <Link href={`/day/${first.date}`}>Back to {first.date}</Link>}
        <Link href="/">Back to calendar</Link>
      </div>
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Coming soon</h2>
        <p>The rental form is being set up. Your rental holds are saved on the calendar.</p>
        {holds.length > 0 && (
          <>
            <div className="field-label">Dates held</div>
            <ul className="offer-dates">
              {holds.map((h) => (
                <li key={h.id}>{holdLine(h).label}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
