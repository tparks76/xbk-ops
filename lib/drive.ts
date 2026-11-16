import { offerPdf } from "@/lib/offer-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hold } from "@/lib/types";

// Show folders in Google Drive. The work in Drive is done by a small Google Apps Script that
// runs as the xBk Google account (see Settings → Google Drive), so no Google Cloud setup is needed.

export const driveReady = () => !!(process.env.DRIVE_SCRIPT_URL && process.env.DRIVE_SCRIPT_SECRET);

// "MM.DD.YY - Artist", the same as the folders already in Master Show Files.
export function showFolderName(dateIso: string, title: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${m}.${d}.${y.slice(2)} - ${title.trim()}`;
}

type ScriptAnswer = { folderUrl?: string; folderId?: string; error?: string; existed?: boolean };

async function callScript(body: Record<string, unknown>): Promise<ScriptAnswer> {
  const res = await fetch(process.env.DRIVE_SCRIPT_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script reads the raw body
    body: JSON.stringify({ secret: process.env.DRIVE_SCRIPT_SECRET, ...body }),
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as ScriptAnswer;
  } catch {
    throw new Error(
      /<html/i.test(text)
        ? "Google answered with a web page instead of the script. Check the script is deployed with access “Anyone”."
        : `Unexpected answer from Google (${res.status})`,
    );
  }
}

// Make (or find) the show's folder and save the offer PDF into it. Safe to run again:
// the folder is reused and the PDF is replaced.
export async function saveShowToDrive(holdId: string): Promise<{ ok: boolean; message: string; url?: string }> {
  const db = createAdminClient();
  const note = async (fields: { drive_folder_url?: string | null; drive_note: string }) =>
    db.from("holds").update(fields).eq("id", holdId);

  if (!driveReady()) return { ok: false, message: "Google Drive isn't connected yet (Settings → Google Drive)." };
  const { data } = await db.from("holds").select("*").eq("id", holdId).maybeSingle();
  const hold = data as Hold | null;
  if (!hold) return { ok: false, message: "Hold not found." };
  if (hold.status !== "confirmed") return { ok: false, message: "Only confirmed shows get a Drive folder." };
  if (hold.kind !== "show" && hold.kind !== "copro") return { ok: false, message: "Only shows and co-pros get a Drive folder." };

  const folderName = showFolderName(hold.date, hold.title);
  const yearFolder = `*${hold.date.slice(0, 4)} SHOWS`;

  // The newest offer for this date, if there is one.
  const { data: offers } = await db
    .from("offers")
    .select("id,updated_at")
    .contains("hold_ids", [hold.id])
    .order("updated_at", { ascending: false })
    .limit(1);
  const offerId = (offers ?? [])[0]?.id as string | undefined;

  let pdfBase64: string | undefined;
  let pdfProblem = "";
  if (offerId) {
    try {
      pdfBase64 = (await offerPdf(offerId)).toString("base64");
    } catch (e) {
      pdfProblem = `the offer PDF couldn't be made (${(e as Error).message})`;
    }
  }

  try {
    const r = await callScript({
      // the folder made before, so it's found even if someone renamed it in Drive
      folderId: hold.drive_folder_url?.match(/folders\/([\w-]+)/)?.[1],
      folderName,
      yearFolder,
      fileName: `Offer - ${hold.title.trim()} - ${folderName.split(" - ")[0]}.pdf`,
      pdfBase64,
    });
    if (r.error || !r.folderUrl) throw new Error(r.error ?? "No folder link came back");
    const msg = offerId
      ? pdfProblem
        ? `Folder ready, but ${pdfProblem}.`
        : `Folder ready with the offer PDF.`
      : "Folder ready. There's no offer for this date, so no PDF was added.";
    await note({ drive_folder_url: r.folderUrl, drive_note: msg });
    return { ok: !pdfProblem, message: msg, url: r.folderUrl };
  } catch (e) {
    const msg = `Drive folder not made: ${(e as Error).message}`;
    await note({ drive_note: msg });
    return { ok: false, message: msg };
  }
}

// The Apps Script to paste into script.google.com (shown on Settings → Google Drive).
export const APPS_SCRIPT = `// xBk Ops → Google Drive show folders.
// Makes "MM.DD.YY - Artist" folders in xBk Master Show Files and saves the offer PDF.
const MASTER_FOLDER_ID = '16-lfyLpUf1g3wu7Z7vyLmlYgUdYIwOVN';
const SECRET = 'PASTE-THE-SAME-SECRET-AS-IN-VERCEL';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return reply({ error: 'Wrong secret' });
    const master = DriveApp.getFolderById(MASTER_FOLDER_ID);

    // Next year's shows go in "*2027 SHOWS" (etc.) when that folder exists.
    let parent = master;
    if (req.yearFolder) {
      const years = master.getFoldersByName(req.yearFolder);
      if (years.hasNext()) parent = years.next();
    }

    // Reuse the show's folder: the one made before (even if renamed), or one with the same name.
    let folder = null;
    if (req.folderId) {
      try {
        const f = DriveApp.getFolderById(req.folderId);
        if (!f.isTrashed()) folder = f;
      } catch (err) {}
    }
    let existed = !!folder;
    if (!folder) {
      const found = parent.getFoldersByName(req.folderName);
      existed = found.hasNext();
      folder = existed ? found.next() : parent.createFolder(req.folderName);
    }

    if (req.pdfBase64 && req.fileName) {
      const old = folder.getFilesByName(req.fileName);
      while (old.hasNext()) {
        try { old.next().setTrashed(true); } catch (err) {}
      }
      const bytes = Utilities.base64Decode(req.pdfBase64);
      folder.createFile(Utilities.newBlob(bytes, 'application/pdf', req.fileName));
    }
    return reply({ folderId: folder.getId(), folderUrl: folder.getUrl(), existed: existed });
  } catch (err) {
    return reply({ error: String(err && err.message || err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;
