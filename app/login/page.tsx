"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const callback = () => `${window.location.origin}/auth/callback`;

  async function microsoft() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "email", redirectTo: callback() },
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callback() },
    });
    setBusy(false);
    setMsg(error ? error.message : "Check your email for a sign-in link.");
  }

  return (
    <div className="login">
      <h1>xBk Ops</h1>
      <button className="ms" onClick={microsoft} disabled={busy}>
        Sign in with Microsoft
      </button>
      <div className="divider">or get a sign-in link by email</div>
      <form onSubmit={emailLink} style={{ display: "grid", gap: 8 }}>
        <input
          type="email"
          required
          placeholder="you@xbklive.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button disabled={busy}>Email me a link</button>
      </form>
      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
