import { genresFromAlbums, pickWikidata, wikidataLinks, pickSpotify, pickSocial, nameKey, pickDeezer, pickMusicBrainz, genresFrom, linksFrom, linkKind, deezerIdFrom, mbidFrom } from "../lib/artist-lookup.ts";
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
const wd = [
  { id: "Q1", labels: { en: { value: "Wednesday" } }, claims: {} },
  { id: "Q2", labels: { en: { value: "Wednesday" } }, claims: { P1902: [{ mainsnak: { datavalue: { value: "sp1" } } }], P2003: [{ mainsnak: { datavalue: { value: "wednesdayband" } } }], P2013: [{ mainsnak: { datavalue: { value: "wednesdaymusic" } } }] } },
];
const w = pickWikidata("wednesday", wd);
ok(w?.id === "Q2", "Wikidata: same name and a music artist");
const wl = wikidataLinks(w!);
ok(wl.spotify === "https://open.spotify.com/artist/sp1" && wl.instagram === "https://www.instagram.com/wednesdayband/" && wl.facebook === "https://www.facebook.com/wednesdaymusic", "Wikidata links");
ok(pickWikidata("wednesday", [{ id: "Q9", labels: {}, claims: { P434: [{ mainsnak: { datavalue: { value: "mb-1" } } }] } }], "mb-1")?.id === "Q9", "Wikidata by MusicBrainz ID");
const sp = pickSpotify("Lily DeTaeye", [{ name: "Lily" }, { name: "Lily DeTaeye", external_urls: { spotify: "https://open.spotify.com/artist/a" } }]);
ok(sp?.artist.external_urls?.spotify?.endsWith("/a") === true && sp.shared === false, "Spotify exact name");
const soc = pickSocial("Lily DeTaeye", [
  { url: "https://www.instagram.com/p/abc123/", title: "Lily DeTaeye on Instagram" },
  { url: "https://www.instagram.com/lilydetaeye/", title: "Lily DeTaeye (@lilydetaeye) • Instagram photos" },
  { url: "https://www.facebook.com/someoneelse", title: "Some Other Band" },
  { url: "https://www.facebook.com/LilyDeTaeyeMusic/", title: "Lily DeTaeye Music | Des Moines IA" },
  { url: "https://www.tiktok.com/@lilyd/video/1", title: "Lily DeTaeye video" },
]);
ok(soc.instagram === "https://www.instagram.com/lilydetaeye/" && soc.facebook === "https://www.facebook.com/LilyDeTaeyeMusic/" && !soc.tiktok, "web search: profiles only, right artist: " + JSON.stringify(soc));
const names = new Map([[85, "Alternative"], [152, "Rock"], [98, "Folk"]]);
ok(genresFromAlbums([{ genre_id: 98 }, { genre_id: 98 }, { genre_id: 85 }, { genre_id: -1 }, { genre_id: 0 }], names).join() === "Folk,Alternative", "Deezer: most common album genres");
ok(genresFromAlbums([{ genre_id: -1 }], names).length === 0, "Deezer: untagged albums give nothing");
console.log(`${pass} passed, ${fail} failed`);
