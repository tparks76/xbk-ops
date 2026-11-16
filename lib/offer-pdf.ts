import { signPdfToken } from "@/lib/pdf-token";

// The site's own address, for opening the offer page to print it.
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// The browser is unpacked into /tmp the first time; share that work between PDFs in the same server.
let chromePath: Promise<string> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Print the offer sheet to a PDF with a headless Chrome, exactly like "Save as PDF".
export async function offerPdf(offerId: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  let executablePath: string;
  let args: string[];
  if (process.env.LOCAL_CHROME_PATH) {
    executablePath = process.env.LOCAL_CHROME_PATH; // for testing on a laptop
    args = ["--no-sandbox"];
  } else {
    const chromium = (await import("@sparticuz/chromium")).default;
    chromePath ??= chromium.executablePath();
    executablePath = await chromePath;
    args = await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" });
  }

  // Right after unpacking, the file can still be busy ("spawn ETXTBSY"): wait a moment and try again.
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  for (let attempt = 1; !browser; attempt++) {
    try {
      browser = await puppeteer.launch({ executablePath, args, headless: "shell" });
    } catch (e) {
      if (attempt >= 5 || !/ETXTBSY|EBUSY/.test(String((e as Error).message))) throw e;
      await sleep(400 * attempt);
    }
  }

  try {
    const page = await browser.newPage();
    const url = `${siteUrl()}/pdf/offer/${offerId}?t=${encodeURIComponent(signPdfToken(offerId))}`;
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    if (!res || !res.ok()) throw new Error(`Couldn't open the offer sheet (${res?.status() ?? "no answer"})`);
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
