"use client";

import { useMemo, useState } from "react";
import { saveRental } from "@/lib/actions";
import {
  BARS,
  BLOCKS,
  FOODS,
  LISTS,
  fmtLongDate,
  lineTotal,
  money,
  rentalFees,
  rentalProblems,
  roomInfo,
  type Line,
  type Person,
  type RentalDetails,
  type VendorKind,
} from "@/lib/rental";

type HoldLine = { id: string; label: string; released: boolean };

type Props = {
  rentalId?: string;
  holdIds: string[];
  holdDates: string[]; // ISO dates of the live holds
  holds: HoldLine[];
  roomId: string;
  rooms?: { id: string; name: string }[]; // shown when the rental has no holds
  staff: { name: string; email: string }[];
  initial: RentalDetails;
  today: string;
  returnTo: string;
  canEdit: boolean;
};

const numOrNull = (v: string) => (v === "" ? null : Number(v));

export default function RentalForm(p: Props) {
  const unassigned = p.holdIds.length === 0;
  const [room, setRoom] = useState(p.roomId);
  const [d, setD] = useState<RentalDetails>(p.initial);
  const [shown, setShown] = useState<string[]>([]);
  const set = <K extends keyof RentalDetails>(k: K, v: RentalDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  // Changing the room, date or non-profit status resets the rate to its starting value.
  const setResetRate = <K extends keyof RentalDetails>(k: K, v: RentalDetails[K]) =>
    setD((x) => ({ ...x, [k]: v, rate: null }));
  const setPerson = (who: "contact" | "client2", k: keyof Person, v: string) =>
    setD((x) => ({ ...x, [who]: { ...x[who], [k]: v } }));

  const info = roomInfo(room);
  const f = useMemo(() => rentalFees(room, d, p.today), [room, d, p.today]);
  const problems = rentalProblems(room, d);

  const setLine = (list: "vendor" | "items", i: number, patch: Partial<Line>) =>
    setD((x) => ({ ...x, [list]: x[list].map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLine = (list: "vendor" | "items", kind: VendorKind | "Item") =>
    setD((x) => ({ ...x, [list]: [...x[list], { kind, type: "", other: "", name: "", qty: 1, fee: null }] }));
  const removeLine = (list: "vendor" | "items", i: number) =>
    setD((x) => ({ ...x, [list]: x[list].filter((_, j) => j !== i) }));

  const staffKey = `${d.xbkContact.name}|${d.xbkContact.email}`;
  const staffOptions = p.staff.some((s) => `${s.name}|${s.email}` === staffKey) || !d.xbkContact.name
    ? p.staff
    : [d.xbkContact, ...p.staff]; // keep a saved contact who has since left the staff list

  const tabbed = d.bar === "pre" || d.bar === "lim" || d.bar === "ongo";

  return (
    <form
      action={saveRental}
      className="offer-layout"
      onSubmit={(e) => {
        if (problems.length) {
          e.preventDefault();
          setShown(problems);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      onWheelCapture={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.type === "number" && document.activeElement === el) el.blur();
      }}
      onKeyDownCapture={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.type === "number" && (e.key === "ArrowUp" || e.key === "ArrowDown")) e.preventDefault();
      }}
    >
      <input type="hidden" name="returnTo" value={p.returnTo} />
      {p.rentalId && <input type="hidden" name="id" value={p.rentalId} />}
      <input type="hidden" name="hold_ids" value={p.holdIds.join(",")} />
      <input type="hidden" name="room_id" value={room} />
      {unassigned && <input type="hidden" name="unassigned" value="1" />}
      <input type="hidden" name="details" value={JSON.stringify(d)} />

      <fieldset className="offer-main" disabled={!p.canEdit}>
        {shown.length > 0 && problems.length > 0 && (
          <div className="flash error">
            <strong>
              {problems.length} thing{problems.length > 1 ? "s" : ""} to fix before saving:
            </strong>
            <ul style={{ margin: "4px 0 0" }}>
              {problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="panel">
          <h2>1. Client</h2>
          <div className="form-grid">
            <label className="span2">
              Organization or client name *
              <input value={d.client} onChange={(e) => set("client", e.target.value)} />
            </label>
            <label>
              Contact name *
              <input value={d.contact.name} onChange={(e) => setPerson("contact", "name", e.target.value)} />
            </label>
            <label>
              Email *
              <input type="email" value={d.contact.email} onChange={(e) => setPerson("contact", "email", e.target.value)} />
            </label>
            <label>
              Cell
              <input value={d.contact.cell} onChange={(e) => setPerson("contact", "cell", e.target.value)} />
            </label>
            <label>
              Phone
              <input value={d.contact.phone} onChange={(e) => setPerson("contact", "phone", e.target.value)} />
            </label>
            <label>
              Alt phone
              <input value={d.contact.alt} onChange={(e) => setPerson("contact", "alt", e.target.value)} />
            </label>
            <label>
              Address
              <input value={d.contact.addr} onChange={(e) => setPerson("contact", "addr", e.target.value)} />
            </label>
            <label>
              City / state / zip
              <input value={d.contact.csz} onChange={(e) => setPerson("contact", "csz", e.target.value)} />
            </label>
          </div>
          <div className="check-row">
            <label className="inline-check">
              <input type="checkbox" checked={d.nonProfit} onChange={(e) => setResetRate("nonProfit", e.target.checked)} />{" "}
              Non-profit (50% of default rental rate)
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={d.taxExempt} onChange={(e) => set("taxExempt", e.target.checked)} /> Tax exempt
              (no sales tax)
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={d.hasClient2} onChange={(e) => set("hasClient2", e.target.checked)} /> Add an
              additional client
            </label>
          </div>
          {d.hasClient2 && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>
                Additional client name
                <input value={d.client2.name} onChange={(e) => setPerson("client2", "name", e.target.value)} />
              </label>
              <label>
                Email
                <input value={d.client2.email} onChange={(e) => setPerson("client2", "email", e.target.value)} />
              </label>
              <label>
                Cell
                <input value={d.client2.cell} onChange={(e) => setPerson("client2", "cell", e.target.value)} />
              </label>
              <label>
                Phone
                <input value={d.client2.phone} onChange={(e) => setPerson("client2", "phone", e.target.value)} />
              </label>
              <label>
                Address
                <input value={d.client2.addr} onChange={(e) => setPerson("client2", "addr", e.target.value)} />
              </label>
              <label>
                City / state / zip
                <input value={d.client2.csz} onChange={(e) => setPerson("client2", "csz", e.target.value)} />
              </label>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>2. Event</h2>
          {!unassigned && (
            <>
              <div className="field-label">Dates held</div>
              <ul className="offer-dates" style={{ marginBottom: 10 }}>
                {p.holds.map((h) => (
                  <li key={h.id} className={h.released ? "released" : ""}>
                    {h.label}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="form-grid">
            <label className="span2">
              Event name * <span className="muted small">(the hold name on the calendar)</span>
              <input value={d.eventName} onChange={(e) => set("eventName", e.target.value)} />
            </label>
            <label>
              Room *
              {unassigned ? (
                <select value={room} onChange={(e) => (setRoom(e.target.value), set("rate", null))}>
                  {(p.rooms ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={info.name} disabled />
              )}
            </label>
            <label>
              xBk contact *
              <select
                value={staffKey}
                onChange={(e) => {
                  const [name, email] = e.target.value.split("|");
                  set("xbkContact", { name, email });
                }}
              >
                {!d.xbkContact.name && <option value="|">Choose a contact</option>}
                {staffOptions.map((s) => (
                  <option key={s.email} value={`${s.name}|${s.email}`}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event date *
              {unassigned || p.holdDates.length === 0 ? (
                <input type="date" value={d.date} onChange={(e) => setResetRate("date", e.target.value)} />
              ) : p.holdDates.length === 1 ? (
                <input value={fmtLongDate(d.date)} disabled />
              ) : (
                <select value={d.date} onChange={(e) => setResetRate("date", e.target.value)}>
                  {p.holdDates.map((x) => (
                    <option key={x} value={x}>
                      {fmtLongDate(x)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              Event type *
              <select value={d.eventType} onChange={(e) => set("eventType", e.target.value)}>
                {LISTS.eventType.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Anticipated attendance * <span className="muted small">(limit {info.cap})</span>
              <input
                type="number"
                min={1}
                value={d.attendance ?? ""}
                onChange={(e) => set("attendance", numOrNull(e.target.value))}
              />
            </label>
            <label>
              Description
              <input value={d.description} onChange={(e) => set("description", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>3. Time and setup</h2>
          <div className="form-grid">
            <label>
              Reservation block *
              <select value={d.block} onChange={(e) => set("block", e.target.value as RentalDetails["block"])}>
                {Object.entries(BLOCKS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Room setup *
              <select value={d.setup} onChange={(e) => set("setup", e.target.value)}>
                {LISTS.setup.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Event start *
              <input type="time" value={d.start} onChange={(e) => set("start", e.target.value)} />
            </label>
            <label>
              Event end *
              <input type="time" value={d.end} onChange={(e) => set("end", e.target.value)} />
            </label>
            <label>
              Entertainment *
              <select value={d.ent} onChange={(e) => set("ent", e.target.value)}>
                {LISTS.ent.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {d.ent === "Other" ? (
              <label>
                Describe the entertainment *
                <input value={d.entOther} onChange={(e) => set("entOther", e.target.value)} placeholder="String quartet" />
              </label>
            ) : (
              <span />
            )}
            <label>
              Food *
              <select value={d.food} onChange={(e) => set("food", e.target.value as RentalDetails["food"])}>
                {Object.entries(FOODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <span />
            {d.food !== "none" && (
              <>
                <label>
                  Caterer *
                  <input value={d.catName} onChange={(e) => set("catName", e.target.value)} />
                </label>
                <label>
                  Caterer phone
                  <input value={d.catPhone} onChange={(e) => set("catPhone", e.target.value)} />
                </label>
                <label className="span2">
                  Caterer email
                  <input value={d.catEmail} onChange={(e) => set("catEmail", e.target.value)} />
                </label>
              </>
            )}
          </div>
          <div className="check-row">
            <label className="inline-check">
              <input type="checkbox" checked={d.storage} onChange={(e) => set("storage", e.target.checked)} /> Storage the night
              before ($150)
            </label>
          </div>
          {d.block === "custom" && (
            <div className="muted small">
              Custom time: {Math.round(f.hours * 10) / 10} hours
              {f.extraHours ? `, ${f.extraHours} over 6 → ${money(f.extra)}` : " (no extra charge up to 6)"}.
            </div>
          )}
        </section>

        <section className="panel">
          <h2>4. Additional tables, chairs and linens</h2>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Rented from an outside vendor. Each line needs a type and a fee.
          </div>
          {d.vendor.length > 0 && (
            <table className="rows">
              <thead>
                <tr>
                  <th />
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Fee each</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.vendor.map((l, i) => (
                  <tr key={i}>
                    <td className="small">{l.kind}</td>
                    <td>
                      <select value={l.type} onChange={(e) => setLine("vendor", i, { type: e.target.value })}>
                        <option value="">Choose a type</option>
                        {LISTS[l.kind as VendorKind].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      {l.type === "Other" && (
                        <input
                          style={{ marginTop: 4 }}
                          placeholder="Describe"
                          value={l.other}
                          onChange={(e) => setLine("vendor", i, { other: e.target.value })}
                        />
                      )}
                    </td>
                    <td style={{ width: 70 }}>
                      <input type="number" min={1} value={l.qty} onChange={(e) => setLine("vendor", i, { qty: Number(e.target.value) })} />
                    </td>
                    <td style={{ width: 100 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.fee ?? ""}
                        placeholder="$"
                        onChange={(e) => setLine("vendor", i, { fee: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className="calc">{money(lineTotal(l))}</td>
                    <td>
                      <button type="button" className="small" aria-label="Remove line" onClick={() => removeLine("vendor", i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row-tools">
            {(["Tables", "Chairs", "Linens"] as const).map((k) => (
              <button type="button" key={k} onClick={() => addLine("vendor", k)}>
                + Add {k.toLowerCase()}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>5. Other rental items</h2>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Anything else billed to the client, such as an extra wireless mic or a projector.
          </div>
          {d.items.length > 0 && (
            <table className="rows">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Fee each</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.items.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input value={l.name} placeholder="Wireless mic" onChange={(e) => setLine("items", i, { name: e.target.value })} />
                    </td>
                    <td style={{ width: 70 }}>
                      <input type="number" min={1} value={l.qty} onChange={(e) => setLine("items", i, { qty: Number(e.target.value) })} />
                    </td>
                    <td style={{ width: 100 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.fee ?? ""}
                        placeholder="$"
                        onChange={(e) => setLine("items", i, { fee: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className="calc">{money(lineTotal(l))}</td>
                    <td>
                      <button type="button" className="small" aria-label="Remove item" onClick={() => removeLine("items", i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" onClick={() => addLine("items", "Item")}>
            + Add item
          </button>
        </section>

        <section className="panel">
          <h2>6. Bar service</h2>
          <div className="form-grid">
            <label>
              Bar option *
              <select value={d.bar} onChange={(e) => set("bar", e.target.value as RentalDetails["bar"])}>
                {Object.entries(BARS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {tabbed ? (
              <label>
                {d.bar === "ongo" ? "Tab limit *" : "Tab amount *"}
                <input type="number" min={0} step="0.01" value={d.tab ?? ""} onChange={(e) => set("tab", numOrNull(e.target.value))} />
              </label>
            ) : (
              <span />
            )}
            {d.bar === "lim" && (
              <label className="span2">
                Included options
                <input value={d.incl} onChange={(e) => set("incl", e.target.value)} placeholder="Keg, rail liquors, N/A options" />
              </label>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>
            7. Fees and deposit{" "}
            <span className="badge">
              {d.date ? (f.weekend ? "Weekend rate (Fri–Sun)" : "Weekday rate (Mon–Thu)") : "Pick a date"}
            </span>
          </h2>
          <div className="form-grid">
            <label>
              Default rental rate
              <input value={`${money(f.defaultRate)}${info.provisional ? " (provisional)" : ""}`} disabled />
            </label>
            <label>
              Rental rate charged *
              <input
                type="number"
                min={0}
                step="0.01"
                value={d.rate ?? f.startRate}
                onChange={(e) => set("rate", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </label>
            <label className="span2">
              Deposit
              <select value={d.depBasis} onChange={(e) => set("depBasis", e.target.value as RentalDetails["depBasis"])}>
                <option value="rate">50% of the rental rate</option>
                <option value="total">50% of all costs</option>
              </select>
            </label>
            <label className="span2">
              Staff notes (not on the contract)
              <textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            {d.nonProfit && `Non-profit: starts at 50% (${money(f.startRate)}). `}
            {f.rate < f.startRate && `Discount: ${money(f.startRate - f.rate)} below the starting rate. `}
            {d.rate !== null && (
              <button type="button" className="link" onClick={() => set("rate", null)}>
                Reset to {money(f.startRate)}
              </button>
            )}
          </div>
        </section>

        {p.canEdit && (
          <div className="offer-save">
            <button className="primary">{p.rentalId ? "Save changes" : "Save rental"}</button>
          </div>
        )}
      </fieldset>

      <aside className="offer-budget panel">
        <h2>Fees</h2>
        <table className="list fee-sum">
          <tbody>
            <tr>
              <td>Rental rate</td>
              <td>{money(f.rate)}</td>
            </tr>
            <tr>
              <td>Extra hours ($250/hr over 6)</td>
              <td>{money(f.extra)}</td>
            </tr>
            <tr>
              <td>Storage</td>
              <td>{money(f.storage)}</td>
            </tr>
            <tr>
              <td>Tables, chairs and linens</td>
              <td>{money(f.vendorTotal)}</td>
            </tr>
            <tr>
              <td>Other rental items</td>
              <td>{money(f.itemTotal)}</td>
            </tr>
            <tr>
              <td>Bar tab + 20% gratuity</td>
              <td>{d.bar === "ongo" ? "paid on the night" : money(f.barTotal)}</td>
            </tr>
            <tr className="total">
              <td>Subtotal</td>
              <td>{money(f.subtotal)}</td>
            </tr>
            <tr>
              <td>{d.taxExempt ? "Sales tax (tax exempt)" : "Sales tax (7%)"}</td>
              <td>{money(f.tax)}</td>
            </tr>
            <tr className="total">
              <td>Total</td>
              <td>{money(f.total)}</td>
            </tr>
            <tr>
              <td>
                {f.within30
                  ? "Due at signing (event within 30 days)"
                  : `Deposit (50% of ${d.depBasis === "rate" ? "rental rate" : "all costs"})`}
              </td>
              <td>{money(f.deposit)}</td>
            </tr>
            <tr>
              <td>{f.within30 || !f.balanceDue ? "Remaining balance" : `Remaining balance, due ${fmtLongDate(f.balanceDue)}`}</td>
              <td>{money(f.balance)}</td>
            </tr>
          </tbody>
        </table>
        {info.provisional && <div className="warn">Ideal Dress Club rates and included items are not final yet.</div>}
        {problems.length > 0 ? (
          <div className="muted small" style={{ marginTop: 8 }}>
            Still needed: {problems.length} item{problems.length > 1 ? "s" : ""}.
          </div>
        ) : (
          <div className="small" style={{ marginTop: 8, color: "var(--confirmed)", fontWeight: 600 }}>
            Ready to save.
          </div>
        )}
      </aside>
    </form>
  );
}
