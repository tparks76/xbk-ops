import { NextResponse, type NextRequest } from "next/server";
import { extractOffer, extractReady } from "@/lib/offer-extract";
import { getStaff } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Step 2: read the uploaded offer and pull out its deal details.
export async function POST(request: NextRequest) {
  const staff = await getStaff();
  if (!staff?.canBook) return NextResponse.json({ error: "Only a booker or owner can do that." }, { status: 403 });
  const { path, name, type } = (await request.json()) as { path: string; name: string; type: string };
  if (!path?.startsWith("offers/")) return NextResponse.json({ error: "Bad file." }, { status: 400 });
  if (!extractReady()) {
    return NextResponse.json({ extracted: null, note: "Attached. Reading offers needs an Anthropic API key (Settings → Offer reading)." });
  }
  const { data, error } = await createAdminClient().storage.from("offer-files").download(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't open the file." }, { status: 500 });
  const bytes = Buffer.from(await data.arrayBuffer());
  try {
    let text: string | undefined;
    if (/\.docx$/i.test(name) || type.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else if (/\.(txt|eml|html?)$/i.test(name) || type.startsWith("text/")) {
      text = bytes.toString("utf8");
    }
    const extracted = await extractOffer({ bytes, type: type || (/\.pdf$/i.test(name) ? "application/pdf" : ""), name, text });
    return NextResponse.json({ extracted });
  } catch (e) {
    return NextResponse.json({ extracted: null, note: `Attached, but it couldn't be read: ${(e as Error).message}` });
  }
}
