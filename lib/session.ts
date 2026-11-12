import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Staff } from "@/lib/types";

export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  if (!email) return null;
  const { data: row } = await supabase
    .from("staff")
    .select("email,name,role,active")
    .eq("email", email)
    .maybeSingle();
  if (!row || !row.active) return null;
  return {
    email: row.email,
    name: row.name,
    role: row.role,
    canBook: row.role === "owner" || row.role === "booker",
  };
}

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/not-staff");
  return staff;
}
