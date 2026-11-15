import { LINK_KINDS, LINK_LABEL } from "@/lib/artist-lookup";

// "Spotify · Instagram · Facebook …" buttons that open the artist's pages in a new tab.
export default function ArtistLinks({ links, small }: { links: Record<string, string>; small?: boolean }) {
  const kinds = LINK_KINDS.filter((k) => links?.[k]);
  if (!kinds.length) return null;
  return (
    <span className={`artist-links${small ? " small" : ""}`}>
      {kinds.map((k) => (
        <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer" className={`link-${k}`}>
          {LINK_LABEL[k]}
        </a>
      ))}
    </span>
  );
}
