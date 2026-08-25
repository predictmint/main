# exit/9to5 — Vercel edition

Same product as before, restructured so the whole thing (site + backend)
deploys as one Vercel project: static pages at the root, backend logic as
serverless functions under `/api`.

## What's here

```
landing.html         marketing/pricing page
index.html           dashboard (demo mode)
style.css, rain.js   shared styling / background effect
app.js               dashboard engine — fair-value model, journal, rendering
api/
  admin/login.js         admin auth
  admin/keys.js          issue / list access keys
  admin/keys/[key].js    revoke a key
  access/verify.js       dashboard checks a key against this before unlocking
  kalshi/markets.js            proxies Kalshi's PUBLIC market data
  kalshi/markets/[ticker]/orderbook.js
  journal.js              read/write journal entries + trade counts
  stats/trade-count.js    powers the counter on the landing page
  _lib/db.js              shared storage helpers (Vercel KV)
package.json
```

No build step — this is plain HTML/CSS/JS plus Node serverless functions,
which is exactly what Vercel's zero-config "Other" project type expects.

## Hosting walkthrough

### 1. Get the code into a GitHub repo

Vercel deploys from a Git repo, so push this folder to GitHub first:

```bash
cd exit9to5-vercel
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/exit9to5.git
git push -u origin main
```

### 2. Import the repo into Vercel

1. Go to vercel.com → log in (GitHub login is easiest) → **Add New → Project**.
2. Pick your `exit9to5` repo → Vercel auto-detects it as a static project
   with API routes. You don't need to change any build settings.
3. Click **Deploy**. You'll get a live URL like `exit9to5.vercel.app`
   within about a minute.

### 3. Add a KV database (needed for keys/journal/trade-count to persist)

Serverless functions don't share disk between requests, so this project
uses Vercel's built-in Redis-compatible store instead of a file:

1. In your project on vercel.com → **Storage** tab → **Create Database**
   → choose **KV**.
2. Once created, click **Connect Project** and select this project.
   Vercel automatically sets the `KV_REST_API_URL` / `KV_REST_API_TOKEN`
   env vars for you — no code changes needed.
3. Redeploy (Vercel usually does this automatically after connecting a
   database; if not, go to **Deployments** → click the three dots on the
   latest one → **Redeploy**).

### 4. Set your admin password

1. Project → **Settings → Environment Variables**.
2. Add `ADMIN_PASSWORD` = something real (not the placeholder from earlier).
3. Redeploy for it to take effect.

### 5. Issue your first access key

From your own machine, once deployed:

```bash
# log in
curl -X POST https://exit9to5.vercel.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<your ADMIN_PASSWORD>"}'
# → { "token": "..." }

# issue a 30-day key
curl -X POST https://exit9to5.vercel.app/api/admin/keys \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <token from above>" \
  -d '{"label":"@customerhandle","tierPriceUsd":60}'
# → { "key": "e9t_...", "expiresAt": ... }
```

Send the customer: `https://exit9to5.vercel.app/index.html?key=e9t_...`

### 6. (Optional) custom domain

Project → **Settings → Domains** → add your own domain and follow the
DNS instructions Vercel gives you. Not required — the `.vercel.app` URL
works fine to start.

## What this does and does not do

**Does:** real live Kalshi public market prices in demo mode, a real
volatility-based fair-value model, a fully detailed journal, key-gated
access you issue by hand, a landing page with a live trade counter.

**Does not, on purpose:** store or use anyone's real Kalshi credentials,
place real orders for anyone, or auto-verify crypto payments.

## Before this touches real money or real customers

- Talk to a lawyer about CFTC/CTA registration before charging for access
  to trading signals on a CFTC-regulated market — this is a real
  requirement, not a formality.
- Don't price access (the $60/$120 split) off simulated win-rate numbers —
  back it with a real validated track record first.
- Don't build a path for customers to connect real Kalshi credentials
  until the above is sorted — that's the step that turns this from
  "selling dashboard access" into "managing other people's money."
