# Sorts

Sorts is review-first AI outreach. One send flow: upload a contacts file, upload the mail body, add the sender details and a CC list, let the AI (OpenRouter) lightly adjust each email to its row, review every email, then send one separate email per contact through your own Gmail account, with the CC list copied on every email.

**Nothing is ever sent automatically.** Generation only produces drafts. Sending requires approving the emails and typing `APPROVE & SEND ALL` (plus the exact email count for campaigns with more than 25 emails).

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, PostgreSQL, Prisma 7.

---

## 1. Workflow

Start at **Campaigns → New campaign** (`/campaigns/new`). Each campaign walks through seven steps (`/campaigns/[id]/bulk/<step>`):

1. **Contacts** (`contacts`): upload an Excel (`.xlsx`), CSV or PDF file. Columns are detected automatically and can be re-mapped. Before anything is saved, a validation report shows missing names, invalid or duplicate emails, and the rows that will be skipped.
2. **Mail body** (`template`): upload the mail body as `.docx`, `.pdf` or `.txt`, or paste it. Then set the subject. The text keeps its format (paragraphs, bullet lists, sign-off line). Placeholders such as `[To Name]` and `[Company Name]` are filled from each row. Bodies can be saved as reusable templates, together with their CC list.
3. **Sender details + CC** (`sender`): choose the sender profile (name, designation, company, phone, email, website). It is added as a fixed signature below every email; the row's `from_name`, when present, replaces the sender name. Then add up to 10 CC addresses.
4. **AI generate** (`generate`): for every row, the AI gets the mail body plus that row's details (company, names, extra columns). It makes small adjustments so the email fits the contact, and keeps the format and meaning. If the AI fails or returns something unsafe, the original body (with placeholders filled) is kept.
5. **Review** (`review`): preview each email exactly as it will be sent (From, To, CC, subject, body, signature). You can edit, regenerate, fix a recipient address, approve, reject or send a test email to yourself (test emails have no CC).
6. **Send** (`send`): a summary shows how many emails will go out and the CC list. You can send now or schedule in a time zone, with an interval between emails. Every contact gets its own email (one recipient in **To**), and the CC list is copied on each one.
7. **Results** (`results`): live status per email, retrying failed sends, activity logs and a CSV export.

### Contacts file format

| Column | Required | Notes |
| --- | --- | --- |
| `company_name` | yes | Used in the subject/body and by the AI |
| `to_name` | yes | Recipient name, for example used in the greeting |
| `email` | yes | Validated, trimmed, lowercased; duplicates are skipped |
| `from_name` | no | Sender name shown in the signature and the From header for that row |
| any other column | no | Passed to the AI as extra details (up to 30 columns) |

Header names are matched flexibly (for example `Company`, `Contact Name`, `Email ID`). Limits: Excel/CSV 5 MB and 10,000 rows; PDF 20 MB and 300 pages (the PDF must contain a text table with a header row). Mail body files are limited to 5 MB.

---

## 2. Requirements

- Node.js 20.9 or newer (Node 22 LTS recommended)
- A PostgreSQL 14+ database (Neon, Supabase, Railway, RDS or self-hosted)
- An OpenRouter API key
- A Google Cloud OAuth client for Gmail sending

## 3. Setup

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # Windows: copy .env.example .env
```

Fill in `.env` (see the next section), then:

```bash
npm run db:migrate          # applies prisma/migrations to DATABASE_URL
npm run dev                 # http://localhost:3000
```

Open the app, register your account, then go to **Settings**. The setup screen shows which configuration items are missing.

> `.env` is git-ignored. Never commit it. `.env.example` contains no secrets.

### Local database without installing Postgres

Prisma ships a local Postgres for development:

```bash
npx prisma dev --name ecm --detach      # prints a postgres://...localhost:51214/... TCP URL
```

Put the printed **TCP** URL in `DATABASE_URL` and set `DATABASE_POOL_MAX=1`, because this local server handles only one connection at a time. Use a real Postgres for production.

---

## 4. Environment variables

All variables are read only on the server (`lib/env.ts`, a `server-only` module). None are exposed to the browser.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (`?sslmode=require` for hosted databases) |
| `DATABASE_POOL_MAX` | no (10) | Max DB connections per server process |
| `APP_URL` | yes | Public base URL, used for OAuth redirects and CSRF origin checks |
| `SESSION_SECRET` | yes | At least 32 random characters |
| `TOKEN_ENCRYPTION_KEY` | yes | Base64 string decoding to exactly 32 bytes. Encrypts OAuth tokens at rest (AES-256-GCM) |
| `ALLOW_REGISTRATION` | no (true) | Set to `false` after creating your account to disable sign-ups |
| `AUTO_LOGIN` | no (false) | `true` skips the sign-in screen and opens the app as one local owner account. **Ignored when `NODE_ENV=production`** |
| `AUTO_LOGIN_EMAIL` | no | Account used by auto-login (default `owner@localhost`, created on first visit) |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `OPENROUTER_MODEL` | no | Default `openai/gpt-4o-mini` |
| `AI_CONCURRENCY` | no (3) | Parallel OpenRouter requests |
| `AI_MAX_RETRIES` | no (4) | Retries for rate limits, timeouts, 5xx and malformed output |
| `AI_TIMEOUT_MS` | no (45000) | Per-request timeout |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client |
| `GOOGLE_REDIRECT_URI` | yes | `${APP_URL}/api/oauth/google/callback` |
| `EMAIL_BATCH_SIZE` | no (10) | Emails per batch |
| `EMAIL_BATCH_DELAY_MS` | no (60000) | Delay between batches |
| `MAX_EMAIL_RETRIES` | no (3) | Retries for transient send failures |
| `AI_PROVIDER` / `EMAIL_PROVIDER` | no | `mock` for development testing only. **Forced to real providers when `NODE_ENV=production`** |
| `DISABLE_QUEUE_WORKER` | no | `true` disables the background worker in this process |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # TOKEN_ENCRYPTION_KEY
```

Changing `TOKEN_ENCRYPTION_KEY` later makes stored Gmail tokens unreadable. You would then need to reconnect Gmail.

---

## 5. Database migrations

| Task | Command |
| --- | --- |
| Apply migrations (dev and prod) | `npm run db:migrate` (`prisma migrate deploy`) |
| Create a new migration after editing `prisma/schema.prisma` | `npm run db:migrate:dev -- --name <change>` |
| Regenerate the Prisma client | `npm run db:generate` |

The initial migration includes a **partial unique index** (`email_sends_one_active_campaign_send`). It makes a second in-flight or successful campaign send to the same recipient impossible at the database level. If you ever regenerate the initial migration, use `scripts/gen-init-migration.ps1`, which re-appends that index.

---

## 6. Google OAuth (Gmail) setup

The app never asks for or stores your Gmail password. It uses OAuth with the `gmail.send` scope only, so it can send mail but cannot read your inbox.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services → Library**, then enable the **Gmail API**.
3. Go to **APIs & Services → OAuth consent screen**:
   - User type: **External** (or Internal for Workspace).
   - Add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `.../auth/gmail.send`.
   - While the app is in **Testing** mode, add your Gmail address under **Test users**.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**.
   - Authorized redirect URI: `http://localhost:3000/api/oauth/google/callback`, plus your production URL's equivalent.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to match exactly.
6. In the app, open **Settings → Connect Gmail** and approve access.

Notes:

- Refresh and access tokens are encrypted with `TOKEN_ENCRYPTION_KEY` and never sent to the browser.
- **Disconnect** revokes the token at Google and deletes it locally.
- In Testing mode, Google refresh tokens expire after 7 days. Publish the consent screen, which requires Google verification for `gmail.send`, or reconnect weekly.
- Gmail's own sending limits still apply (roughly 500/day for consumer accounts, 2,000/day for Workspace). Keep batch sizes and delays conservative.

## 7. OpenRouter configuration

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys) and add credits.
2. Set `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`. Any chat model works; models with JSON mode give the most reliable output. Examples: `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, `google/gemini-2.0-flash-001`.
3. The key is used only in `lib/ai/openrouter.ts` on the server. It is never sent to the browser, written to logs, or stored in the database.

How generation works:

- The prompt contains the mail body, the subject and only this row's `<contact_details>` (company, to name, from name and the extra columns). The model is asked for light, factual adjustments only, keeping the format, bullet lists and meaning.
- The output is checked before saving: it must stay a light edit of your body, with the same number of paragraphs and bullet points and no leftover placeholders. When a check fails or the AI is unavailable, the email falls back to the mail body with the placeholders filled; Review shows "AI output not used" for that email.
- The sender signature is always added by the app (not by the AI) below the body.
- Retry handling:
  - Rate limits (respecting `Retry-After`), timeouts and 5xx responses get exponential backoff with jitter.
  - Malformed output gets one stricter retry.
  - Invalid-key or no-credit errors pause the queue with a clear message instead of failing every contact.
- Each generated email stores the model, prompt version, timestamp and full prompt snapshot. Editing the campaign prompt bumps the prompt version but never changes already generated emails.

---

## 8. Development commands

```bash
npm run dev         # dev server + background queue worker
npm run typecheck   # next typegen + tsc --noEmit
npm run lint        # eslint
npm run build       # production build
npm run start       # run the production build
npm run test:e2e    # end-to-end API test (needs mock providers, see section 10)
npm run db:check    # database integrity check (no duplicate sends, consistent counters)
npm run desktop:dev   # build the desktop server and open the desktop app (see section 9a)
npm run desktop:build # build the Windows installer into dist-desktop/
node scripts/brand-icons.mjs  # regenerate favicon, app and desktop icons from public/brand/sorts-mark.svg
```

Brand: the logo files are `public/brand/sorts-mark.svg` (symbol) and `public/brand/sorts-logo.svg` (symbol + wordmark). Design tokens (Sorts violet `#8307FC`, blue `#274EFB`, cyan `#03CCFC`, sampled from the logo, surfaces, type, motion) live in `app/globals.css`; brand components are in `components/sorts/`.

## 9. Production deployment

The generation and sending queues run in a **background worker inside the Node.js server**, started from `instrumentation.ts`. Queue state lives in Postgres, so it survives restarts.

- Deploy as a **long-running Node server**: a VPS, Docker, Railway, Render, Fly.io, or similar. Serverless platforms (for example Vercel functions) freeze between requests and will not process the queue.
- Run **one instance** with the worker. If you scale horizontally, set `DISABLE_QUEUE_WORKER=true` on all but one instance. Claims use `FOR UPDATE SKIP LOCKED`, so multiple workers are safe but provide no benefit.

Deployment steps:

```bash
npm ci
npm run db:migrate
npm run build
NODE_ENV=production npm run start      # listens on PORT (default 3000)
```

Production checklist:

- [ ] `APP_URL` is your HTTPS URL. Session cookies are `Secure` in production.
- [ ] `GOOGLE_REDIRECT_URI` uses the production domain and is registered in Google Cloud.
- [ ] Strong, unique `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY`, stored in your host's secret manager.
- [ ] `ALLOW_REGISTRATION=false` once your account exists.
- [ ] The app is behind a reverse proxy that sets `X-Forwarded-For`, which is used for per-IP rate limiting on login and registration.
- [ ] Mock providers are automatically disabled when `NODE_ENV=production`.

On startup the worker recovers interrupted work:

- Stuck generation jobs are re-queued.
- Recipients that were mid-send when the server stopped are marked **FAILED** with "check your Sent folder". They are not retried automatically, because the outcome is unknown and an automatic retry could send a duplicate. Use **Retry failed** after checking.

---

## 9a. Desktop app (Windows)

The same app can be installed as a Windows desktop program. It runs everything on your PC: its own PostgreSQL database and app server, with no sign-in screen and no hosting needed.

### Build the installer

```bash
npm install
npm run desktop:build      # -> dist-desktop/Sorts Setup <version>.exe
```

`desktop:build` builds the Next.js server in standalone mode (`scripts/desktop-prepare.mjs`, output in `.next-desktop/` and `desktop/app-server/`), then packages it with Electron and the bundled PostgreSQL 18 binaries (`electron-builder.yml`). Your `.env` file is never included. For a quick local run without installing, use `npm run desktop:dev`.

### First launch

1. Run the installer, then open **Sorts** from the desktop or Start menu.
2. The setup window asks for:
   - your **OpenRouter API key** (and model), and
   - your **Google OAuth client ID and secret**.
3. In Google Cloud Console, add the redirect URI shown in the setup window as an authorized redirect URI of your **Web application** OAuth client: `http://localhost:47821/api/oauth/google/callback`. See section 6 for the rest of the Google setup.
4. In the app, open **Settings → Connect Gmail**. Google sign-in opens in your normal browser, because Google blocks sign-in inside app windows. When the browser says "Gmail connected", return to the app.

You can change the keys later with **File → Configure keys**; saving restarts the app server.

### How it works

- On start-up the app starts PostgreSQL on `127.0.0.1:47822`, applies the database migrations, then starts the app server on `127.0.0.1:47821`. Neither is reachable from other computers.
- Sign-in is automatic. Each launch creates a random token that only the app window sends, so other programs or websites on the PC cannot sign in to it.
- The keys, the session secret and the token encryption key are stored in `%APPDATA%\Email Campaign Manager\config.json`, encrypted for your Windows account (DPAPI).
- Data lives in `%APPDATA%\Email Campaign Manager\data`. Logs are in `...\logs\desktop.log` (**Help → Open log file**).
- The folder keeps its pre-rename name (`main.cjs` pins `userData` to it) so existing installs keep their data, and `appId` in `electron-builder.yml` is unchanged so the installer upgrades in place.

### Sending and closing the app

Emails are only sent while the app is running. If you close the window while a campaign is scheduled or sending, the app offers to **keep sending in the system tray**. Use the tray icon to reopen it or quit.

### Backups

Use **File → Back up data** to copy the database to a folder you choose (the app pauses for a few seconds). Each backup is a folder named `sorts-backup-<date>`. To restore, quit the app, then replace the contents of `%APPDATA%\Email Campaign Manager\data` with the contents of that backup folder. Backups restore on the **same PC and Windows account** only: the database password and the key that protects the stored Gmail token are in `config.json`, which Windows encrypts for that account. Moving to another PC is not supported yet.

### Notes

- The installer is about 160 MB (Electron, PostgreSQL and the app server).
- It is not code-signed, so Windows SmartScreen shows a warning on first install ("More info → Run anyway"). Sign it with a code-signing certificate before giving it to other people.
- Ports 47821 and 47822 must be free. The Google redirect URI depends on port 47821.

## 9b. Subscriptions (website + desktop license)

The desktop app can be sold as a subscription. A small website in `portal/` handles accounts, the 7-day free trial and Razorpay payments. The desktop app connects to it once and then checks the subscription in the background.

**What customers see**

1. They sign up on the website. The 7-day free trial starts immediately, without a card.
2. They install the app and click **Account → Connect account** (or the **Connect account** button in the app). The app shows a code such as `K7QX-2MPD` and opens the website, where they confirm it.
3. Before the trial ends they subscribe (monthly or yearly) on the website's account page. If they subscribe during the trial, the first charge happens when the trial ends.
4. Without an active trial or subscription, **everything works except sending**: contacts, mail body, AI generation and review stay available. The Send step shows a lock with **Subscribe** / **Connect account** buttons, and scheduled campaigns are **paused** (not failed), so **Resume** continues them after subscribing.

**How the check works**

- When a PC is connected, the website issues a license signed with an Ed25519 private key. The app holds only the public key, so it can verify a license but cannot create one.
- The license is saved in `%APPDATA%\Email Campaign Manager\license.json` and renewed every 6 hours, on start-up and after the PC wakes. A license stays valid offline for up to 7 days; after that, sending is locked until the PC is online again.
- The app server checks the license before every send, schedule, resume, retry and test email, and returns HTTP 402 when it isn't valid.
- Each account can connect up to `MAX_DEVICES` PCs (2 by default). Customers remove old PCs on the website's account page; a removed PC disconnects itself at its next check.
- If `PORTAL_URL` and `LICENSE_PUBLIC_KEY` are not set when the installer is built, subscriptions are off and sending is not restricted.

### Set up the website

1. **Database:** create a PostgreSQL database (for example on [Neon](https://neon.tech)).
2. **License keys:** run `cd portal && npm install && npm run license:keygen`. It prints `LICENSE_SIGNING_KEY` (secret; website only) and `LICENSE_PUBLIC_KEY` (goes into the desktop build).
3. **Razorpay** ([dashboard](https://dashboard.razorpay.com)):
   - **Account & Settings → API keys:** create a key, which gives `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   - **Subscriptions → Plans:** create a monthly plan and a yearly plan. Their ids are `RAZORPAY_PLAN_MONTHLY` and `RAZORPAY_PLAN_YEARLY`.
   - **Webhooks:** add `https://<your-site>/api/billing/webhook` with all `subscription.*` events, and choose a secret (`RAZORPAY_WEBHOOK_SECRET`).
   - Use test-mode keys first, then switch to live keys.
4. **Deploy** `portal/` (for example on [Vercel](https://vercel.com) with root directory `portal`).
   - Set the variables from `portal/.env.example`: `DATABASE_URL`, `APP_URL` (the site's public URL), `SESSION_SECRET` (32+ random characters), the Razorpay values above, `LICENSE_SIGNING_KEY`, and optionally `PRICE_*_LABEL`, `TRIAL_DAYS`, `MAX_DEVICES` and `DOWNLOAD_URL` (link to the installer).
   - Apply the database schema with `npx prisma migrate deploy`, run from `portal/` with `DATABASE_URL` set.
   - The website refuses to start in production if a required secret is missing.

### Build the desktop app for subscriptions

Add these two lines to the root `.env` (or set them as environment variables), then build as usual:

```bash
PORTAL_URL="https://your-site.example"
LICENSE_PUBLIC_KEY="MCowBQYDK2VwAyEA..."   # from npm run license:keygen
npm run desktop:build
```

`desktop:prepare` writes them to `desktop/license-config.json`, which ships inside the app. Neither value is secret.

### Run the website locally

```bash
cd portal
npm install
node scripts/local-db.mjs start   # private PostgreSQL on 127.0.0.1:47901 (uses the desktop app's bundled binaries)
cp .env.example .env              # set DATABASE_URL to the printed value, SESSION_SECRET, LICENSE_SIGNING_KEY
npx prisma migrate deploy
npm run dev                       # http://localhost:3100
```

Without Razorpay keys (outside production), checkout is simulated: **Subscribe** asks you to confirm a fake payment. To try the app against it, set `PORTAL_URL=http://localhost:3100` and the matching `LICENSE_PUBLIC_KEY` in the root `.env`, then run `npm run desktop:dev`.

---

## 10. Test procedure

### Automated (mock providers, no real emails or AI credits)

Start the dev server with mock providers. Process env overrides `.env`:

```powershell
# PowerShell
$env:AI_PROVIDER="mock"; $env:EMAIL_PROVIDER="mock"; npm run dev
```

```bash
# bash
AI_PROVIDER=mock EMAIL_PROVIDER=mock npm run dev
```

Then, in another terminal:

```bash
npm test            # unit tests (mapping, PDF rows, signature, CC/MIME, AI checks, scheduling)
npm run test:e2e    # 93 checks across the full send flow
npm run db:check    # DB-level integrity
```

Subscription checks. Neither needs the dev server or touches your data: each starts its own temporary PostgreSQL.

```bash
cd portal && npm run test:e2e   # website: trial, connect a PC, simulated payment, webhooks, device limit, desktop license manager
npm run desktop:prepare && npm run test:license   # app: sending blocked (402) without a valid license, campaigns paused on expiry
```

The e2e script walks the seven steps:

- Registration, login, mock providers and the sender profile.
- Contacts file: column mapping, 6 valid / 4 invalid rows, duplicates, extra columns.
- Security: CSRF, cross-origin requests, access to another user's campaign.
- Mail body + subject, CC validation (invalid address, more than 10, de-duplication).
- AI generate: body format and signature kept, row's from name used, AI failure falls back to the body, prompt contains only this row's details.
- Review: editing, header-injection rejection, regenerate, address correction, approve/reject, test email without CC.
- Send: confirmation text, past schedule refused, one email per contact with the CC list on each, bounce handling, duplicate-send prevention.
- Results, CSV export (with the CC column), activity logs, time-zone scheduling, large-campaign count confirmation, removed pages returning 404, logout.

The auth rate limit (10 requests per 10 minutes per IP) can trip if you run the script repeatedly.

Mock behavior:

| Trigger | Mock effect |
| --- | --- |
| Company name contains `mock-ai-fail` | AI generation fails (the mail body is kept) |
| Email contains `bounce` | Send fails permanently (invalid recipient) |
| Email contains `fail` | Transient send failure, retried up to `MAX_EMAIL_RETRIES` |
| Email contains `ratelimit` | Provider rate limit, which slows the batch delay |

Mock emails are labelled `[MOCK EMAIL - development only]`, and a banner is shown throughout the app.

### Manual (real OpenRouter + Gmail)

1. Set the real keys and `AI_PROVIDER=openrouter`, `EMAIL_PROVIDER=gmail`. Restart the server and connect Gmail in **Settings**.
2. Open **New campaign** and upload a contacts file (`company_name, to_name, from_name, email`) with two rows that use **your own addresses**, for example `you+rahul@gmail.com` (Rahul / ABC Technologies) and `you+priya@gmail.com` (Priya / XYZ Robotics).
3. Upload a mail body (`.docx`, `.pdf` or `.txt`) that uses `[To Name]` and `[Company Name]`, and set the subject.
4. Pick your sender profile and add a CC address you own (for example `you+cc@gmail.com`).
5. Run **AI generate**. Check that each email keeps your format, mentions only its own person and company, and ends with your signature.
6. In **Review**, preview an email, send a **test email** to yourself (it has no CC and is not counted as a send), then approve both.
7. In **Send**, check the summary and CC list, type `APPROVE & SEND ALL` and send.
8. Check that each contact receives exactly one email with the CC address copied, the statuses show SENT with timestamps, and the CSV export matches.

---

## 11. Security summary

- The OpenRouter key and the Google client secret and refresh tokens are server-only. OAuth tokens are encrypted at rest with AES-256-GCM.
- Passwords are hashed with scrypt. Sessions are random tokens stored as SHA-256 hashes, in an `httpOnly` `SameSite=Lax` cookie.
- CSRF protection uses a double-submit token plus an Origin/Referer check on every mutation.
- Every campaign, contact and recipient query is scoped to the signed-in user.
- Database-backed rate limits apply to auth, import, generation, sending and test emails.
- Logs redact keys, tokens and passwords.
- Email preview renders plain text only, with no HTML injection. Email headers are sanitized against CRLF injection.
- CSV input is sanitized (control characters, length limits), and the export neutralizes spreadsheet formulas.
- All database access goes through Prisma with parameterized queries.

## 12. Known limitations

- Emails are sent as **plain text** (no HTML templates, attachments or open/click tracking). This is deliberate, for deliverability and XSS safety.
- **Gmail only** for now. The `EmailProvider` interface (`lib/email/provider.ts`) is ready for a Microsoft Graph provider, but it is not implemented.
- Needs a long-running Node process; serverless hosting is not supported (see section 9).
- No bounce or reply ingestion. Only errors returned synchronously by Gmail are recorded. Asynchronous bounces arrive in your inbox.
- Gmail daily sending quotas and Google's 7-day refresh-token expiry in Testing mode apply.
- Rate limiting is per user or IP using fixed windows in Postgres. It is fine for a single-tenant deployment but not a substitute for an edge WAF.
- Single-user oriented: each account has its own contacts and campaigns, and there are no team or shared workspaces.
