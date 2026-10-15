# Deploying Sorts Mail Engine to Netlify (Public Service)

This guide walks you through deploying **Sorts** as a public multi-user web application on Netlify with the **$1 for 5 Uses UPI Payment System** and **Groq AI**.

---

## Architecture Overview

- **Frontend & API**: Next.js App Router hosted on **Netlify** (via `@netlify/plugin-nextjs`).
- **Database**: Cloud PostgreSQL via **Neon.tech** (free, serverless, instant setup).
- **AI Drafting**: **Groq API** (`openai/gpt-oss-120b`) with ultra-fast inference and zero credit blocks.
- **Payment Service**: Direct **UPI QR Code** (₹85 / $1 for 5 campaign runs) — **no payment gateway or KYC required**.

---

## Step 1: Create a Free Hosted PostgreSQL Database (Neon)

Netlify runs serverless functions, so you need a public cloud PostgreSQL database:

1. Go to [https://neon.tech](https://neon.tech) and create a free account.
2. Click **Create Project** (e.g., name it `sorts-engine`).
3. Copy your **Connection String**. It looks like:
   ```env
   postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Push your schema to Neon from your terminal:
   ```bash
   DATABASE_URL="your-neon-connection-string" npx prisma db push
   ```

---

## Step 2: Push Your Code to GitHub / GitLab

1. Initialize git and commit:
   ```bash
   git init
   git add .
   git commit -m "feat: sorts mail engine with groq ai and direct upi payments"
   ```
2. Create a new repository on GitHub (private or public) and push:
   ```bash
   git remote add origin https://github.com/your-username/mail-sending-engine.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 3: Connect to Netlify

1. Log in to [Netlify](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project**.
3. Select **GitHub** and pick your repository.
4. Netlify will read `netlify.toml` automatically:
   - **Build command**: `prisma generate && next build`
   - **Publish directory**: `.next`
   - **Node version**: `20`

---

## Step 4: Configure Environment Variables in Netlify

In your Netlify site dashboard, go to **Site configuration** > **Environment variables** and add:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...@...neon.tech/neondb?sslmode=require` | Hosted PostgreSQL connection string from Neon |
| `APP_URL` | `https://your-site.netlify.app` | Your public Netlify site URL |
| `SESSION_SECRET` | `generate-random-32-chars-secret-here` | Random string of at least 32 characters |
| `TOKEN_ENCRYPTION_KEY` | `your-32-byte-base64-encryption-key-here` | 32-byte Base64 key |
| `GROQ_API_KEY` | `gsk_your_groq_api_key_here` | Your Groq API key |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | High-speed AI model |
| `AI_PROVIDER` | `groq` | Set Groq as primary or openrouter |
| `UPI_ID` | `yourname@okaxis` (or your UPI ID) | UPI ID where payments will be sent |
| `UPI_NAME` | `Your Name or Business Name` | Display name shown on payment apps |
| `UPI_AMOUNT_INR` | `85` | INR equivalent of $1 |
| `CREDITS_PER_PAYMENT` | `5` | Number of campaign runs added per $1 payment |
| `FREE_TRIAL_CREDITS` | `5` | Initial free campaign runs for new users |
| `ALLOW_REGISTRATION` | `true` | Allows anyone to sign up |
| `AUTO_LOGIN` | `false` | Disabled so users have their own individual accounts |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | (Optional) Google OAuth Client ID if using OAuth |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | (Optional) Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://your-site.netlify.app/api/oauth/google/callback` | (Optional) OAuth redirect URI |

> **Note on Sending Mail**: You do **not** have to set up Google Cloud OAuth! In **Settings > Sending account**, you can click **"Add Direct Sending Mail (SMTP)"** and connect any Gmail (using a 16-character Google App Password), Outlook, Zoho, or company SMTP directly in seconds.

---

## Step 5: How the $1 / 5-Use UPI Payment Service Works

1. **Free Initial Runs**:
   - Every registered user automatically receives **5 free campaign runs**.
   - The topbar shows a live status badge: `⚡ 5 runs left`.

2. **Reaching the Limit**:
   - Each campaign generation run deducts 1 credit.
   - When 0 runs remain, further campaign generation is safely locked, and the topbar badge highlights **Top up $1**.

3. **User Payment Experience**:
   - The user clicks **Top up** or is prompted when generating.
   - A modal opens displaying:
     - Dynamic **UPI QR Code** (auto-configured for ₹85 / $1).
     - UPI ID with one-click copy button.
     - Form to enter the 12-digit **UTR / Transaction Reference** and upload an optional screenshot receipt.
   - When the user submits, **5 campaign runs are instantly unlocked**!

4. **Owner Management in Settings**:
   - Go to **[http://localhost:3000/settings#upi-payments](http://localhost:3000/settings#upi-payments)** (or your live site `/settings`).
   - You can update your **UPI ID**, **Payee Name**, and **Price** anytime without redeploying.
   - View the complete **UPI Ledger** with dates, UTR numbers, amounts, and receipt screenshots.
