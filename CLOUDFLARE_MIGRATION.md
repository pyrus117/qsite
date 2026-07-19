# Qsite → Cloudflare migration — handoff note

**Written 2026-07-19.** Goal: move this site off Netlify entirely and onto Cloudflare,
so both Qsite and the intranet run one stack (Cloudflare + GitHub push-to-deploy).

**Why now:** DNS is already on Cloudflare, and *no staff have logged in yet* — so there
are no Identity users or production data to migrate. This is the cheapest this migration
will ever be. Every week of real use raises the cost.

**Working reference:** the Q-Youth **intranet** is already fully on this target stack
(Cloudflare Workers static-assets + Access gate + GitHub auto-deploy). See its memory note
`project-qyouth-intranet` and repo `pyrus117/qyouth-intranet`. Copy its patterns.

> Suggest a fresh session run this through **brainstorming → writing-plans** and produce a
> proper spec in `docs/superpowers/plans/` before executing. This note is the input, not the plan.

---

## Current Netlify-specific surface (what has to move)

- **Functions** (`netlify/functions/*.ts`): `ideas`, `drafts`, `images`, `publish`, `runner`
  + `_shared/` (`http`, `auth`, `github`, `blogMerge`, `transitions`, `imageUpload`).
  Netlify Functions = AWS Lambda / Node handler signature.
- **Database**: Netlify DB (**Postgres, actually Neon under the hood**), Drizzle ORM.
  Schema `db/schema.ts`, migrations `netlify/database/migrations/`, `drizzle.config.ts`
  (dialect postgresql). Migrations applied via `netlify database migrations apply`.
- **Auth**: Netlify **Identity** (`@netlify/identity`), validated in
  `netlify/functions/_shared/auth.ts`. Gates the Blog Studio editor + admin functions.
- **Runner**: `runner/runner.py` (Python) — AI blog generation; commits via
  `GITHUB_TOKEN`/`GITHUB_REPO`, triggered with `RUNNER_TOKEN`. **Hosting home is the open
  question** (see below).
- **Build**: esbuild bundles `studio-src/studio.js` → `public/studio/studio.js`
  (`npm run build`). Publish dir = `public/`.
- **Config**: `netlify.toml` (headers, any redirects), `.netlify/` link.
- **Env vars** seen in code: `GITHUB_REPO`, `GITHUB_TOKEN`, `RUNNER_TOKEN` (+ `NETLIFY_DB_URL`
  injected by Netlify, + Identity config). **Get exact values from the Netlify site → Env.**

## Target Cloudflare mapping

| Netlify piece | Cloudflare target | Notes / difficulty |
|---|---|---|
| Static `public/` | Worker with static assets (`wrangler.jsonc`, `assets.directory=./public`) | Easy — mirror the intranet's setup |
| Functions (Lambda/Node) | Workers / Pages Functions (fetch handler) | **Medium** — port each: `event`→`fetch(request, env)`, check Node APIs (Buffer/crypto/streams) |
| Netlify DB (Neon Postgres) | **Keep the same Neon DB**; connect via `@neondatabase/serverless` (Drizzle `neon-http`) or Cloudflare Hyperdrive | Data does NOT move. Claim/get the Neon connection string from Netlify DB. Avoid D1 (SQLite = dialect + data migration) |
| Netlify Identity | **Cloudflare Access** in front of `/studio` + admin function routes | **Hardest.** No users to migrate. Rework `auth.ts` to validate the Access JWT (`Cf-Access-Jwt-Assertion`) instead of Identity. Roles → Access policies/groups |
| esbuild build | same, in Cloudflare Workers Builds CI (`npm run build`) | Easy |
| `netlify.toml` headers/redirects | `_headers` / `_redirects` (+ wrangler config) | Easy |
| `runner.py` (long-running Python) | **OPEN** — Workers don't run arbitrary long Python | See open questions |

## Rough sequence (validate in the spec)

1. Add `wrangler.jsonc` (assets = `public/`, plus a fetch handler routing `/api/*` or
   `/.netlify/functions/*` equivalents). Get a `*.workers.dev` deploy green first.
2. Port Functions one at a time; keep the public site working throughout.
3. Repoint DB: get Neon connection string, swap Drizzle driver to neon-serverless, set the
   connection as a Worker secret. Re-run migrations against the same DB (no data change).
4. Replace Identity with Access: gate `/studio` + admin routes, rewrite `auth.ts` to trust
   Access. Define who's allowed (Access policy — likely `@qyouthnz.com`, maybe a smaller
   editor allow-list for publish rights).
5. Solve the runner (below).
6. Add `qyouthnz.com` + `www` as custom domains on the Worker. **Cut over DNS last:** flip
   the apex `A`/`www` `CNAME` from Netlify (`75.2.60.5` / `*.netlify.app`) to the Worker.
7. Decommission the Netlify site.

## Gotchas / must-preserve

- **DO NOT touch MX / SPF / TXT** during the DNS cutover — email is Google Workspace and
  those records must stay (the nested SPF is `dc-aa8e722993._spfm`). Only change the
  website records (apex `A`, `www`). DNS is already on Cloudflare, so this is low-risk.
- Cloudflare merged Pages into Workers — use **"Worker with static assets"**, not the
  (now hidden) Pages flow. Same as the intranet.
- Access gate only covers proxied (orange-cloud) hostnames — the Worker custom domain is
  proxied automatically.
- Keep the repo private; it holds tokens history.

## Open questions to resolve in the spec

1. **Runner hosting.** Where does `runner.py` run now (Netlify background/scheduled fn, or
   separate)? Options on/near Cloudflare: rewrite as a Worker (JS/TS), Cloudflare **Python
   Workers** (beta — check limits/runtime), a Cron Trigger + Queue, or keep it on a small
   external host that Cloudflare calls via `RUNNER_TOKEN`. Decide based on how heavy/long it is.
2. **DB path:** Neon serverless driver vs Cloudflare Hyperdrive (Hyperdrive pools + hides the
   string; nicer for TCP Postgres). Pick one.
3. **Editor roles:** how granular? Access group(s) vs a simple editor allow-list.
4. Confirm all env vars/secrets from the Netlify dashboard before deleting the Netlify site.
