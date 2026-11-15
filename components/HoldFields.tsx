"use client";

import { useState } from "react";
import type { ArtistChoice } from "@/lib/artist-choices";
import type { Hold } from "@/lib/types";

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Artist, type, agent and notes fields shared by the new-hold and edit forms.
// Typing a known artist (or another spelling of one) suggests the standard name and
// fills in their usual agent when the agent fields are empty.
export default function HoldFields({ hold, artists = [] }: { hold?: Partial<Hold>; artists?: ArtistChoice[] }) {
  const [kind, setKind] = useState<string>(hold?.kind ?? "show");
  const [match, setMatch] = useState<ArtistChoice | null>(null);
  const [typed, setTyped] = useState(hold?.title ?? "");
  const isArtist = kind === "show" || kind === "copro";

  const find = (v: string) => {
    const k = key(v);
    if (!k) return null;
    return artists.find((a) => key(a.name) === k || a.aliases.some((x) => key(x) === k)) ?? null;
  };

  const onTitle = (input: HTMLInputElement) => {
    const a = isArtist ? find(input.value) : null;
    setMatch(a);
    setTyped(input.value);
    const form = input.form;
    if (!a || !form) return;
    const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | null;
    const [name, company, email] = [field("agent_name"), field("agent_company"), field("agent_email")];
    if (name && company && email && !name.value && !company.value && !email.value) {
      name.value = a.agent_name ?? "";
      company.value = a.agent_company ?? "";
      email.value = a.agent_email ?? "";
    }
  };

  return (
    <>
      <div className="row">
        <label>
          {isArtist ? "Artist" : "Event name"}
          <input
            name="title"
            required
            defaultValue={hold?.title ?? ""}
            placeholder={isArtist ? "Start typing an artist" : "e.g. Smith Wedding"}
            list={isArtist ? "artist-names" : undefined}
            autoComplete="off"
            onChange={(e) => onTitle(e.currentTarget)}
            onBlur={(e) => onTitle(e.currentTarget)}
          />
          {isArtist && (
            <span className="muted small field-hint">
              {match
                ? match.name === typed.trim()
                  ? "✓ In Artists"
                  : `✓ Saved as “${match.name}”`
                : typed.trim()
                  ? "New artist: will be added to Artists"
                  : ""}
            </span>
          )}
        </label>
        <label style={{ flex: "0 0 170px" }}>
          Type
          <select name="kind" defaultValue={hold?.kind ?? "show"} onChange={(e) => setKind(e.target.value)}>
            <option value="show">Show</option>
            <option value="rental">Private Rental</option>
            <option value="promoter">Promoter Rental</option>
            <option value="copro">Co-Pro</option>
          </select>
        </label>
      </div>
      {isArtist && (
        <datalist id="artist-names">
          {artists.map((a) => (
            <option key={a.name} value={a.name} />
          ))}
        </datalist>
      )}
      <div className="row">
        <label>
          Agent / contact
          <input name="agent_name" defaultValue={hold?.agent_name ?? ""} />
        </label>
        <label>
          Agency / company
          <input name="agent_company" defaultValue={hold?.agent_company ?? ""} />
        </label>
      </div>
      <label>
        Email
        <input name="agent_email" type="email" defaultValue={hold?.agent_email ?? ""} />
      </label>
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={hold?.notes ?? ""}
          placeholder="Routing, draw estimate, ticket price, rental details…"
        />
      </label>
    </>
  );
}
