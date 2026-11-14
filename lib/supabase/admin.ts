import { createClient } from "@supabase/supabase-js";

// Server-only client with full database access, for background jobs
// (the daily event sync). Never import this into a page users can reach
// without a check, and never into browser code.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set in Vercel.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
