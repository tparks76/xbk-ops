import { nameKey, pickDeezer, pickMusicBrainz, genresFrom, linksFrom, linkKind, deezerIdFrom, mbidFrom } from "../lib/artist-lookup.ts";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? pass++ : (fail++, console.log("FAIL:", m)));
ok(nameKey("The  Beatles") === "beatles" && nameKey("Beyoncé") === "beyonce" && nameKey("Mumford & Sons") === "mumford and sons", "nameKey");
ok(pickDeezer("wednesday", [{ id: 1, name: "Wednesday Night", nb_fan: 9 }, { id: 2, name: "Wednesday", nb_fan: 50 }, { id: 3, name: "WEDNESDAY", nb_fan: 5 }])?.id === 2, "Deezer: exact name, most fans");
ok(pickDeezer("Nobody Here", [{ id: 1, name: "Somebody" }]) === null, "Deezer: no exact match → nothing");
ok(pickMusicBrainz("Lily DeTaeye", [{ id: "a", name: "Lily", score: 100 }, { id: "b", name: "Lily DeTaeye", score: 90 }])?.id === "b", "MB: exact name");
ok(JSON.stringify(genresFrom({ genres: [{ name: "indie folk", count: 2 }, { name: "folk", count: 5 }] })) === '["Folk","Indie Folk"]', "genres by count");
ok(genresFrom({ genres: [], tags: [{ name: "singer-songwriter", count: 1 }, { name: "junk", count: 0 }] }).join() === "Singer-Songwriter", "tags fallback");
const l = linksFrom({ relations: [
  { type: "free streaming", url: { resource: "https://open.spotify.com/artist/abc" } },
  { type: "social network", url: { resource: "https://www.instagram.com/lilydetaeye/" } },
  { type: "social network", url: { resource: "https://www.facebook.com/lilydetaeye" } },
  { type: "official homepage", url: { resource: "https://lilydetaeye.com" } },
  { type: "youtube", url: { resource: "https://www.youtube.com/@lily" } },
] });
ok(l.spotify === "https://open.spotify.com/artist/abc" && l.instagram?.includes("instagram") && l.facebook?.includes("facebook") && l.website === "https://lilydetaeye.com" && !!l.youtube, "links sorted by kind: " + JSON.stringify(l));
ok(linkKind("https://m.facebook.com/x") === "facebook" && linkKind("https://artist.bandcamp.com") === "bandcamp" && linkKind("nope") === null, "linkKind");
ok(deezerIdFrom("https://www.deezer.com/us/artist/123456") === "123456" && mbidFrom("https://musicbrainz.org/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da") === "5b11f4ce-a62d-471e-81fc-a69a8278c7da", "IDs from links");
console.log(`${pass} passed, ${fail} failed`);
