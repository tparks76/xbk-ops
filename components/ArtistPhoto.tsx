/* eslint-disable @next/next/no-img-element */
// Artist photo, or their initials when there isn't one.
export default function ArtistPhoto({ name, url, size = 56 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return url ? (
    <img src={url} alt={name} width={size} height={size} className="artist-photo" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="artist-photo blank" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden>
      {initials}
    </span>
  );
}
