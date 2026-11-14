import { createClient } from "@/lib/supabase/server";

// Staff who can be named as the xBk contact on a rental contract. Bookers first.
export async function contactStaff(): Promise<{ name: string; email: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("name,email,role").eq("active", true).order("name");
  const rows = (data ?? []) as { name: string; email: string; role: string }[];
  const rank = (r: string) => (r === "booker" ? 0 : r === "owner" ? 1 : 2);
  return rows.sort((a, b) => rank(a.role) - rank(b.role)).map(({ name, email }) => ({ name, email }));
}
