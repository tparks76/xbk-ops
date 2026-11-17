import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 1 of attaching a file to an offer: a one-time link the browser uploads straight to storage with.
export async function POST(request: NextRequest) {
  const staff = await getStaff();
  if (!staff?.canBook) return NextResponse.json({ error: "Only a booker or owner can attach files." }, { status: 403 });
  const { name } = (await request.json()) as { name?: string };
  const safe = (name ?? "file").replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `offers/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}`;
  const { data, error } = await createAdminClient().storage.from("offer-files").createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json(
      { error: /bucket/i.test(error.message) ? "File storage isn't set up yet. Run 0019_offer_files.sql in Supabase." : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ path, token: data.token });
}
