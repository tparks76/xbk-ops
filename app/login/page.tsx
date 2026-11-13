"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function explain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("code verifier") || m.includes("pkce") || m.includes("both auth code"))
    return "That link was opened in a different browser than the one you requested it from. Use the 6-digit code from the email instead.";
  if (m.includes("expired") || m.includes("invalid"))
    return "That link already expired or was used (Outlook's link scanner sometimes uses it up). Use the 6-digit code from the email instead.";
  if (m.includes("rate limit"))
    return "Too many sign-in emails in a short time. Wait a few minutes, or use the code from an email you already have.";
  return message;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const callback = () => `${window.location.origin}/auth/callback`;

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setMsg(explain(err));
  }, []);

  async function microsoft() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "email", redirectTo: callback() },
    });
    if (error) {
      setMsg(explain(error.message));
      setBusy(false);
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callback() },
    });
    setBusy(false);
    if (error) {
      setMsg(explain(error.message));
    } else {
      setSent(true);
      setMsg("Check your email. Enter the 6-digit code below, or click the link in the same browser.");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setMsg(explain(error.message));
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="login">
      <h1>xBk Ops</h1>
      <button className="ms" onClick={microsoft} disabled={busy}>
        Sign in with Microsoft
      </button>
      <div className="divider">or sign in by email</div>
      <form onSubmit={sendEmail} style={{ display: "grid", gap: 8 }}>
        <input
          type="email"
          required
          placeholder="you@xbklive.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button disabled={busy}>{sent ? "Send again" : "Email me a code"}</button>
      </form>
      {sent && (
        <form onSubmit={verifyCode} style={{ display: "grid", gap: 8 }}>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            Sign in
          </button>
        </form>
      )}
      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
