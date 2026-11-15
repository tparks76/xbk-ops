import { NextResponse, type NextRequest } from "next/server";
import { runArtistLookups } from "@/lib/artist-data";

// Called daily by Vercel Cron (see vercel.json): looks up photos, genres and links for new artists.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  return NextResponse.json(await runArtistLookups({ limit: 15 }));
}
