import { createClient } from "@/lib/supabase/server";

export type ArtistChoice = {
  name: string;
  aliases: string[];
  agent_name: string | null;
  agent_company: string | null;
  agent_email: string | null;
};

// Artist names for the hold form's suggestions (and their default agent).
export async function artistChoices(): Promise<ArtistChoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artists")
    .select("name,aliases,agent_name,agent_company,agent_email")
    .order("name")
    .limit(3000);
  return (data ?? []) as ArtistChoice[];
}
