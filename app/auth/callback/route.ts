import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Microsoft sign-in and email links both land here with a one-time code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let reason = searchParams.get("error_description") || searchParams.get("error") || "";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    reason = error.message;
  }
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason || "Sign-in link was missing its code.");
  return NextResponse.redirect(url);
}
