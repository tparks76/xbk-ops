import { NextResponse, type NextRequest } from "next/server";
import { syncEvents } from "@/lib/sync-events";

// Called daily by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const result = await syncEvents();
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
