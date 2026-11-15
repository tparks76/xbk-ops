import { createClient } from "@/lib/supabase/server";

export type ArtistChoice = {
  id: string;
  name: string;
  aliases: string[];
  genres: string[];
  image_url: string | null;
  deezer_id: string | null;
  agent_name: string | null;
  agent_company: string | null;
  agent_email: string | null;
};

// Artists for the hold form's artist menu (and their default agent).
export async function artistChoices(): Promise<ArtistChoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artists")
    .select("id,name,aliases,genres,image_url,deezer_id,agent_name,agent_company,agent_email")
    .order("name")
    .limit(3000);
  return (data ?? []) as ArtistChoice[];
}
