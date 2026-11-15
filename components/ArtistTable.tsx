"use client";

import Link from "next/link";
import { useState } from "react";
import ArtistLinks from "@/components/ArtistLinks";
import ArtistPhoto from "@/components/ArtistPhoto";
import { deleteArtists } from "@/lib/actions";

type Row = {
  id: string;
  name: string;
  aliases: string[];
  genres: string[];
  image_url: string | null;
  links: Record<string, string>;
  count: number; // holds on the calendar
};

// Artist list with checkboxes: tick some (or Select all) and delete them together.
export default function ArtistTable({ rows, canBook, returnTo }: { rows: Row[]; canBook: boolean; returnTo: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const all = rows.length > 0 && picked.size === rows.length;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = rows.filter((r) => picked.has(r.id));
  const holds = chosen.reduce((s, r) => s + r.count, 0);

  return (
    <>
      {canBook && (
        <div className="bulk-bar">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = picked.size > 0 && !all;
              }}
              onChange={() => (setPicked(all ? new Set() : new Set(rows.map((r) => r.id))), setConfirming(false))}
            />{" "}
            Select all{rows.length ? ` (${rows.length})` : ""}
          </label>
          {picked.size > 0 && !confirming && (
            <>
              <span className="muted small">{picked.size} selected</span>
              <button type="button" className="danger" onClick={() => setConfirming(true)}>
                Delete selected
              </button>
              <button type="button" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </>
          )}
          {picked.size > 0 && confirming && (
            <form action={deleteArtists} className="bulk-confirm">
              <input type="hidden" name="returnTo" value={returnTo} />
              {chosen.map((r) => (
                <input key={r.id} type="hidden" name="id" value={r.id} />
              ))}
              <span className="small">
                Delete {picked.size} artist{picked.size > 1 ? "s" : ""}?
                {holds > 0 && ` Their ${holds} hold${holds > 1 ? "s" : ""} stay on the calendar, unlinked.`}
              </span>
              <label className="inline-check small">
                <input type="checkbox" name="ignore" value="1" /> Don’t add these names as artists again
              </label>
              <button className="danger">Yes, delete {picked.size}</button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
      <table className="list artists">
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={picked.has(a.id) ? "picked" : ""}>
              {canBook && (
                <td style={{ width: 28 }}>
                  <input type="checkbox" aria-label={`Select ${a.name}`} checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                </td>
              )}
              <td style={{ width: 48 }}>
                <Link href={`/artists/${a.id}`}>
                  <ArtistPhoto name={a.name} url={a.image_url} size={40} />
                </Link>
              </td>
              <td>
                <Link href={`/artists/${a.id}`}>
                  <strong>{a.name}</strong>
                </Link>
                {a.aliases.length > 0 && <div className="muted small">also: {a.aliases.join(", ")}</div>}
              </td>
              <td className="small">{a.genres.join(", ") || <span className="muted">—</span>}</td>
              <td>
                <ArtistLinks links={a.links} small />
              </td>
              <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                {a.count} on the calendar
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
