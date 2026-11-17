import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Open an attached file (a short-lived private link).
export async function GET(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return NextResponse.redirect(new URL("/login", request.url));
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!path.startsWith("offers/")) return NextResponse.json({ error: "Bad file." }, { status: 400 });
  const { data, error } = await createAdminClient().storage.from("offer-files").createSignedUrl(path, 300);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
