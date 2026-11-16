import { NextResponse, type NextRequest } from "next/server";
import { importEventimSales } from "@/lib/track-data";

// Called daily by Vercel Cron (see vercel.json): imports Eventim sales for linked shows.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  try {
    return NextResponse.json(await importEventimSales());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
