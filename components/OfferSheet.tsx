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
  PARTNER_LABEL,
  showsCostsToAgent,
  walkOut,
  VENUE_ADDRESS,
  VENUE_WEBSITE,
} from "@/lib/offer";
import { ROOM_FULL } from "@/lib/offer-data";
import type { Hold, Offer } from "@/lib/types";

// The offer sheet that goes to the agent: shown on the print page and saved as a PDF in Drive.
export default function OfferSheet({ offer, holds: allHolds, signer }: { offer: Offer; holds: Hold[]; signer: string }) {
  const holds = allHolds.filter((h) => h.status !== "released");
  const t = normalizeTerms(offer.terms);
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
            <div>{t.kind === "promoter" ? "PROMOTER RENTAL" : t.kind === "copro" ? "CO-PRO OFFER" : "OFFER"}</div>
            <div className="muted small">Issued {fmtDate(todayISO())}</div>
          </div>
        </header>

        <table className="sheet-table">
          <tbody>
            {t.kind !== "show" && (
              <tr>
                <th>{PARTNER_LABEL[t.kind]}</th>
                <td>
                  <strong>{t.partner.company || t.partner.contact}</strong>
                  {[t.partner.company && t.partner.contact, t.partner.phone, t.partner.email].filter(Boolean).length > 0 && (
                    <div className="small">
                      {[t.partner.company ? t.partner.contact : "", t.partner.phone, t.partner.email].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
              </tr>
            )}
            {t.kind === "promoter" && (
              <tr>
                <th>Rental fee</th>
                <td>
                  <strong>{money(t.rentalFee)}</strong>{" "}
                  {t.rentalPay === "upfront" ? "paid up front, before the show" : "taken from ticket sales at settlement"}
                </td>
              </tr>
            )}
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

        {cap > 0 && (
          <div className="sheet-walkout">
            <div className="sheet-walkout-head">
              <span>Walk out potential (sellout)</span>
              <strong>{money(cents(walkOut(t).amount))}</strong>
            </div>
            <ul>
              {walkOut(t).steps.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}

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
            <h3>Additional provisions</h3>
            <div className="sheet-notes">
              {/* Paragraphs, with "* " lines shown as bullets */}
              {t.notes
                .trim()
                .split(/\n\s*\n/)
                .map((block, i) => {
                  const lines = block.split("\n").filter((l) => l.trim());
                  const bullets = lines.filter((l) => /^\s*[*•-]\s+/.test(l));
                  if (bullets.length === lines.length) {
                    return (
                      <ul key={i}>
                        {lines.map((l, j) => (
                          <li key={j}>{l.replace(/^\s*[*•-]\s+/, "")}</li>
                        ))}
                      </ul>
                    );
                  }
                  return <p key={i}>{block}</p>;
                })}
            </div>
          </>
        )}

        <div className="sheet-sign">
          <div>
            <div className="line" />
            Accepted by (artist / agent) · Date
          </div>
          <div>
            <div className="line" />
            {signer}, {venue}
          </div>
        </div>
      </article>
  );
}
