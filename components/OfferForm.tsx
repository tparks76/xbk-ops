"use client";

import { useMemo, useRef, useState } from "react";
import OfferPartner from "@/components/OfferPartner";
import type { Extracted } from "@/lib/offer-extract";
import { saveOffer } from "@/lib/actions";
import { STANDARD_PROVISIONS } from "@/lib/provisions";
import {
  AGES,
  DEAL_LABELS,
  applySetup,
  defaultCosts,
  setupsFor,
  approvedCosts,
  breakEven,
  budgetAt,
  capacity,
  dealText,
  fitTiers,
  money,
  tierTotal,
  totalCosts,
  varCostAmount,
  walkOut,
  type DealType,
  type Terms,
} from "@/lib/offer";

type HoldLine = { id: string; label: string; released: boolean };

type Props = {
  rooms?: { id: string; name: string }[]; // shown when the offer has no holds
  offerId?: string;
  holdIds: string[];
  roomId: string;
  holds: HoldLine[];
  initial: {
    title: string;
    agent_name: string;
    agent_company: string;
    agent_email: string;
    terms: Terms;
  };
  returnTo: string;
  canEdit: boolean;
};

const num = (v: string) => (v === "" ? 0 : Number(v));

export default function OfferForm({ rooms = [], offerId, holdIds, roomId, holds, initial, returnTo, canEdit }: Props) {
  const unassigned = holdIds.length === 0;
  const [room, setRoom] = useState(roomId);
  const [t, setT] = useState<Terms>(initial.terms);
  const [custom, setCustom] = useState<number | "">("");
  const set = <K extends keyof Terms>(k: K, v: Terms[K]) => setT((x) => ({ ...x, [k]: v }));

  const cap = capacity(t);
  const be = useMemo(() => breakEven(t), [t]);
  const scenarios = useMemo(() => {
    const pts = [0.25, 0.5, 0.75, 1].map((p) => Math.round(cap * p));
    if (custom !== "" && custom >= 0) pts.push(Math.min(Number(custom), cap));
    return [...new Set(pts)].sort((a, b) => a - b).map((n) => budgetAt(t, n));
  }, [t, cap, custom]);

  const formRef = useRef<HTMLFormElement>(null);

  // Fill the form from what was read in a partner's offer. Returns what was filled in.
  const applyExtracted = (x: Extracted): string[] => {
    const done: string[] = [];
    const field = (n: string, v?: string) => {
      const el = formRef.current?.elements.namedItem(n) as HTMLInputElement | null;
      if (el && v) el.value = v;
    };
    if (x.artist) (field("title", x.artist), done.push("artist"));
    if (x.agent?.name || x.agent?.email) {
      field("agent_name", x.agent.name);
      field("agent_company", x.agent.company);
      field("agent_email", x.agent.email);
      done.push("agent");
    }
    setT((cur) => {
      const n: Terms = { ...cur };
      if (x.partner && Object.values(x.partner).some(Boolean)) {
        n.partner = {
          company: x.partner.company || cur.partner.company,
          contact: x.partner.contact || cur.partner.contact,
          phone: x.partner.phone || cur.partner.phone,
          email: x.partner.email || cur.partner.email,
        };
      }
      if (x.dealType) n.dealType = x.dealType;
      if (x.guarantee !== undefined) n.guarantee = x.guarantee;
      if (x.percent !== undefined) n.percent = x.percent;
      if (x.pctBasis) n.pctBasis = x.pctBasis;
      if (x.taxPct !== undefined) n.taxPct = x.taxPct;
      if (x.rentalFee !== undefined && cur.kind === "promoter") n.rentalFee = x.rentalFee;
      if (x.tiers?.length) {
        const qtyKnown = x.tiers.some((y) => y.qty);
        n.tiers = x.tiers.map((y, i) => ({ name: y.name, price: y.price, qty: y.qty ?? (i === 0 ? x.capacity ?? capacity(cur) : 0) }));
        if (x.capacity || qtyKnown) {
          n.setup = "custom";
          n.setupName = "Custom";
          n.customCap = x.capacity ?? n.tiers.reduce((s, y) => s + y.qty, 0);
        }
      } else if (x.capacity) {
        n.setup = "custom";
        n.setupName = "Custom";
        n.customCap = x.capacity;
        n.tiers = fitTiers(n.tiers, x.capacity);
      }
      if (x.costs?.length) {
        const costs = [...cur.costs];
        for (const c of x.costs) {
          const i = costs.findIndex((y) => y.label.trim().toLowerCase() === c.label.trim().toLowerCase());
          if (i >= 0) costs[i] = { ...costs[i], amount: c.amount, approved: true };
          else costs.push({ label: c.label, amount: c.amount, approved: true });
        }
        n.costs = costs;
      }
      for (const k of ["support", "doors", "showTime", "curfew", "ages", "deposit", "merch", "radius"] as const) {
        if (x[k]) n[k] = x[k]!;
      }
      if (x.notes) n.notes = `${cur.notes ? `${cur.notes}\n\n` : ""}From the partner's offer: ${x.notes}`;
      return n;
    });
    if (x.partner && Object.values(x.partner).some(Boolean)) done.push("partner contact");
    if (x.dealType || x.guarantee !== undefined || x.percent !== undefined) done.push("deal");
    if (x.rentalFee !== undefined && t.kind === "promoter") done.push("rental fee");
    if (x.tiers?.length || x.capacity) done.push("tickets and capacity");
    if (x.costs?.length) done.push("expenses");
    if (x.doors || x.showTime || x.curfew) done.push("times");
    if (x.support || x.ages || x.deposit || x.merch || x.radius) done.push("show details");
    if (x.notes) done.push("notes");
    return done;
  };

  const showPct = t.dealType === "vs" || t.dealType === "door";
  const showG = t.dealType !== "door";

  return (
    <form
      ref={formRef}
      action={saveOffer}
      className="offer-layout"
      // Numbers are typed, never nudged: no scroll-wheel or arrow-key changes.
      onWheelCapture={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.type === "number" && document.activeElement === el) el.blur();
      }}
      onKeyDownCapture={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.type === "number" && (e.key === "ArrowUp" || e.key === "ArrowDown")) e.preventDefault();
      }}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      {offerId && <input type="hidden" name="id" value={offerId} />}
      <input type="hidden" name="hold_ids" value={holdIds.join(",")} />
      {!unassigned && <input type="hidden" name="room_id" value={roomId} />}
      {unassigned && <input type="hidden" name="unassigned" value="1" />}
      <input type="hidden" name="terms" value={JSON.stringify(t)} />

      <fieldset className="offer-main" disabled={!canEdit}>
        {(t.kind !== "show" || unassigned) && (
          <OfferPartner t={t} setT={setT} canPickKind={unassigned} onApply={applyExtracted} />
        )}
        <section className="panel">
          <h2>Artist & dates</h2>
          <div className="form-grid">
            <label>
              Artist
              <input name="title" required defaultValue={initial.title} />
            </label>
            <label>
              Support
              <input value={t.support} onChange={(e) => set("support", e.target.value)} placeholder="Support act names" />
            </label>
            <label>
              Agent
              <input name="agent_name" defaultValue={initial.agent_name} />
            </label>
            <label>
              Agency
              <input name="agent_company" defaultValue={initial.agent_company} />
            </label>
            <label className="span2">
              Agent email
              <input name="agent_email" type="email" defaultValue={initial.agent_email} />
            </label>
          </div>
          {unassigned ? (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>
                Room
                <select
                  name="room_id"
                  value={room}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    // New room: its setups and its default costs.
                    setT((x) => ({ ...applySetup(x, setupsFor(e.target.value)[0]), costs: defaultCosts(e.target.value) }));
                  }}
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date(s)
                <input
                  value={t.dateText}
                  onChange={(e) => set("dateText", e.target.value)}
                  placeholder="TBD, a range, or dates not on the calendar"
                />
              </label>
              <div className="muted small span2">Not linked to calendar holds.</div>
            </div>
          ) : (
            <>
              <div className="field-label" style={{ marginTop: 10 }}>
                Dates on this offer (same terms for each)
              </div>
              <ul className="offer-dates">
                {holds.map((h) => (
                  <li key={h.id} className={h.released ? "released" : ""}>
                    {h.label}
                    {h.released && " · released"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Deal</h2>
          <div className="deal-types">
            {(Object.keys(DEAL_LABELS) as DealType[]).map((k) => (
              <label key={k} className={t.dealType === k ? "deal on" : "deal"}>
                <input type="radio" checked={t.dealType === k} onChange={() => set("dealType", k)} />
                {DEAL_LABELS[k]}
              </label>
            ))}
          </div>
          <div className="form-grid">
            {showG && (
              <label>
                Guarantee ($)
                <input type="number" min={0} step="any" value={t.guarantee || ""} onChange={(e) => set("guarantee", num(e.target.value))} />
              </label>
            )}
            {showPct && (
              <>
                <label>
                  Artist percentage (%)
                  <input type="number" min={0} max={100} step="any" value={t.percent || ""} onChange={(e) => set("percent", num(e.target.value))} />
                </label>
                <label className="span2">
                  Percentage is paid on
                  <select value={t.pctBasis} onChange={(e) => set("pctBasis", e.target.value as Terms["pctBasis"])}>
                    <option value="net">Net, after the identified costs below</option>
                    <option value="gross">Gross (after taxes/fees only)</option>
                  </select>
                </label>
              </>
            )}
          </div>

          {t.dealType === "bonus" && (
            <div style={{ marginTop: 10 }}>
              <div className="field-label">Bonuses</div>
              <table className="rows">
                <thead>
                  <tr>
                    <th>At tickets sold</th>
                    <th>Bonus ($)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.bonuses.map((b, i) => (
                    <tr key={i}>
                      <td>
                        <input type="number" min={0} value={b.at || ""} onChange={(e) => set("bonuses", t.bonuses.map((x, j) => (j === i ? { ...x, at: num(e.target.value) } : x)))} />
                      </td>
                      <td>
                        <input type="number" min={0} step="any" value={b.amount || ""} onChange={(e) => set("bonuses", t.bonuses.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)))} />
                      </td>
                      <td>
                        <button type="button" onClick={() => set("bonuses", t.bonuses.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => set("bonuses", [...t.bonuses, { at: 0, amount: 0 }])}>+ Add bonus</button>
            </div>
          )}
          <div className="deal-preview">{dealText(t)}</div>
          <div className="walkout">
            <div className="walkout-head">
              <span>Walk out potential</span>
              <strong>{money(Math.round(walkOut(t).amount * 100) / 100)}</strong>
            </div>
            <div className="muted small">What the artist receives if the show sells out.</div>
            <ul>
              {walkOut(t).steps.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <h2>Room setup & tickets</h2>
          <div className="setup-row">
            {setupsFor(room).map((o) => (
              <label key={o.key} className={t.setup === o.key ? "deal on" : "deal"}>
                <input type="radio" checked={t.setup === o.key} onChange={() => setT((x) => applySetup(x, o))} />
                {o.name} ({o.cap})
              </label>
            ))}
            <label className={t.setup === "custom" ? "deal on" : "deal"}>
              <input type="radio" checked={t.setup === "custom"} onChange={() => setT((x) => applySetup(x, "custom"))} />
              Custom
            </label>
            {t.setup === "custom" && (
              <label className="inline">
                Capacity
                <input
                  type="number"
                  min={0}
                  value={t.customCap || ""}
                  onChange={(e) => setT((x) => ({ ...x, customCap: num(e.target.value), tiers: fitTiers(x.tiers, num(e.target.value)) }))}
                />
              </label>
            )}
          </div>
          <table className="rows">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Price ($)</th>
                <th>Quantity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.tiers.map((x, i) => (
                <tr key={i}>
                  <td>
                    <input value={x.name} onChange={(e) => set("tiers", t.tiers.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  </td>
                  <td>
                    <input type="number" min={0} step="any" value={x.price || ""} onChange={(e) => set("tiers", t.tiers.map((y, j) => (j === i ? { ...y, price: num(e.target.value) } : y)))} />
                  </td>
                  <td>
                    <input type="number" min={0} value={x.qty || ""} onChange={(e) => set("tiers", t.tiers.map((y, j) => (j === i ? { ...y, qty: num(e.target.value) } : y)))} />
                  </td>
                  <td>
                    <button type="button" onClick={() => set("tiers", t.tiers.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-tools">
            <button type="button" onClick={() => set("tiers", [...t.tiers, { name: "", price: 0, qty: 0 }])}>+ Add tier</button>
            <label className="inline">
              Sales tax / fees off gross (%)
              <input type="number" min={0} max={100} step="any" value={t.taxPct || ""} onChange={(e) => set("taxPct", num(e.target.value))} />
            </label>
            <span className={tierTotal(t) === cap ? "muted" : "warn"}>
              Tiers total {tierTotal(t)} of {cap}
              {tierTotal(t) !== cap && " — adjust quantities to match capacity"}
            </span>
          </div>
        </section>

        <section className="panel">
          <h2>Costs</h2>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Tick <strong>Approved</strong> for approved show expenses
            {showPct && t.pctBasis === "net"
              ? ": they’re deducted before the artist’s percentage and listed on the offer. Unticked costs are in your budget only."
              : ". With this deal type, costs are used for your budget only and aren’t shown on the offer."}
          </div>
          <table className="rows">
            <thead>
              <tr>
                <th>Cost</th>
                <th>Amount ($)</th>
                <th className="center">Approved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.costs.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input value={c.label} onChange={(e) => set("costs", t.costs.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  </td>
                  <td>
                    <input type="number" min={0} step="any" value={c.amount || ""} onChange={(e) => set("costs", t.costs.map((y, j) => (j === i ? { ...y, amount: num(e.target.value) } : y)))} />
                  </td>
                  <td className="center">
                    <input type="checkbox" aria-label="Approved show expense" checked={c.approved} onChange={(e) => set("costs", t.costs.map((y, j) => (j === i ? { ...y, approved: e.target.checked } : y)))} />
                  </td>
                  <td>
                    <button type="button" onClick={() => set("costs", t.costs.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => set("costs", [...t.costs, { label: "", amount: 0, approved: true }])}>+ Add cost</button>

          <h3 className="sub">Variable costs</h3>
          <div className="muted small" style={{ marginBottom: 6 }}>
            PRO fees and insurance, worked out on a sold-out house ({cap} tickets). Percentages are of gross after
            sales tax. Ticked = included in approved show expenses.
          </div>
          <table className="rows">
            <thead>
              <tr>
                <th>Cost</th>
                <th>Charged as</th>
                <th>Rate</th>
                <th>At sellout</th>
                <th className="center">Included in expenses</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.varCosts.map((v, i) => (
                <tr key={i}>
                  <td>
                    <input value={v.label} onChange={(e) => set("varCosts", t.varCosts.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  </td>
                  <td>
                    <select value={v.mode} onChange={(e) => set("varCosts", t.varCosts.map((y, j) => (j === i ? { ...y, mode: e.target.value as "pct" | "per_ticket" } : y)))}>
                      <option value="pct">% of gross</option>
                      <option value="per_ticket">$ per ticket</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={v.rate || ""}
                      placeholder={v.mode === "pct" ? "%" : "$"}
                      onChange={(e) => set("varCosts", t.varCosts.map((y, j) => (j === i ? { ...y, rate: num(e.target.value) } : y)))}
                    />
                  </td>
                  <td className="calc">{money(Math.round(varCostAmount(t, v) * 100) / 100)}</td>
                  <td className="center">
                    <input type="checkbox" aria-label="Included in expenses" checked={v.approved} onChange={(e) => set("varCosts", t.varCosts.map((y, j) => (j === i ? { ...y, approved: e.target.checked } : y)))} />
                  </td>
                  <td>
                    <button type="button" onClick={() => set("varCosts", t.varCosts.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => set("varCosts", [...t.varCosts, { label: "", mode: "pct", rate: 0, approved: true }])}>+ Add variable cost</button>
          <div className="cost-totals">
            Total costs {money(Math.round(totalCosts(t)))} · Approved show expenses {money(Math.round(approvedCosts(t)))}
          </div>
        </section>

        <section className="panel">
          <h2>Show details</h2>
          <div className="form-grid">
            {(
              [
                ["doors", "Doors", ""],
                ["showTime", "Show", ""],
                ["curfew", "Curfew", ""],
                ["deposit", "Deposit", ""],
                ["merch", "Merch", ""],
                ["radius", "Radius", ""],
              ] as [keyof Terms, string, string][]
            ).map(([k, label, ph]) => (
              <label key={k}>
                {label}
                <input value={t[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} />
              </label>
            ))}
            <label>
              Ages
              <select value={t.ages} onChange={(e) => set("ages", e.target.value)}>
                {AGES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Offer expires
              <input type="date" value={t.expires} onChange={(e) => set("expires", e.target.value)} />
            </label>
            <label className="span2">
              Additional provisions
              <textarea rows={14} value={t.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>
            {!t.notes.includes(STANDARD_PROVISIONS.slice(0, 60)) && (
              <div className="span2">
                <button
                  type="button"
                  onClick={() => set("notes", t.notes.trim() ? `${t.notes.trim()}\n\n${STANDARD_PROVISIONS}` : STANDARD_PROVISIONS)}
                >
                  Add standard provisions
                </button>
              </div>
            )}
          </div>
        </section>

        {canEdit && (
          <div className="offer-save">
            <button className="primary">{offerId ? "Save changes" : "Save offer"}</button>
          </div>
        )}
      </fieldset>

      <aside className="offer-budget panel">
        <h2>Budget (per show)</h2>
        <table className="list budget">
          <thead>
            <tr>
              <th>Tickets</th>
              <th>Gross</th>
              <th>Net</th>
              <th>Artist</th>
              <th>Venue</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((b) => (
              <tr key={b.tickets}>
                <td>
                  {b.tickets}
                  <span className="muted small"> {cap ? `${Math.round((b.tickets / cap) * 100)}%` : ""}</span>
                </td>
                <td>{money(Math.round(b.gross))}</td>
                <td>{money(Math.round(b.net))}</td>
                <td>{money(Math.round(b.artist))}</td>
                <td className={b.venue < 0 ? "neg" : "pos"}>{money(Math.round(b.venue))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="inline" style={{ marginTop: 8 }}>
          Projected tickets
          <input type="number" min={0} value={custom} onChange={(e) => setCustom(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
        <div className="be">Walk out potential: {money(Math.round(walkOut(t).amount))}</div>
        <div className="be">
          {cap === 0
            ? "Add ticket tiers to see break-even."
            : be === null
              ? "Doesn’t break even at capacity."
              : `Break-even: ${be} tickets (${Math.round((be / cap) * 100)}% of capacity)`}
        </div>
        {cap > 0 && (
          <div className="muted small">
            Sellout gross {money(Math.round(budgetAt(t, cap).gross))}
            {t.taxPct > 0 && <>, sales tax/fees {money(Math.round(budgetAt(t, cap).taxes))}</>}. Net = gross after tax and
            approved show expenses ({money(Math.round(approvedCosts(t)))}). Venue = gross after tax, all costs (
            {money(Math.round(totalCosts(t)))}) and the artist.
          </div>
        )}
      </aside>
    </form>
  );
}
