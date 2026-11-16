import { NextResponse, type NextRequest } from "next/server";
import { importDailyStatsEmail } from "@/lib/ticket-email-data";

// Eventim's "Daily Event Stats" email, passed along by the xBk Ops Google Apps Script
// (it checks the Gmail inbox the report is sent to). Uses the same secret as the Drive script.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { secret?: string; html?: string; text?: string; messageId?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const secret = process.env.DRIVE_SCRIPT_SECRET;
  if (!secret || body.secret !== secret) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  try {
    return NextResponse.json(await importDailyStatsEmail(body));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
