"use client";

import { useState } from "react";
import ArtistPicker, { type Picked } from "@/components/ArtistPicker";
import type { ArtistChoice } from "@/lib/artist-choices";
import type { Hold } from "@/lib/types";

// Artist/event, type, agent and notes fields shared by the new-hold and edit forms.
// For shows and co-pros the artist box lists your Artists and Deezer's artists, so you can
// pick the exact one; picking someone from Artists also fills in their usual agent.
export default function HoldFields({ hold, artists = [] }: { hold?: Partial<Hold>; artists?: ArtistChoice[] }) {
  const [kind, setKind] = useState<string>(hold?.kind ?? "show");
  const [title, setTitle] = useState(hold?.title ?? "");
  const [picked, setPicked] = useState<Picked | null>(null);
  const isArtist = kind === "show" || kind === "copro";
  const current = hold?.artist_id ? (artists.find((a) => a.id === hold.artist_id) ?? null) : null;

  const fillAgent = (form: HTMLFormElement | null, a?: ArtistChoice) => {
    if (!form || !a) return;
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
          {isArtist ? (
              <ArtistPicker
                artists={artists}
                defaultValue={title}
                current={current}
                onText={setTitle}
                onPick={(p) => {
                  setPicked(p);
                  if (p?.kind === "artist") fillAgent(document.activeElement?.closest("form") ?? null, p.agent);
                  if (p?.kind === "deezer" && p.artistId)
                    fillAgent(document.activeElement?.closest("form") ?? null, artists.find((a) => a.id === p.artistId));
                }}
              />
          ) : (
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Smith Wedding" />
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
      {/* The exact artist picked from the menu (empty = match by name) */}
      <input type="hidden" name="artist_id" value={isArtist && picked?.kind === "artist" ? picked.id : isArtist && picked?.kind === "deezer" ? (picked.artistId ?? "") : ""} />
      <input type="hidden" name="deezer_id" value={isArtist && picked?.kind === "deezer" ? picked.id : ""} />
      <input type="hidden" name="deezer_name" value={isArtist && picked?.kind === "deezer" ? picked.name : ""} />
      <input type="hidden" name="deezer_image" value={isArtist && picked?.kind === "deezer" ? (picked.image ?? "") : ""} />
      <input type="hidden" name="new_artist" value={isArtist && picked?.kind === "new" ? "1" : ""} />
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
