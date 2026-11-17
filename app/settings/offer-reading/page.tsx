import { extractReady } from "@/lib/offer-extract";
import { requireStaff } from "@/lib/session";

// Reading attached promoter / co-promoter offers to fill in our offer form.
export default async function OfferReadingSettingsPage() {
  await requireStaff();
  const ready = extractReady();
  return (
    <>
      <div className="day-head">
        <h1>Offer reading</h1>
        <span className={`badge ${ready ? "confirmed" : ""}`}>{ready ? "Connected" : "Not connected"}</span>
      </div>
      <div className="panel">
        <p>
          On promoter rental and co-pro forms you can attach the partner’s offer (PDF, Word or a photo). Claude reads it and
          offers to fill in our form: artist, deal, tickets, capacity, expenses, times and the partner’s contact details.
          Files are kept privately with the offer either way; reading them needs an Anthropic API key.
        </p>
        <p className="muted small">
          Each offer read costs a few cents on your Anthropic account. Nothing is read unless you attach a file.
        </p>
      </div>
      {!ready && (
        <div className="panel">
          <h2>Connect (about 5 minutes)</h2>
          <ol className="setup-steps">
            <li>
              Go to{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              , sign in or create an account, and add a payment method under <strong>Billing</strong> (a small prepaid credit
              is plenty).
            </li>
            <li>
              Under <strong>API Keys</strong>, click <strong>Create Key</strong>, name it “xBk Ops”, and copy it (it’s only
              shown once).
            </li>
            <li>
              In Vercel → your project → <strong>Settings → Environment Variables</strong>, add <code>ANTHROPIC_API_KEY</code>{" "}
              with that key. Then ask Claude to redeploy.
            </li>
          </ol>
        </div>
      )}
    </>
  );
}
