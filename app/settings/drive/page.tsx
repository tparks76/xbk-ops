import CopyButton from "@/components/CopyButton";
import { appsScript, driveReady } from "@/lib/drive";
import { siteUrl } from "@/lib/offer-pdf";
import { requireStaff } from "@/lib/session";

// Google Drive show folders: status and one-time setup.
export default async function DriveSettingsPage() {
  await requireStaff();
  const ready = driveReady();
  return (
    <>
      <div className="day-head">
        <h1>Google Drive</h1>
        <span className={`badge ${ready ? "confirmed" : ""}`}>{ready ? "Connected" : "Not connected"}</span>
      </div>
      <div className="panel">
        <p>
          When a show or co-pro is confirmed, a folder named <strong>MM.DD.YY - Artist</strong> (for example{" "}
          <em>12.04.26 - Jeni Grouws</em>) is made in{" "}
          <a href="https://drive.google.com/drive/folders/16-lfyLpUf1g3wu7Z7vyLmlYgUdYIwOVN" target="_blank" rel="noreferrer">
            XBK Master Show Files
          </a>{" "}
          and the offer PDF is saved in it. Next year’s shows go into the <strong>*2027 SHOWS</strong> folder (and so on) when
          that folder exists. If the folder is already there, it’s reused. The confirmed hold shows a link to the folder,
          and a button to make it or save the latest offer again.
        </p>
      </div>
      {!ready && (
        <div className="panel">
          <h2>One-time setup (about 10 minutes)</h2>
          <ol className="setup-steps">
            <li>
              Make up a long password to use as the <strong>secret</strong> (letters and numbers, 30+ characters). You’ll paste
              it in two places.
            </li>
            <li>
              Signed in to the Google account that should own the show folders, go to{" "}
              <a href="https://script.google.com" target="_blank" rel="noreferrer">
                script.google.com
              </a>{" "}
              → <strong>New project</strong>. Name it “xBk Ops Drive”.
            </li>
            <li>
              Delete what’s in the editor, paste the script below, and replace <code>PASTE-THE-SAME-SECRET-AS-IN-VERCEL</code>{" "}
              with your secret. Click <strong>Save</strong>.
            </li>
            <li>
              Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>. Set{" "}
              <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>. Click <strong>Deploy</strong>, then{" "}
              <strong>Authorize access</strong> and allow it (if Google warns the app isn’t verified, click{" "}
              <em>Advanced → Go to xBk Ops Drive</em>; it’s your own script).
            </li>
            <li>
              Copy the <strong>Web app URL</strong> (it ends in <code>/exec</code>).
            </li>
            <li>
              In Vercel → your project → <strong>Settings → Environment Variables</strong>, add{" "}
              <code>DRIVE_SCRIPT_URL</code> = the web app URL and <code>DRIVE_SCRIPT_SECRET</code> = your secret. Then ask
              Claude to redeploy.
            </li>
          </ol>
        </div>
      )}
      <div className="panel">
        <div className="day-head" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>The script</h2>
          <CopyButton text={appsScript(siteUrl())} />
        </div>
        <pre className="code-block">{appsScript(siteUrl())}</pre>
      </div>
    </>
  );
}
