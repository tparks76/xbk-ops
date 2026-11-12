import { signOut } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export default async function NotStaffPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  return (
    <div className="login">
      <h1>Not set up yet</h1>
      <p>
        You’re signed in as <strong>{email ?? "unknown"}</strong>, but that address isn’t on the staff list.
        Ask Tobi to add it.
      </p>
      <form action={signOut}>
        <button>Sign out</button>
      </form>
    </div>
  );
}
