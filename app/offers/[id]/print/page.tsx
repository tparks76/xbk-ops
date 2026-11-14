import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { fmtDate, todayISO } from "@/lib/dates";
import {
  approvedCosts,
  approvedLines,
  setupLabel,
  budgetAt,
  capacity,
  dealText,
  money,
  normalizeTerms,
  showsCostsToAgent,
  VENUE_ADDRESS,
  VENUE_WEBSITE,
} from "@/lib/offer";
import { ROOM_FULL, holdsByIds } from "@/lib/offer-data";
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
  const t = normalizeTerms(offer.terms);
  const holds = (await holdsByIds(offer.hold_ids)).filter((h) => h.status !== "released");
  const venue = ROOM_FULL[offer.room_id] ?? offer.room_id;
  const cap = capacity(t);
  const tiers = t.tiers.filter((x, i) => i < 2 || x.qty > 0 || x.price > 0); // Advance and Day of show always shown
  const sellout = budgetAt(t, cap);
  const cents = (n: number) => Math.round(n * 100) / 100;

  const details: [string, string][] = (
    [
      ["Setup", setupLabel(t)],
      ["Support", t.support],
      ["Doors", t.doors],
      ["Show", t.showTime],
      ["Curfew", t.curfew],
      ["Ages", t.ages],
      ["Deposit", t.deposit],
      ["Merch", t.merch],
      ["Radius", t.radius],
      ["Offer expires", t.expires ? fmtDate(t.expires) : ""],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());

  return (
    <>
      <div className="no-print sheet-tools">
        <Link href={`/offers/${offer.id}`}>← Back to offer</Link>
        <PrintButton />
        <span className="muted small">In the print window, choose “Save as PDF” to attach it to your email.</span>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <div className="sheet-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/xbk-logo.jpg" alt="xBk" className="sheet-logo" />
            <div>
              <div className="sheet-venue">{venue}</div>
              <div className="sheet-addr">{VENUE_ADDRESS}</div>
              <div className="sheet-addr">{VENUE_WEBSITE}</div>
            </div>
          </div>
          <div className="sheet-title">
            <div>OFFER</div>
            <div className="muted small">Issued {fmtDate(todayISO())}</div>
          </div>
        </header>

        <table className="sheet-table">
          <tbody>
            <tr>
              <th>Artist</th>
              <td>
                <strong>{offer.title}</strong>
              </td>
            </tr>
            <tr>
              <th>Agent</th>
              <td>{[offer.agent_name, offer.agent_company].filter(Boolean).join(", ")}</td>
            </tr>
            <tr>
              <th>Venue</th>
              <td>{venue}</td>
            </tr>
            <tr>
              <th>Date{holds.length > 1 ? "s" : ""}</th>
              <td>
                {offer.hold_ids.length === 0 && <div>{t.dateText.trim() || "TBD"}</div>}
                {holds.map((h) => (
                  <div key={h.id}>{fmtDate(h.date, { weekday: "long", month: "long" })}</div>
                ))}
                {holds.length > 1 && <div className="muted small">Terms apply to each date.</div>}
              </td>
            </tr>
            <tr>
              <th>Deal</th>
              <td>
                <strong>{dealText(t)}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        {tiers.length > 0 && (
          <>
            <h3>Tickets</h3>
            <table className="sheet-table grid">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Gross</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((x, i) => (
                  <tr key={i}>
                    <td>{x.name}</td>
                    <td>{money(x.price)}</td>
                    <td>{x.qty}</td>
                    <td>{money(x.price * x.qty)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Gross potential</td>
                  <td />
                  <td>{cap}</td>
                  <td>{money(cents(sellout.gross))}</td>
                </tr>
                {t.taxPct > 0 && (
                  <>
                    <tr>
                      <td colSpan={3}>Less sales tax/fees ({t.taxPct}%)</td>
                      <td>−{money(cents(sellout.taxes))}</td>
                    </tr>
                    <tr className="total">
                      <td colSpan={3}>Gross after tax</td>
                      <td>{money(cents(sellout.adjGross))}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </>
        )}

        {showsCostsToAgent(t) && approvedLines(t).length > 0 && (
          <>
            <h3>Approved show expenses (deducted before percentage)</h3>
            <table className="sheet-table grid">
              <tbody>
                {approvedLines(t).map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.label}
                      {c.note && <span className="muted small"> ({c.note})</span>}
                    </td>
                    <td>{money(Math.round(c.amount * 100) / 100)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td>{money(Math.round(approvedCosts(t) * 100) / 100)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {details.length > 0 && (
          <>
            <h3>Details</h3>
            <table className="sheet-table">
              <tbody>
                {details.map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {t.notes.trim() && (
          <>
            <h3>Other terms</h3>
            <p className="sheet-notes">{t.notes}</p>
          </>
        )}

        <div className="sheet-sign">
          <div>
            <div className="line" />
            Accepted by (artist / agent) · Date
          </div>
          <div>
            <div className="line" />
            {staff.name}, {venue}
          </div>
        </div>
      </article>
    </>
  );
}
