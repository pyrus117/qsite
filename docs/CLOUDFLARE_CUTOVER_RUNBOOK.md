# Cloudflare Cutover Runbook

## URGENT — Claim the Neon Database (do first, deadline ~2026-07-23)

**This step has a hard deadline. Netlify's database offering sunsets ~2026-07-23 for unpaid projects. Do this within the next few days.**

1. Go to **Netlify dashboard** → select the `qsite` project → **Extensions** (left sidebar) → **Database**
2. Click **"Claim database"** — this hands the database to your Neon account at neon.tech
3. Open **neon.tech** in a new tab, sign in to your account
4. Navigate to **Dashboard** → select the `qsite` project
5. Click **Connection Details** (top right)
6. Copy the **pooled connection string** (it looks like `postgresql://user:password@host/dbname?sslmode=require`)
7. Open your terminal on your PC, navigate to the repo:
   ```bash
   cd /path/to/qsite
   ```
8. Run the migration baseline check:
   ```bash
   DATABASE_URL='<paste-the-pooled-string-here>' npm run db:migrate
   ```
   (`npm run db:migrate` runs `drizzle-kit migrate` under the hood.)
   **Expected output:** Either `No migrations to apply` (database is already tracked), or it creates the `drizzle.__drizzle_migrations` table and applies both migrations without error.

### Troubleshooting: If it errors "relation 'ideas' already exists"

This means the tracking table didn't carry over from Netlify. **Stop here — do not hand-write baseline SQL.**

Instead, check what tracking state exists:
```bash
psql "$DATABASE_URL" -c 'select hash, created_at from drizzle.__drizzle_migrations;'
```

(Or use Neon's SQL editor in the dashboard if `psql` is not installed.)

Note what you see, then in a new Claude Code session:
- Give Claude the output of that query and the two migration folder names (`db/migrations/20260716053459_empty_the_santerians/` and `db/migrations/20260716213917_rapid_psynapse/`)
- Ask Claude to baseline the migrations by inserting the correct snapshot IDs into the tracking table
- Run the command again to confirm it now says `No migrations to apply`

**Proceed to Step 2 only after Step 1 succeeds with no error.**

---

## Step 2: Copy Environment Variables from Netlify

1. Go to **Netlify dashboard** → select the `qsite` project → **Site settings** (left sidebar)
2. Click **Site configuration** → **Environment variables**
3. You'll see a list of environment variables. Record these three values (copy the full string, including hyphens):
   - `RUNNER_TOKEN` 
   - `GITHUB_TOKEN`
   - `GITHUB_REPO`
4. Keep these in a text editor or password manager — you'll paste them into Cloudflare in the next steps.

---

## Step 3: First Deploy to Workers.dev

1. Open your terminal, navigate to the repo:
   ```bash
   cd /path/to/qsite
   ```
2. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```
   (This opens a browser window. Authorize the app, then return to the terminal.)

3. Check that you're on the `cloudflare-migration` branch:
   ```bash
   git branch
   ```
   (Should show `* cloudflare-migration` highlighted.)

4. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
   Wait for the deployment to complete. Note the URL: `https://qsite.<your-account-name>.workers.dev`

5. Set the three secrets (paste the values you recorded in Step 2):
   ```bash
   npx wrangler secret put DATABASE_URL
   ```
   (Paste the **pooled Neon connection string**, then press Enter.)
   
   ```bash
   npx wrangler secret put RUNNER_TOKEN
   ```
   (Paste the RUNNER_TOKEN value from Step 2.)
   
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```
   (Paste the GITHUB_TOKEN value from Step 2.)

6. Test the deploy:
   ```bash
   curl https://qsite.<your-account>.workers.dev/
   ```
   Expected: HTML homepage renders (200 status, no errors).
   
   ```bash
   curl -I https://qsite.<your-account>.workers.dev/studio/api/me
   ```
   Expected: `401 Unauthorized` — this proves the endpoint exists but is fail-closed (no auth yet, so it rejects).

---

## Step 4: Create the Cloudflare Access Application

1. Go to **Cloudflare Zero Trust dashboard** (https://dash.teams.cloudflare.com)
2. Click **Access** (left sidebar) → **Applications** → **Add an Application**
3. Select **Self-hosted**
4. Fill in:
   - **Application Domain:** `qyouthnz.com`
   - **Application Path:** `studio`
   - (This covers `/studio` and everything under it, including `/studio/api/*`)
5. Click **Next** → **Add a policy**
6. Set the policy:
   - **Action:** Allow
   - **Rule type:** Emails ending in
   - **Value:** `@qyouthnz.com` (anyone with a Q Youth email)
   - (Do **not** pick plain "Emails" — that selector only matches exact addresses one at a time and will lock everyone else out.)
7. Click **Save policy** → **Save application**

**Troubleshooting:** If `/studio` later rejects a valid `@qyouthnz.com` login, re-check the policy uses "Emails ending in" (not "Emails") and that the Application Path is `studio`.

8. After saving, go back to the application details:
   - Click **Configure** (top right)
   - Copy the **Application Audience (AUD) tag** (long alphanumeric string like `abc123xyz.cloudflareaccess.com`)
   - Note the **team domain** from Zero Trust → Settings → **Custom Pages** (it looks like `https://<team-name>.cloudflareaccess.com`)

9. Edit `wrangler.jsonc` in your repo:
   ```bash
   cd /path/to/qsite
   ```
   Open the file in your editor and find the `vars` section. Replace:
   - `CF_ACCESS_AUD`: `"<paste-the-AUD-tag-here>"`
   - `CF_ACCESS_TEAM_DOMAIN`: `"https://<paste-team-name>.cloudflareaccess.com"`

10. Commit and redeploy:
    ```bash
    git add wrangler.jsonc
    git commit -m "feat: add Cloudflare Access AUD and team domain"
    npx wrangler deploy
    ```

**Note:** Full Access login testing happens after Step 7 (when DNS points to Cloudflare). Access only enforces on the custom domain, not on workers.dev.

---

## Step 5: Connect Workers Builds to GitHub

1. Go to **Cloudflare dashboard** → **Workers & Pages** (left sidebar)
2. Click the `qsite` worker (in the Workers tab)
3. Go to **Settings** → **Builds** (left sidebar)
4. Click **Connect to GitHub**
5. Authorize Cloudflare to access your GitHub account (browser popup)
6. Select **Repository:** `pyrus117/qsite`
7. Set:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
8. Click **Save**

(This mirrors the intranet setup. CI will now deploy automatically on `main` branch pushes.)

---

## Step 6: Merge Branch and Let CI Deploy

1. From your terminal:
   ```bash
   git checkout main
   git pull origin main
   git merge cloudflare-migration
   git push origin main
   ```

2. Go to **Cloudflare Dashboard** → **Workers & Pages** → `qsite` worker → **Deployments** tab
3. Wait for the build to turn green. (Takes ~2 minutes.)
4. **Expected result:** The Workers Build succeeds and deploys.

**What happens now:**
- Your Cloudflare worker is live on the custom domain (once DNS points — that's Step 7)
- The Netlify site is **still serving** its last good deploy until you move DNS (expected; no traffic loss)
- Netlify's CI build is now broken (expected; you'll delete that site in Step 9)

---

## Step 7: Custom Domains — Point DNS to Cloudflare

**⚠️ WARNING: This step moves live traffic. Read the DNS checklist below before proceeding.**

### DNS Checklist Before You Begin

Check **Cloudflare Dashboard** → your domain's DNS zone:
- **MX records** exist and point to Google Workspace (should show Google's MX addresses like `aspmx.l.google.com`)
- **TXT records** contain your SPF (`v=spf1`) and any other verification records for Google Workspace, including a nested SPF record at `dc-aa8e722993._spfm` — Google Workspace email delivery depends on it
- **Do NOT touch these** — they are live email, and breaking or "cleaning up" any MX/TXT record (including the nested `_spfm` one) means incoming mail fails

If you don't see MX/SPF records, ask your domain registrar or Cloudflare support before proceeding.

### Add Custom Domains to the Worker

Use **Custom Domains**, not Routes — a Custom Domain is what makes Cloudflare create/replace the proxied DNS records and certificate for you automatically. Routes do not touch DNS at all (they only bind an existing domain pattern to a worker), so adding a Route here would leave your DNS unmigrated.

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → `qsite` worker
2. Go to **Settings** → **Domains & Routes** (left sidebar)
3. Click **Add** → **Custom Domain**
4. Add the first domain:
   - **Domain:** `qyouthnz.com` (plain hostname, no `/*` pattern)
   - Click **Add Custom Domain**
5. Repeat for the second domain:
   - Click **Add** → **Custom Domain**
   - **Domain:** `www.qyouthnz.com` (plain hostname, no `/*` pattern)
   - Click **Add Custom Domain**

**Expected result:** Cloudflare automatically creates/replaces your DNS records to point at the worker. You'll see:
- Apex `A` record → proxied Worker record (`75.2.60.5` IP changes to Cloudflare's proxy IPs)
- `www` CNAME → proxied Worker record

**Verify the DNS migration:**
```bash
dig qyouthnz.com
```
Expected: The answer section shows Cloudflare's IPs (should look like `104.21.x.x` or `172.67.x.x`).

```bash
dig MX qyouthnz.com
```
Expected: MX records are **unchanged** and still point to Google Workspace (e.g., `aspmx.l.google.com`).

```bash
curl -sI https://qyouthnz.com | grep -i server
```
Expected: Header shows `Server: cloudflare` (or similar).

**If MX or SPF records are missing or broken, stop here and restore them immediately — your email is down until you fix it.**

---

## Step 8: Post-Cutover Verification

Run these checks to confirm everything is working:

### Homepage and blog load
```bash
curl -sI https://qyouthnz.com/
```
Expected: `200 OK`, HTML body renders (view in a browser to be sure).

```bash
curl -sI https://qyouthnz.com/blog.html
```
Expected: `200 OK`.

### Preload headers present
```bash
curl -sI https://qyouthnz.com/ | grep -i link
```
Expected: One `Link:` header line containing three comma-separated preloads — `</styles.css>; rel=preload; as=style`, `</site-content.js>; rel=preload; as=script`, and `</site-data.json>; rel=preload; as=fetch; crossorigin` (matches `public/_headers`).

### Studio Access gate works
1. Open a browser and go to `https://qyouthnz.com/studio/`
2. **Expected:** You're redirected to Cloudflare Access login
3. Enter your `@qyouthnz.com` email and a one-time code (sent to your email)
4. **Expected:** You're logged in and see the studio dashboard

### Runner heartbeat
1. On your PC, start the runner:
   ```bash
   cd /path/to/qsite/runner
   python3 runner.py
   ```
   (Ensure `.env` has `STUDIO_URL=https://qyouthnz.com`)

2. In the studio dashboard, look for **"Runner: online"** in the top bar
   - Should appear within ~3 minutes of starting the runner
   - If it says "offline", check `runner/.env` and the console output for errors

### Test a manual blog post
1. In the studio, create a new idea (manual entry, not via AI agent)
2. Fill in title, body, and mark it as **approved** → **publish**
3. **Expected:** The studio shows a GitHub commit in the feed, and the post appears on `blog.html`

### Non-admin user sees composer, not AI panel
1. From another browser or incognito window, log into the studio with a non-admin `@qyouthnz.com` email
2. **Expected:** You see the idea composer form but NOT the "AI Research" / "Drafting" / "Reflecting" pipeline panels

---

## Step 9: Decommission Netlify

1. Go to **Netlify Dashboard** → select `qsite` → **Site settings** (left sidebar)
2. Scroll to the bottom and click **Delete site**
3. Confirm the deletion

**What you're removing:**
- The Netlify CI build (no longer needed; Cloudflare Workers Build is running)
- The Netlify domain redirect (no longer needed; Cloudflare is now the authoritative host)
- The Netlify Identity gates (replaced by Cloudflare Access)

**What survives:**
- The Neon database (it's now under your Neon account; Netlify no longer manages it)
- Your git history (nothing deleted from GitHub)
- The values you recorded in Step 2 (keep them safe if you ever need to debug the old environment)

**Optional cleanup on your PC:**
```bash
rm -rf .netlify/
npm uninstall -g netlify-cli
```
(Only do this if you don't use Netlify for other projects.)

---

## Step 10: Never Set DEV_USER_EMAIL in Production

**This is a security note, not a cutover step.**

In your codebase, the `.dev.vars` file may contain:
```
DEV_USER_EMAIL=nate@qyouthnz.com
```

This variable **bypasses Cloudflare Access entirely** and is dev-only. It works in `wrangler dev` to let you test without logging in.

**Ensure it is NEVER in:**
- `wrangler.jsonc` (production config)
- Cloudflare dashboard secret list
- Any production environment variable

**Check now:**
```bash
grep -r DEV_USER_EMAIL wrangler.jsonc
```
Expected: No match (empty output means it's safe — only `.dev.vars` has it).

If you find it in wrangler.jsonc, remove it immediately and redeploy.

---

## Appendix: After You're Done

- **Verify studio behavior** under load (a few test publishes)
- **Monitor Cloudflare analytics** for a few days (Workers → `qsite` → Analytics)
- **Set up Cloudflare email routing** if you want to use `noreply@qyouthnz.com` for automated emails (optional, out of scope here)
- **Back up Neon database regularly** (Neon has automated backups; check your account settings)

**You're done. The site is now running on Cloudflare Workers + Neon, with Cloudflare Access protecting the studio.**
