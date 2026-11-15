import { fmtLongDate, fmtTime, lineName, lineTotal, money, type Person, type RentalDetails, type RentalFees } from "@/lib/rental";

// The xBk private event rental agreement (accepted revision, Nov 2026), filled in from the rental form.
// Wording outside the filled-in values follows the signed-off agreement; change it here.

const Fill = ({ v }: { v: string | number | null | undefined }) =>
  v !== null && v !== undefined && String(v).trim() ? <span className="k-fill">{String(v)}</span> : <span className="k-blank" />;
const Box = ({ on }: { on: boolean }) => <span className="k-box">{on ? "☒" : "☐"}</span>;

function PersonBlock({ p, org, alt = true }: { p: Person; org?: string; alt?: boolean }) {
  const name = org ? (p.name ? `${p.name} (${org})` : org) : p.name;
  return (
    <p>
      Name: <Fill v={name} />
      <br />
      Address: <Fill v={p.addr} />
      <br />
      City/State/Zip: <Fill v={p.csz} />
      <br />
      Phone: <Fill v={p.phone} />
      <br />
      {alt && (
        <>
          Alt Phone: <Fill v={p.alt} />
          <br />
        </>
      )}
      Cell: <Fill v={p.cell} />
      <br />
      Email: <Fill v={p.email} />
    </p>
  );
}

const XBK_ADDRESS = "1159 24th Street, Des Moines, IA 50311";

export default function RentalContract({ d, f, today }: { d: RentalDetails; f: RentalFees; today: string }) {
  const room = f.room;
  const ent = d.ent === "Other" ? `Other: ${d.entOther}` : d.ent;
  const page1 = f.rate + f.storage + f.vendorTotal;
  const page2 = f.itemTotal + f.barTotal + f.extra;
  const tab = d.tab ?? 0;

  return (
    <article className="sheet contract">
      <header className="sheet-head">
        <div className="sheet-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xbk-logo.jpg" alt="xBk" className="sheet-logo" />
          <div>
            <div className="sheet-venue">{room.name}</div>
            <div className="sheet-addr">{room.address}</div>
            <div className="sheet-addr">www.xbklive.com</div>
          </div>
        </div>
        <div className="sheet-title">
          <div>RENTAL AGREEMENT</div>
          <div className="muted small">Private event</div>
        </div>
      </header>

      <p>
        This Agreement (inclusive of attached Addendums) is made on <Fill v={fmtLongDate(today)} />, by and between xBk, LLC
        (“xBk”) and <Fill v={d.client} /> (“Client”, “you”, “your”) (collectively, the “Parties”) with respect to the private
        event rental of <Fill v={room.name} /> located at <Fill v={room.address} /> (the “Venue”), you agree to the following:
      </p>

      <h3>1. Contact information</h3>
      <div className="k-two">
        <div>
          <h4>xBk:</h4>
          <p>
            xBk, LLC
            <br />
            Address: {XBK_ADDRESS}
            <br />
            Phone: (515) 344-3348
            <br />
            Contact: <Fill v={d.xbkContact.name} />
            <br />
            Email: <Fill v={d.xbkContact.email} />
          </p>
        </div>
        <div>
          <h4>Client:</h4>
          <PersonBlock p={d.contact} org={d.client} />
        </div>
      </div>
      {d.hasClient2 && (
        <>
          <h4>Additional Client:</h4>
          <PersonBlock p={d.client2} alt={false} />
        </>
      )}

      <div className="k-cut">(Cut along line and destroy portion below immediately following final payment)</div>
      <p>
        Credit Card Number: <span className="k-blank wide" />
        <br />
        <span className="small">
          (Client will be notified before any charges are made. Client authorizes xBk to charge this card for any unpaid
          balance, Overage Fees, and cleaning or repair charges due under this Agreement. Information shredded when balance
          paid in full)
        </span>
        <br />
        Name on Card: <span className="k-blank" /> Exp Date: <span className="k-blank short" />
        <br />
        Address: <span className="k-blank wide" />
      </p>

      <h3>2. General rental information</h3>
      <p>
        a. Date of Event: <Fill v={fmtLongDate(d.date)} />
      </p>
      <p>
        b. Type of Event/Description: <Fill v={[d.eventName.trim(), d.eventType, d.description.trim()].filter(Boolean).join(" – ")} />
      </p>
      <p>
        c. Rental Type:
        <br />
        <Box on={!f.weekend} /> Weekday – Mon–Thu ({money(room.weekday)})
        <br />
        <Box on={f.weekend} /> Weekend – Fri–Sun ({money(room.weekend)})
        {f.rate !== f.defaultRate && (
          <>
            <br />
            Rental rate charged: <Fill v={money(f.rate)} />
          </>
        )}
      </p>
      <p>
        d. Room/Stage setup: <Fill v={d.setup} />
        <br />
        Entertainment: <Fill v={ent} />
        <br />
        {d.food === "none" ? (
          "Food: No food"
        ) : (
          <>
            Food: <Fill v={d.food === "meal" ? "Catered meal" : "Appetizers or light food"} />
            <br />
            Catered by: <Fill v={d.catName} /> Phone: <Fill v={d.catPhone} /> Email: <Fill v={d.catEmail} />
          </>
        )}
      </p>
      <p>e. Additional tables, chairs and linens (rented from a third-party vendor; fees below):</p>
      {d.vendor.length ? (
        <table className="sheet-table grid">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Total fee</th>
            </tr>
          </thead>
          <tbody>
            {d.vendor.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.kind}: {lineName(l)}
                </td>
                <td>{l.qty}</td>
                <td>{money(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>None</p>
      )}
      <p>
        <strong>
          GRI PAGE ONE TOTAL: <Fill v={money(page1)} />
        </strong>
      </p>

      <p>f. Rental Items requested (additional fee will apply unless otherwise noted):</p>
      <table className="sheet-table grid">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Total fee</th>
          </tr>
        </thead>
        <tbody>
          {d.items.length === 0 && (
            <tr>
              <td>None</td>
              <td />
              <td />
            </tr>
          )}
          {d.items.map((l, i) => (
            <tr key={i}>
              <td>{lineName(l)}</td>
              <td>{l.qty}</td>
              <td>{money(lineTotal(l))}</td>
            </tr>
          ))}
          <tr className="total">
            <td>TOTAL AMOUNT DUE:</td>
            <td />
            <td>{money(f.itemTotal)}</td>
          </tr>
        </tbody>
      </table>

      <p>
        g. Anticipated Attendance: <Fill v={d.attendance} /> (Limit {room.cap} person capacity)
      </p>
      <p>
        h. Bar Service Options:
        <br />
        <Box on={d.bar === "pre"} /> Pre-Paid Tab by Client (Amount: {d.bar === "pre" ? <Fill v={money(tab)} /> : "$______"} + 20%
        Gratuity {d.bar === "pre" ? <Fill v={money(f.gratuity)} /> : "$______"})
        <br />
        <Box on={d.bar === "ongo"} /> Ongoing Tab (to be paid at end of the night by organizer) (+20% Gratuity)
        {d.bar === "ongo" && (
          <>
            {" "}
            – tab limit <Fill v={money(tab)} />
          </>
        )}
        <br />
        <Box on={d.bar === "lim"} /> Limited Complimentary Options (ie- keg, rail liquors, N/A options, etc.)
        {d.bar === "lim" && (
          <>
            : total tab limit <Fill v={money(tab)} /> (+20% Gratuity <Fill v={money(f.gratuity)} />); included options:{" "}
            <Fill v={d.incl} />
          </>
        )}
        <br />
        <Box on={d.bar === "cash"} /> Cash Bar
        <br />
        <Box on={d.bar === "none"} /> No Bar/Drink Service
      </p>
      <p>
        i. Total Reservation Duration:
        <br />
        <Box on={d.block === "day"} /> Daytime Block (10am to 4pm, includes set up and tear down)
        <br />
        <Box on={d.block === "eve"} /> Evening Block (5pm to 11pm, includes set up and tear down)
        <br />
        <Box on={d.block === "custom"} /> Custom Time (+$250 for each hour over 6 hour event)
        {d.block === "custom" && f.extraHours > 0 && (
          <>
            {" "}
            – <Fill v={`${f.extraHours} hr = ${money(f.extra)}`} />
          </>
        )}
        <br />
        Event Start time: <Fill v={fmtTime(d.start)} /> Event End time: <Fill v={fmtTime(d.end)} />
        {d.storage && (
          <>
            <br />
            Storage the night prior to the event: <Fill v={money(f.storage)} />
          </>
        )}
      </p>
      <p>
        <strong>
          GRI PAGE TWO TOTAL: <Fill v={money(page2)} />
          <br />
          GRI PAGE ONE TOTAL: <Fill v={money(page1)} /> (from previous page)
          <br />
          TOTAL FEES: <Fill v={money(f.subtotal)} />
        </strong>
      </p>

      <h3>3. Rental rates and fees</h3>
      <p>The Client(s) agree to pay the following rental rates and fees:</p>
      <p>
        Rental Rate. The Client(s) agree to reserve the venue at the rate and fees of <Fill v={money(f.subtotal)} /> (above)
      </p>
      <p>
        a. Subtotal Fees <Fill v={money(f.subtotal)} /> (does not include additional 7% sales tax)
        <br />
        b. Sales Tax (7%) <Fill v={d.taxExempt ? "Tax exempt – $0.00" : money(f.tax)} />
        <br />
        c. <strong>Reservation Deposit</strong>. A reservation deposit is required in advance to successfully reserve the venue.
        The reservation deposit is 50% of the <Box on={d.depBasis === "rate"} /> rental rate <Box on={d.depBasis === "total"} />{" "}
        total fees (as checked) and has limited refundability (see “Cancellation”) <Fill v={money(f.deposit)} /> (Due upon
        receipt of invoice, reservation will be canceled if left unpaid for three (3) days following delivery of invoice)
        <br />
        d. Remaining Balance <Fill v={money(f.balance)} /> (Due on or before{" "}
        <Fill v={f.within30 ? "execution of this Agreement" : fmtLongDate(f.balanceDue)} /> (ten (10) days prior to Event Date)
      </p>
      <p>
        The Balance Due amount excludes applicable Overage Fees as provided below. If Client(s) fail to pay the Balance Due on
        or before the above due date, the reservation will be deemed canceled and forfeited without further notice. If the
        event date is less than 30 days away, 100% of the total fees is due at the time of executing this Agreement.
      </p>
      <p>Overage Fees.</p>
      <ol type="A" className="k-list">
        <li>
          A $50 fee will apply for every 15 minutes the event extends past the event end time in Section 2 hereinabove unless
          previously approved by xBk. (To avoid additional charges we recommend that you allow 45 minutes for breakdown time.)
        </li>
        <li>Storage Fees. Storage for the night prior to the event will be $150.00.</li>
        <li>
          Cleaning &amp; Repair Fees. Additional charges may be made for actual or estimated repair or cleaning costs to restore
          venue, grounds, equipment or other property to the same condition prior to Client(s) use of the venue and xBk’s
          property. Please note this may include any damage repair or additional cleaning necessary due to wall hanging of
          decorations, or additional clean up time for food messes. xBk prohibits the use of confetti and glitter.
        </li>
      </ol>

      <h3>4. Items/services included in rental</h3>
      <p>The following shall be included in the rental rate:</p>
      {room.included ? (
        <ul className="k-list">
          {room.included.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p>
          <Fill v="[Ideal Dress Club included items to be confirmed]" />
        </p>
      )}
      <p>* Additional staffing may be requested upon fourteen days (14) advance notice of your event. Additional fees will apply.</p>

      <h3>5. Cancellations</h3>
      <p>
        All cancellations must be made in writing and delivered to xBk via email no less than forty-five (45) calendar days
        prior to the Event Date in Section 2 hereinabove to have their deposit refunded. There are no refunds for any deposit
        should the notification of cancellation take place less than forty-five (45) days prior to the Event Date above,
        deposit shall not be refunded. Client(s) is (are) responsible for payment in full if the event is canceled less than ten
        (10) days prior to the Event Date, except as determined to be canceled due to industry standard “Acts of God.”
      </p>
      <p>
        Client(s) recognize the foregoing cancellation policy is not intended to be punitive, but, reflect xBk’s foregoing
        actual or potential business in reserving the venue for Client(s) and diminished ability to rent or otherwise book the
        venue within 45 days of an event date, thus mitigating detrimental reliance.
      </p>

      <h3>6. Payments</h3>
      <p>
        All payments due herein shall be made via credit card, cash, personal check or cashier’s check. Personal checks shall
        be made payable to:
        <br />
        xBk, LLC
        <br />
        PO Box #41458
        <br />
        Des Moines, IA 50311
      </p>
      <p>
        Any check returned for insufficient funds is subject to a $30.00 returned check fee. Total contract fees must be paid
        10 calendar days prior to the Event Date.
      </p>
      <p>
        Billing shall be completed by invoice with an outline of all budgeted line items herein including 7% sales tax. Deposit
        payment is due upon receipt, the remainder as scheduled above. Any overage or penalty fees will be assessed in a
        subsequent invoice sent no more than three (3) business days following the Event.
      </p>

      <h3>7. Additional terms</h3>
      {ADDITIONAL_TERMS.map(([title, text], i) => (
        <p key={title}>
          {String.fromCharCode(97 + i)}. <strong>{title}.</strong> {text}
        </p>
      ))}

      <h3>8. Severability</h3>
      <p>
        In case any one or more of the provisions, or portions of provisions, of this Agreement shall be deemed by any legal
        authority to be invalid, illegal or unenforceable in any respect, the validity, legality and enforceability of the
        remaining provisions, or portions of provisions contained herein shall not be in any way affected or impaired thereby.
      </p>
      <h3>9. Modification</h3>
      <p>
        No alteration or other modification of this Agreement shall be effective unless such modification shall be in writing
        and formally executed by the Parties.
      </p>
      <h3>10. Opportunity to review</h3>
      <p>
        By executing this Agreement the undersigned parties warrant and represent they have had an opportunity to review,
        including being presented with a copy of Addendum A “Terms and Conditions,” and after such review or opportunity to
        review have read and understood all terms and conditions pertaining to this Agreement, having utilized what legal
        counsel they have deemed necessary.
      </p>
      <h3>11.</h3>
      <p>
        The above Clients shall be referred to collectively hereinafter as Client(s). Each of the Clients are jointly and
        severally responsible for the obligations contained in this Agreement. By entering into this Agreement, the Client(s)
        agree to the “Terms and Conditions” of xBk (Addendum A), xBk’s “Code of Conduct” (Addendum B), and xBk’s “Technical
        Rider” (Addendum C).
      </p>
      <p>
        IN WITNESS WHEREOF, the parties hereto, intending to be legally bound, have caused this Agreement along with the
        attached Terms and Conditions to be duly executed as of the day and year first hereinabove written.
      </p>

      <div className="k-sign">
        <div>
          <h4>FOR xBk:</h4>
          <SignLines print={d.xbkContact.name} />
        </div>
        <div>
          <h4>FOR Client(s):</h4>
          <SignLines print={d.contact.name} />
          {d.hasClient2 && <SignLines print={d.client2.name} />}
        </div>
      </div>

      <section className="k-addendum">
        <h2>Addendum A</h2>
        <h3 className="k-sub">Terms and Conditions</h3>
        <p>
          Please read the material below to make sure all parties understand the requirements of providing for everyone’s
          safety and keeping xBk a well maintained and safe location for future use.
        </p>
        {ADDENDUM_A.map(([head, ...paras]) => (
          <div key={head}>
            <h4>{head}</h4>
            {paras.map((x, i) => (
              <p key={i}>{x}</p>
            ))}
          </div>
        ))}
      </section>

      <section className="k-addendum">
        <h2>Addendum B</h2>
        <h3 className="k-sub">xBk Code of Conduct</h3>
        <p>{CODE_INTRO}</p>
        <ul className="k-list">
          {CODE_POINTS.map((x) => (
            <li key={x.slice(0, 30)}>{x}</li>
          ))}
        </ul>
        <p>Please have fun. Please enjoy your experience. Please be kind.</p>
      </section>

      <section className="k-addendum">
        <h2>Addendum C</h2>
        <h3 className="k-sub">xBk Technical Rider</h3>
        <div className="k-rider">
          {TECH_RIDER.map(([head, items]) => (
            <div key={head}>
              <h4>{head}</h4>
              <ul>
                {items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function SignLines({ print }: { print: string }) {
  return (
    <div className="k-signlines">
      <div>
        Signature: <span className="k-line" />
      </div>
      <div>
        Date: <span className="k-line" />
      </div>
      <div>
        Print: {print.trim() ? <span className="k-fill">{print}</span> : <span className="k-line" />}
      </div>
    </div>
  );
}

const ADDITIONAL_TERMS: [string, string][] = [
  [
    "Insurance",
    "Client shall maintain general liability insurance for the event of at least $1,000,000 per occurrence, including host liquor liability when alcohol is served, naming xBk, LLC and the building owner as additional insureds, and shall provide a certificate of insurance no later than fourteen (14) days prior to the Event Date. All outside vendors (including caterers, entertainers, and rental companies) must carry their own insurance.",
  ],
  ["Capacity", "Attendance shall not exceed the capacity stated in Section 2. xBk may refuse entry to guests in excess of that capacity."],
  [
    "Admission and Ticket Sales",
    "Client shall not charge admission, sell tickets, or publicly advertise the event without xBk’s prior written approval.",
  ],
  [
    "Security and Identification",
    "xBk may require additional security staff, at Client’s expense, for events with large or underage attendance. Guests must present valid government-issued identification to be served alcohol.",
  ],
  [
    "Bar Tabs",
    "When a pre-paid or limited tab is reached, bar service will convert to a cash bar unless Client authorizes an increase, which will be billed with the same 20% gratuity.",
  ],
  [
    "Tax-Exempt and Non-Profit Status",
    "Sales tax will be waived only upon xBk’s receipt of a completed Iowa sales tax exemption certificate prior to the Event Date. Any non-profit rate requires proof of non-profit status. If documentation is not provided, the standard rate and applicable sales tax apply.",
  ],
  [
    "Rescheduling",
    "A written request to reschedule received at least forty-five (45) days prior to the Event Date may, at xBk’s discretion and subject to availability, transfer the deposit once to a new date within twelve (12) months.",
  ],
  [
    "Force Majeure",
    "Neither Party shall be liable for failure to perform due to causes beyond its reasonable control, including severe weather, fire, utility failure, government orders, public health emergencies, or other acts of God. If the event cannot take place for such a cause, xBk will offer an alternate date or refund amounts paid, less costs already incurred.",
  ],
  [
    "Limitation of Liability",
    "If xBk is unable to provide the Venue for reasons within its control, xBk’s liability shall be limited to a refund of amounts paid under this Agreement. xBk shall not be liable for any indirect, incidental, or consequential damages.",
  ],
  ["Late Payment", "Amounts not paid when due shall accrue a late charge of 1.5% per month, or the maximum rate permitted by law if lower."],
  ["Assignment", "Client may not assign this Agreement or sublet the Venue without xBk’s prior written consent."],
  [
    "Photography and Recording",
    "xBk may photograph the Venue during the event for its records and promotion. Client must obtain xBk’s approval before livestreaming or professionally recording the event.",
  ],
  ["Notices", "Notices under this Agreement shall be in writing and delivered by email to the addresses listed in Section 1."],
  [
    "Governing Law",
    "This Agreement is governed by the laws of the State of Iowa. Any dispute shall be brought in the courts of Polk County, Iowa.",
  ],
  [
    "Entire Agreement; No Waiver",
    "This Agreement, together with Addendums A, B, and C, is the entire agreement of the Parties regarding the event. Failure to enforce any provision is not a waiver of that provision.",
  ],
  [
    "Counterparts; Electronic Signatures",
    "This Agreement may be signed in counterparts and electronically. Electronic signatures and copies have the same effect as originals.",
  ],
];

const ADDENDUM_A: string[][] = [
  [
    "Liability",
    "Client agrees to indemnify, defend and hold harmless xBk, LLC, its landlord, building owners, officers, employees, agents, and affiliates harmless of and from any liabilities, costs, penalties, or expenses arising out of and/or resulting from the rental and use of the premises, including but not limited, risks associated with alcohol sales and consumption by Client and client’s guests.",
    "In the event xBk, LLC, its landlord, building owners, officers, employees and/or agents, are required to file any action in court in order to enforce any provisions of this agreement, Client agrees to pay xBk, LLC, its officers, landlord, building owners, employees and/or agents, all reasonable attorney fees, court fees, and costs of suit incurred by xBk, LLC including all collection expenses and interest due.",
  ],
  [
    "Catering Standards",
    "We require that all catering be done through a certified, licensed and insured third party professional caterer. xBk has a list of recommended caters from which you may choose. Our recommended caterers have experience working at xBk and are familiar with our regulations, policies, and procedures. Use of caterers outside of our recommendations is allowed provided they meet the above outlined legal and insurance standards. All caterers must meet all local and state licensing and insurance requirements.",
    "Caterers must remove all trash, composting and recyclables from the site. All trash, including sorted recyclables and properly sorted compostables, must be collected, properly bagged, and removed by the caterer or party renting the space.",
    "Failure to remove or clean will result in additional professional cleaning fees to the caterer and will be charged to the caterer’s credit card or rental party on file.",
  ],
  [
    "Site Decoration",
    "xBk wants to make every event a special and welcome experience. Therefore, every effort will be made to allow Client to prepare decorations reflecting their creative requirements. No nails, screws, staples or penetrating items are to be used on our walls, floors,or woodwork. Glitter or foil (non-paper) confetti is not allowed on site. Only low tack tape is allowed on our floors and walls. Any damage will be charged after your event.",
  ],
  [
    "Conduct",
    "There is absolutely no drug use, smoking, or vaping of any kind tolerated on premises nor smoking within 10 feet of the building including loitering or congregating outside on the sidewalk at any time during the event. Disparaging remarks, harassment, or any type of physical violence or verbal provocation will not be tolerated and will be cause for immediate expulsion. Client and guests shall use the premises in a considerate manner at all times.",
    "During underage events, such as graduation parties, underage individuals do not have in and out privileges. Conduct deemed disorderly at the sole discretion of xBk team members shall be grounds for immediate expulsion from the premises and conclusion of the rental period. In such cases, you will be responsible for the full cost of the event and no refund will be issued. No alcohol may be taken or consumed outside of the designated event space (inside the xBk building and the connected patio). All legal consequences and ramifications for not complying with these terms and conditions are the sole responsibility of Client.",
    "All alcohol sales must end at 11:00PM and all patrons must exit the premises by midnight.",
  ],
  [
    "Live Music/DJs/Noise",
    "xBk, LLC encourages the inclusion of music, performance, and other creative performances. We have a list of preferred DJs and performers that are familiar with our regulations, policies, and procedures that can be booked at an additional fee. Use of entertainment vendors outside of our preferred vendors is possible but must be approved by xBk, LLC prior to booking. All outside entertainers must provide technical details, input lists, and stage plots for our in-house production staff no less than seven (7) business days prior to the event. Please be aware the premises are located near residential units and therefore neighborhood noise regulations do apply. In the event the Client’s event creates a disturbance due to high noise volume, xBk team members have full authority to ask the Client, DJ or live music presenter to turn the entertainment down and/or off. If repeated disturbances are created, at xBk’s discretion, you may be expelled from the premises or the offending noise will be ended. In the event of disturbances to the point of expulsion, no portion of the event costs will be refunded to Client. The Client will also be solely responsible for any fines or fees associated with noise ordinances. Loud music must end by 11:30 p.m. on weeknights.",
  ],
  [
    "Load-in/Load-out and Storage",
    "Limited storage is available upon request. Storage fees will be applied to any items left overnight or beyond normal load-in/load-out times. This also applies to items left post event for shipment out via courier. Note: It is not the responsibility of xBk, LLC to ensure that pick-ups or deliveries are scheduled and executed.",
  ],
  [
    "Cleaning, Trash, and Equipment Removal",
    "xBk will be in a clean condition prior to your event. Within two (2) hours following the event, you are required to return the space to the same clean condition in which it was found. All rental equipment must be removed immediately following your event.",
  ],
  [
    "City, County, State, and Federal Laws",
    "Client agrees to comply with all applicable City, County, State, and Federal laws and shall conduct no illegal act on the premises. This is a drug free and non-smoking facility at all times, and there are no exceptions. Client shall not sell alcohol on premises at any time. Client may not serve alcohol to minors on the premises at any time. Client agrees, for everyone’s safety, to ensure alcoholic beverages are consumed in a responsible manner. xBk, LLC reserves the right, in its exclusive discretion, to expel anyone who, in its judgment, is intoxicated or under the influence of alcohol or drugs, or who shall, in any manner, do or participate in any act jeopardizing the rights, use permit, or insurability of xBk, LLC or the safety of its staff, guests, or building contents.",
  ],
  [
    "Lost and Found",
    "xBk, LLC takes no responsibility for personal effects and possessions left on premises during or after any event. We will hold recovered items up to 30 days. Reasonable efforts will be made to return any recovered item to its rightful owner.",
  ],
  [
    "Promotions and Copyright",
    "You may use xBk’s name and location strictly for informational purposes only. Any such use of xBk’s name shall not be used to state or imply an endorsement of your event. Unauthorized use of xBk’s name and intellectual property (“IP”) shall be strictly prohibited without express written consent. Any unauthorized use of xBk’s IP shall be deemed a breach of this agreement and subject to all available legal remedies.",
  ],
];

const CODE_INTRO =
  "xBk strives to create a safe, diverse, equitable, and inclusive environment for everyone that walks through our doors. We know that we don’t always do it right, but we have made the commitment to always try to do better. This starts with us outlining our values and being open to hearing yours. Our job is to provide a great experience for the artists and patrons that come into our room. To that end, these are the things we hold to be important:";

const CODE_POINTS = [
  "We want everyone that walks through our doors to feel safe no matter your race, religion, ability, sexual orientation, gender, or otherwise. We welcome everyone and are committed to making sure you feel comfortable being the “you” that you are! We have a zero tolerance policy for bigotry, harassment or discrimination. We know not everyone holds the same views, but everyone came to xBk to have a good experience. Please just let people enjoy themselves.",
  "And though it should be very self evident, please keep your hands to yourself. I promise, if a person doesn’t know you, they probably don’t want you touching them beyond a gentle tap to ask to get by.",
  "Please be respectful to our staff. They work very hard to make sure you have the best possible live event experience possible. They are here to make sure you have a good time, but they are also human beings that deserve to be treated with respect and dignity. Just because they are serving you doesn’t mean they are a servant.",
  "Our staff is also here to ensure you feel safe. If you feel unsafe for any reason, please seek out the closest staff member and let us know. You should not have to endure harassment, bigotry, or unwanted comments.",
  "We want you to have fun and enjoy your cocktails, but we do reserve the right to stop serving you if we can see you are significantly impaired. We’re not trying to be a fun hater, we just want to make sure you make it home safely so you can come back again. Also, if you’ve had too much to drink, don’t drive. It’s just not worth it. We’re happy to help you find a safe way home.",
  "Please respect the space. People have to clean the place up so just don’t be super gross or destroy things. It’s not cool.",
];

const TECH_RIDER: [string, string[]][] = [
  ["Main PA", ["L’Acoustic ARCS System", "(2) ARCS Wide", "(2) ARCS Narrow", "(4) SB18m Subwoofer"]],
  ["Mezz Fills", ["(3) Tannoy AMS 6DS", "(1) Lab Gruppen Lucia 240/2 Amp"]],
  ["Stage Monitors", ["(5) Electro-Voice ETX-12P 12\" 2000W 2-Way Full Range Powered Loudspeaker"]],
  ["Audio", ["Midas Pro 2c w DL251 Stagebox", "(2) Ether Con 150'", "(4) Sub Snakes", "32 Analog Channel Snake"]],
  [
    "Video",
    [
      "(1) AViPAS AV-1280 PoE PTZ",
      "(1) Marshall Electronics CV503 Compact HD Camera (3G/HD-SDI)",
      "Blackmagic Design ATEM Television Studio HD",
      "LC-X85 LCD 7000 Lumen Projector",
    ],
  ],
  [
    "Lighting",
    [
      "High End System - Hoglet 4 Controller",
      "Stage Wash: (4) Source 4 Ellipsoidal Lights",
      "Downstage: (4) Blizzard Stilletto Z6 moving heads; (3) American DJ Ultra Bar 12 Hex",
      "Upstage: (4) Chauvet Intimidator Spot 260 moving heads; (3) American DJ Ultra Bar 12 Hex",
    ],
  ],
];
