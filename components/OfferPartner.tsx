"use client";

import { useState } from "react";
import type { Extracted } from "@/lib/offer-extract";
import { PARTNER_LABEL, money, type OfferFile, type Terms } from "@/lib/offer";
import { createClient } from "@/lib/supabase/client";

type Props = {
  t: Terms;
  setT: (fn: (x: Terms) => Terms) => void;
  canPickKind: boolean; // offers not tied to holds choose their type here
  onApply: (x: Extracted) => string[]; // fills the form; returns what was filled
};

// Top of the offer form for promoter rentals and co-pros: who the partner is, the rental fee,
// and their offer (attach it, and fill in our offer from it).
export default function OfferPartner({ t, setT, canPickKind, onApply }: Props) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [found, setFound] = useState<Extracted | null>(null);
  const [filled, setFilled] = useState<string[]>([]);
  const who = PARTNER_LABEL[t.kind] || "Partner";
  const setPartner = (k: keyof Terms["partner"], v: string) => setT((x) => ({ ...x, partner: { ...x.partner, [k]: v } }));

  const attach = async (file: File) => {
    setNote("");
    setFound(null);
    setFilled([]);
    try {
      setBusy("Uploading…");
      const start = await fetch("/api/offer-files/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name }),
      }).then((r) => r.json());
      if (start.error) throw new Error(start.error);
      const { error } = await createClient().storage.from("offer-files").uploadToSignedUrl(start.path, start.token, file, {
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      const entry: OfferFile = { path: start.path, name: file.name, size: file.size, uploadedAt: new Date().toISOString() };
      setT((x) => ({ ...x, files: [...x.files, entry] }));

      setBusy("Reading the offer…");
      const read = await fetch("/api/offer-files/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: start.path, name: file.name, type: file.type }),
      }).then((r) => r.json());
      if (read.error) throw new Error(read.error);
      if (read.note) setNote(read.note);
      if (read.extracted && Object.keys(read.extracted).length) setFound(read.extracted);
      else if (!read.note) setNote("Attached. No deal details could be found in it.");
    } catch (e) {
      setNote(`Couldn’t attach: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const summary = found ? foundSummary(found) : [];

  return (
    <section className="panel partner-panel">
      <h2>{t.kind === "show" ? "Offer type" : `${who} details`}</h2>
      {canPickKind && (
        <div className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            Type
            <select value={t.kind} onChange={(e) => setT((x) => ({ ...x, kind: e.target.value as Terms["kind"] }))}>
              <option value="show">Show (our offer to the artist)</option>
              <option value="promoter">Promoter rental</option>
              <option value="copro">Co-pro</option>
            </select>
          </label>
        </div>
      )}
      {t.kind !== "show" && (
        <>
          <div className="form-grid">
            <label>
              {who} (company)
              <input value={t.partner.company} onChange={(e) => setPartner("company", e.target.value)} />
            </label>
            <label>
              Contact name
              <input value={t.partner.contact} onChange={(e) => setPartner("contact", e.target.value)} />
            </label>
            <label>
              Phone
              <input type="tel" value={t.partner.phone} onChange={(e) => setPartner("phone", e.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={t.partner.email} onChange={(e) => setPartner("email", e.target.value)} />
            </label>
          </div>

          {t.kind === "promoter" && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>
                Proposed rental fee
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={t.rentalFee || ""}
                  placeholder="$"
                  onChange={(e) => setT((x) => ({ ...x, rentalFee: Number(e.target.value) || 0 }))}
                />
              </label>
              <label>
                Rental fee is paid
                <select
                  value={t.rentalPay}
                  onChange={(e) => setT((x) => ({ ...x, rentalPay: e.target.value as Terms["rentalPay"] }))}
                >
                  <option value="upfront">Up front, before the show</option>
                  <option value="ticket_sales">From ticket sales, at settlement</option>
                </select>
              </label>
            </div>
          )}

          <div className="field-label" style={{ marginTop: 12 }}>
            {who}’s offer
          </div>
          {t.files.length > 0 && (
            <ul className="file-list">
              {t.files.map((f) => (
                <li key={f.path}>
                  <a href={`/api/offer-files/open?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer">
                    📎 {f.name}
                  </a>{" "}
                  <span className="muted small">{Math.max(1, Math.round(f.size / 1024))} KB</span>{" "}
                  <button
                    type="button"
                    className="small"
                    onClick={() => setT((x) => ({ ...x, files: x.files.filter((y) => y.path !== f.path) }))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="file-pick">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,image/*,application/pdf"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void attach(f);
                e.target.value = "";
              }}
            />
            <span className="button-like">{busy || `Attach ${who.toLowerCase()}’s offer (PDF, Word or photo)`}</span>
          </label>
          {note && <div className="muted small" style={{ marginTop: 6 }}>{note}</div>}

          {found && summary.length > 0 && (
            <div className="found-box">
              <strong>Found in the offer:</strong>
              <ul>
                {summary.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setFilled(onApply(found));
                  setFound(null);
                }}
              >
                Fill in our offer from this
              </button>{" "}
              <button type="button" onClick={() => setFound(null)}>
                Not now
              </button>
              <div className="muted small" style={{ marginTop: 4 }}>
                This replaces what’s in those fields now. Check the numbers before sending.
              </div>
            </div>
          )}
          {filled.length > 0 && <div className="flash ok" style={{ marginTop: 8 }}>Filled in: {filled.join(", ")}.</div>}
        </>
      )}
    </section>
  );
}

function foundSummary(x: Extracted): string[] {
  const out: string[] = [];
  if (x.artist) out.push(`Artist: ${x.artist}`);
  if (x.date) out.push(`Date: ${x.date}`);
  if (x.partner && Object.values(x.partner).some(Boolean))
    out.push(`From: ${[x.partner.company, x.partner.contact, x.partner.phone, x.partner.email].filter(Boolean).join(" · ")}`);
  if (x.dealType) out.push(`Deal: ${x.dealType}${x.guarantee ? `, ${money(x.guarantee)} guarantee` : ""}${x.percent ? `, ${x.percent}%${x.pctBasis ? ` of ${x.pctBasis}` : ""}` : ""}`);
  else if (x.guarantee) out.push(`Guarantee: ${money(x.guarantee)}`);
  if (x.rentalFee) out.push(`Rental fee: ${money(x.rentalFee)}`);
  if (x.capacity) out.push(`Capacity: ${x.capacity}`);
  if (x.tiers?.length) out.push(`Tickets: ${x.tiers.map((y) => `${y.name} ${money(y.price)}${y.qty ? ` × ${y.qty}` : ""}`).join(", ")}`);
  if (x.costs?.length) out.push(`Expenses: ${x.costs.map((y) => `${y.label} ${money(y.amount)}`).join(", ")}`);
  const times = [x.doors && `doors ${x.doors}`, x.showTime && `show ${x.showTime}`, x.curfew && `curfew ${x.curfew}`].filter(Boolean);
  if (times.length) out.push(`Times: ${times.join(", ")}`);
  for (const [k, label] of [["support", "Support"], ["ages", "Ages"], ["deposit", "Deposit"], ["merch", "Merch"], ["radius", "Radius"]] as const) {
    if (x[k]) out.push(`${label}: ${x[k]}`);
  }
  if (x.notes) out.push(`Other terms: ${x.notes}`);
  return out;
}
