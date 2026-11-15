import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/session";

// Artist search for the hold form's artist menu (Deezer; free, no key).
export async function GET(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=8`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    const j = (await res.json()) as {
      data?: { id: number; name: string; picture_medium?: string; nb_fan?: number; nb_album?: number }[];
    };
    const results = (j.data ?? []).map((a) => ({
      id: String(a.id),
      name: a.name,
      image: a.picture_medium && !/\/artist\/\//.test(a.picture_medium) ? a.picture_medium : null,
      fans: a.nb_fan ?? 0,
      albums: a.nb_album ?? 0,
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Deezer didn't answer. You can still type the name." });
  }
}
