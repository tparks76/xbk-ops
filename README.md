# xBk Ops

Booking calendar for **xBk**, **The Annex** and **Ideal Dress Club (IDC)**.

**Piece 1 (this build):** calendar, holds and hold rules. Email intake (Microsoft 365) is piece 2.

## Hold rules

- New holds go in at **H2**, or the next open rank. Only a booker or owner puts a hold in **H1** (Promote to H1).
- Ranks are per room per date. The three rooms book independently.
- When a hold releases, holds below it move up one rank, but **never into H1** automatically.
- **Challenge:** a lower hold challenges every hold above it, with a deadline (48 hours by default, adjustable). When the deadline passes, the calendar shows **Expired — follow up**. Nobody gets released automatically.
- **Confirm:** locks the date for that room and releases every other hold on it. The page lists who was released so you can tell their agents.
- Rentals follow the same rules and are marked with a purple stripe.
- Owner and booker have the same permissions. Other roles can view only.

## How it's built

| Part | Service | Where it lives |
|---|---|---|
| Database, logins, hold rules | Supabase | `supabase/migrations/0001_booking_calendar.sql` |
| Screens | Next.js on Vercel | `app/`, `components/`, `lib/` |
| Hold-rule tests | Runs locally | `npm run test:db` |

All hold changes go through database functions (`place_hold`, `move_hold`, `challenge`, `confirm_hold`, `release_hold`…). That keeps the rules in one place, and two people can't put two holds at the same rank.

## Setup

### 1. Supabase: create the database

1. Open your `xbk-ops` project in Supabase → **SQL Editor** → **New query**.
2. Paste in all of `supabase/migrations/0001_booking_calendar.sql` and click **Run**.
3. Open `supabase/seed_staff.sql`, change the two emails to your real 365 addresses, paste it into a new query and click **Run**.
   You can add or change people later in **Table Editor → staff**.

### 2. Supabase: sign-in settings

**Authentication → URL Configuration**

- **Site URL:** your Vercel address (for example `https://xbk-ops.vercel.app`).
- **Redirect URLs:** add `https://*.vercel.app/**` and `http://localhost:3000/**`.

Email-link sign-in works with no further setup, which is enough for testing. Microsoft sign-in is step 4.

### 3. Vercel: put the app online

1. In Vercel, click **Add New → Project** and import `tparks76/xbk-ops`.
2. Under **Environment Variables**, add the two values from Supabase → **Project Settings → API Keys** (or the **Connect** button):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Click **Deploy**. Every push to GitHub redeploys automatically.

### 4. Microsoft sign-in (Azure / Entra)

1. Go to entra.microsoft.com → **App registrations** → **New registration**.
   - Name: `xBk Ops`
   - Who can use it: **Accounts in this organizational directory only**
   - Redirect URI (Web): `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
2. From the app's **Overview** page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. Go to **Certificates & secrets** → **New client secret**, and copy the **Value**.
4. Go to **Token configuration** → **Add optional claim** → **ID**, and tick `email` and `xms_edov`.
5. In Supabase, go to **Authentication → Sign In / Providers → Azure**, switch it on, and enter:
   - Client ID
   - Secret
   - Azure Tenant URL: `https://login.microsoftonline.com/<Directory (tenant) ID>`

The client secret expires. Put a reminder on the calendar to renew it.

## Working on it locally (optional)

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev                  # http://localhost:3000
npm run test:db              # checks the hold rules against a test database
```
