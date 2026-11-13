"use client";

import { useState } from "react";

// Copies text to the clipboard (for pasting into an email).
export default function CopyButton({ text, label = "Copy for email" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!text) return null;
  return (
    <button type="button" onClick={copy} title={text}>
      {copied ? "Copied ✓" : label}
    </button>
  );
}
