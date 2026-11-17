// Read a promoter's / co-promoter's offer (PDF, Word or a photo) with Claude and pull out the deal
// details, so they can fill in our offer form. Needs ANTHROPIC_API_KEY.

export type Extracted = {
  artist?: string;
  support?: string;
  date?: string;
  partner?: { company?: string; contact?: string; phone?: string; email?: string };
  agent?: { name?: string; company?: string; email?: string };
  dealType?: "flat" | "vs" | "door" | "bonus";
  guarantee?: number;
  percent?: number;
  pctBasis?: "gross" | "net";
  capacity?: number;
  tiers?: { name: string; price: number; qty?: number }[];
  taxPct?: number;
  costs?: { label: string; amount: number }[];
  rentalFee?: number;
  doors?: string;
  showTime?: string;
  curfew?: string;
  ages?: string;
  deposit?: string;
  merch?: string;
  radius?: string;
  notes?: string;
};

export const extractReady = () => !!process.env.ANTHROPIC_API_KEY;

const SCHEMA = {
  type: "object",
  properties: {
    artist: { type: "string", description: "Headlining artist / show name" },
    support: { type: "string", description: "Support acts" },
    date: { type: "string", description: "Show date as YYYY-MM-DD" },
    partner: {
      type: "object",
      description: "The promoter or company that sent this offer",
      properties: { company: { type: "string" }, contact: { type: "string" }, phone: { type: "string" }, email: { type: "string" } },
    },
    agent: {
      type: "object",
      description: "The artist's booking agent, if named",
      properties: { name: { type: "string" }, company: { type: "string" }, email: { type: "string" } },
    },
    dealType: {
      type: "string",
      enum: ["flat", "vs", "door", "bonus"],
      description: "flat = flat guarantee; vs = guarantee versus a percentage; door = percentage only; bonus = guarantee plus ticket-count bonuses",
    },
    guarantee: { type: "number", description: "Artist guarantee in dollars" },
    percent: { type: "number", description: "Artist percentage (e.g. 85 for 85%)" },
    pctBasis: { type: "string", enum: ["gross", "net"], description: "Percentage of gross or of net after expenses" },
    capacity: { type: "number", description: "Sellable capacity" },
    tiers: {
      type: "array",
      description: "Ticket price levels",
      items: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, qty: { type: "number" } }, required: ["name", "price"] },
    },
    taxPct: { type: "number", description: "Sales tax / facility fee percent taken off gross, if stated" },
    costs: {
      type: "array",
      description: "Show expenses listed in the offer (production, hospitality, marketing, staffing, rent, etc.)",
      items: { type: "object", properties: { label: { type: "string" }, amount: { type: "number" } }, required: ["label", "amount"] },
    },
    rentalFee: { type: "number", description: "Room rental fee, if this is a venue rental" },
    doors: { type: "string" },
    showTime: { type: "string" },
    curfew: { type: "string" },
    ages: { type: "string" },
    deposit: { type: "string", description: "Deposit terms" },
    merch: { type: "string", description: "Merch terms / split" },
    radius: { type: "string", description: "Radius clause" },
    notes: { type: "string", description: "Any other terms worth keeping, briefly" },
  },
};

export async function extractOffer(file: { bytes: Buffer; type: string; name: string; text?: string }): Promise<Extracted> {
  const content: unknown[] = [];
  if (file.text !== undefined) {
    content.push({ type: "text", text: `The offer document (${file.name}):\n\n${file.text.slice(0, 120000)}` });
  } else if (file.type === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") } });
  } else if (/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
    content.push({ type: "image", source: { type: "base64", media_type: file.type.replace("jpg", "jpeg"), data: file.bytes.toString("base64") } });
  } else {
    throw new Error("That file type can't be read. Use a PDF, a Word file or a photo.");
  }
  content.push({
    type: "text",
    text:
      "This is a live music offer or deal memo from an outside promoter or co-promoter to xBk, a music venue in Des Moines. " +
      "Call the save_offer tool once with the deal details. Leave out anything the document doesn't state; don't guess. " +
      "Money as plain numbers (no $). Times like 7:00 PM.",
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 2000,
      tools: [{ name: "save_offer", description: "Save the deal details found in the offer", input_schema: SCHEMA }],
      // This model doesn't allow forcing a tool, so it's asked to use it (and its reply text is read as a fallback).
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const j = (await res.json()) as { content?: { type: string; input?: Extracted; text?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(j.error?.message ?? `Claude answered ${res.status}`);
  const tool = (j.content ?? []).find((c) => c.type === "tool_use");
  if (tool?.input) return tool.input;
  // No tool call: look for a JSON object in the reply text.
  const text = (j.content ?? []).map((c) => c.text ?? "").join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as Extracted;
    } catch {
      /* fall through */
    }
  }
  throw new Error("Claude didn't return the deal details. Try attaching it again.");
}
