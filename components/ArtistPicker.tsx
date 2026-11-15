"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { ArtistChoice } from "@/lib/artist-choices";

type DzResult = { id: string; name: string; image: string | null; fans: number; albums: number };
export type Picked =
  | { kind: "artist"; id: string; name: string; image: string | null; note: string; agent?: ArtistChoice }
  | { kind: "deezer"; id: string; name: string; image: string | null; note: string; artistId?: string }
  | { kind: "new"; id: ""; name: string; image: null; note: string };

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const fmtFans = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M fans` : n >= 1e3 ? `${Math.round(n / 1e3)}K fans` : `${n} fans`;

// Artist box for show and co-pro holds. As you type it lists matching artists already in
// Artists and Deezer's artists with that name (photo, fans, albums) so you can pick the right
// one when two share a name. Typing a name and not picking still works: it's matched by name.
export default function ArtistPicker({
  artists,
  defaultValue,
  current,
  onPick,
  onText,
}: {
  artists: ArtistChoice[];
  defaultValue: string;
  current?: ArtistChoice | null; // the artist the hold is linked to now (edit form)
  onPick: (p: Picked | null) => void;
  onText?: (v: string) => void;
}) {
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [dz, setDz] = useState<DzResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dzError, setDzError] = useState("");
  const [picked, setPicked] = useState<Picked | null>(
    current ? { kind: "artist", id: current.id, name: current.name, image: current.image_url, note: current.genres.join(", ") } : null,
  );
  const box = useRef<HTMLDivElement>(null);

  // Search Deezer as you type (after a short pause).
  useEffect(() => {
    if (!open || text.trim().length < 2) {
      setDz([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/deezer-search?q=${encodeURIComponent(text.trim())}`);
        const j = (await r.json()) as { results?: DzResult[]; error?: string };
        setDz(j.results ?? []);
        setDzError(j.error ?? "");
      } catch {
        setDzError("Deezer didn't answer. You can still type the name.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text, open]);

  // Close the menu when clicking elsewhere.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const k = key(text);
  const mine = k
    ? artists
        .filter((a) => key(a.name).includes(k) || a.aliases.some((x) => key(x).includes(k)))
        .sort((a, b) => Number(key(b.name) === k) - Number(key(a.name) === k))
        .slice(0, 6)
    : [];
  const byDeezer = new Map(artists.filter((a) => a.deezer_id).map((a) => [a.deezer_id!, a]));
  const dzShown = dz.filter((d) => !mine.some((m) => m.deezer_id === d.id));

  const choose = (p: Picked) => {
    setPicked(p);
    setText(p.name);
    onText?.(p.name);
    setOpen(false);
    onPick(p);
  };

  return (
    <div className="artist-picker" ref={box}>
      <input
        name="title"
        required
        value={text}
        placeholder="Start typing an artist"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          onText?.(e.target.value);
          setOpen(true);
          if (picked) {
            setPicked(null);
            onPick(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {picked ? (
        <div className="picked-artist">
          {picked.image ? <img src={picked.image} alt="" /> : <span className="dot" />}
          <span>
            <strong>{picked.name}</strong>
            {picked.note && <span className="muted"> · {picked.note}</span>}
          </span>
          <button
            type="button"
            className="small"
            onClick={() => {
              setPicked(null);
              onPick(null);
              setOpen(true);
            }}
          >
            Change
          </button>
        </div>
      ) : (
        text.trim() && (
          <div className="muted small field-hint">Pick from the list to choose the exact artist, or keep typing a new name.</div>
        )
      )}

      {open && k.length >= 2 && (
        <div className="picker-menu" role="listbox">
          {mine.length > 0 && <div className="picker-head">In your Artists</div>}
          {mine.map((a) => (
            <button
              type="button"
              key={a.id}
              className="picker-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                choose({ kind: "artist", id: a.id, name: a.name, image: a.image_url, note: a.genres.join(", "), agent: a })
              }
            >
              {a.image_url ? <img src={a.image_url} alt="" /> : <span className="dot" />}
              <span>
                <strong>{a.name}</strong>
                <span className="muted small">
                  {[a.genres.join(", "), a.deezer_id ? "on Deezer" : ""].filter(Boolean).join(" · ") || "in Artists"}
                </span>
              </span>
            </button>
          ))}
          <div className="picker-head">From Deezer {loading && <span className="muted">searching…</span>}</div>
          {dzError && <div className="muted small picker-note">{dzError}</div>}
          {!loading && !dzError && dzShown.length === 0 && <div className="muted small picker-note">No other artists found.</div>}
          {dzShown.map((d) => {
            const known = byDeezer.get(d.id);
            return (
              <button
                type="button"
                key={d.id}
                className="picker-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  choose({
                    kind: "deezer",
                    id: d.id,
                    name: known?.name ?? d.name,
                    image: d.image,
                    note: `${fmtFans(d.fans)} · ${d.albums} release${d.albums === 1 ? "" : "s"}`,
                    artistId: known?.id,
                  })
                }
              >
                {d.image ? <img src={d.image} alt="" /> : <span className="dot" />}
                <span>
                  <strong>{d.name}</strong>
                  <span className="muted small">
                    {fmtFans(d.fans)} · {d.albums} release{d.albums === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            );
          })}
          {(
            <button
              type="button"
              className="picker-row picker-new"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                choose({ kind: "new", id: "", name: text.trim().replace(/\s+/g, " "), image: null, note: "new artist, not on Deezer" })
              }
            >
              <span className="dot plus">+</span>
              <span>
                <strong>
                  {mine.some((a) => key(a.name) === k)
                    ? `Add another artist named “${text.trim()}”`
                    : `Add “${text.trim()}” as a new artist`}
                </strong>
                <span className="muted small">Not on Deezer: no Deezer photo will be used</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
