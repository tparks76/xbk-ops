"use client";

import { useEffect, useState } from "react";

function remaining(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { expired: true, text: "Expired — follow up" };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const text = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${m}m left`;
  return { expired: false, text };
}

export default function Countdown({ deadline }: { deadline: string }) {
  const [state, setState] = useState(() => remaining(deadline));
  useEffect(() => {
    const t = setInterval(() => setState(remaining(deadline)), 30_000);
    return () => clearInterval(t);
  }, [deadline]);
  return (
    <span className={state.expired ? "countdown expired" : "countdown"} suppressHydrationWarning>
      {state.text}
    </span>
  );
}
