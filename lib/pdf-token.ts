import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed links so the server can open a page (to make a PDF of it) without a login.
const secret = () => process.env.CRON_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "";

export function signPdfToken(id: string, minutes = 5): string {
  const exp = Date.now() + minutes * 60_000;
  const mac = createHmac("sha256", secret()).update(`${id}.${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}

export function checkPdfToken(id: string, token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !mac) return false;
  const want = createHmac("sha256", secret()).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
