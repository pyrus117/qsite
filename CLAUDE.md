# Q Youth NZ — Site Project Tracker

## What This Is
Charity website for Q Youth NZ (qyouthnz.com) — static HTML/CSS/JS site in `public/`, plus the **Blog Studio**: a login-protected dashboard at `/studio/` (Cloudflare Worker + Neon Postgres via Drizzle) where invited users publish blog posts and Nate runs an AI research→draft→reflect pipeline.
LGBTQIA+/Takatāpui rangatahi support organisation, Nelson/Tasman, New Zealand.

## File Inventory

| Path | Purpose |
|------|---------|
| `public/` | **Everything deployed** — the 10 site .html files, `styles.css`, `icons.svg`, `site-data.json`, `site-content.js`, `image-attribution.js`, `robots.txt`, `images/`, `resources/` (no static sitemap — the worker generates it) |
| `public/index.html` | Homepage (hero, CTA banner, stats, sponsors banner, programmes, about, events, newsletter, contact) |
| `public/blog.html` | Blog — posts rendered from site-data.json `blog` array, newest first |
| `public/site-data.json` | Sponsors, directory, resources, blog posts — rendered at runtime by `site-content.js` |
| `public/studio/` | Blog Studio SPA (`index.html`, `studio.css`; `studio.js` is a gitignored esbuild artefact) |
| `studio-src/studio.js` | Studio SPA source — bundled by `npm run build` |
| `worker/index.ts` | Worker entry — route table + `matchRoute`; studio API is `/studio/api/*` (behind Cloudflare Access), runner API stays `/api/runner/*` (bearer `RUNNER_TOKEN`, outside Access) |
| `worker/blogPages.ts` | SEO pages served by the worker: `/blog/<slug>` (server-rendered post pages from site-data.json + blog.html as template), `/sitemap.xml`, `/blog/feed.xml` (RSS). Slugs derive from titles — `slugify` here must stay identical to `_slugify` in `site-content.js` |
| `worker/api/` | Endpoints: `ideas.ts`, `drafts.ts`, `runner.ts`, `publish.ts`, `images.ts`, `me.ts` |
| `worker/_shared/` | Helpers: `auth.ts`, `http.ts`, `github.ts`, `blogMerge.ts`, `imageUpload.ts`, `transitions.ts` |
| `db/migrations/` | Drizzle migrations — applied manually with `npm run db:migrate` |
| `db/schema.ts`, `db/index.ts` | Drizzle schema (ideas, drafts, runner_heartbeat) + `getDb()` client (`drizzle-orm/neon-http`) |
| `runner/runner.py` | Local AI runner — polls the studio API, runs claude CLI stages (config in `runner/.env`) |
| `runner/blog_style_guide.json` | Voice/rules/structure fed into every runner prompt |
| `wrangler.jsonc` | Worker config — vars, dev settings; deploy runs `npx wrangler deploy` |
| `public/_headers` | Ported response headers (was `netlify.toml` headers block) |
| `tests/worker/` (vitest), `tests/runner/` (pytest via `.venv/bin/python -m pytest`) | Test suites |
| `editor.py`, `editor.html`, `editor-inject.js`, `launch.*` | Local site editor (edits files under `public/`) — never deployed |
| `docs/superpowers/` | Blog Studio spec + implementation plan |

## Deployment Workflow

Hosting is **Cloudflare Workers**, git-connected via Workers Builds to `pyrus117/qsite` branch `main` — deployment is a `git push`:

1. Edit content (local editor or by hand) → files change under `public/`
2. Commit and `git push` — Cloudflare runs `npm run build` then `npx wrangler deploy`
3. **A Save in the local editor no longer deploys anything** — changes go live only on push
4. Blog posts published via the Studio commit `public/site-data.json` straight to GitHub → auto-deploy; no local step
5. DB migrations are **not** applied at deploy — run manually: `DATABASE_URL=… npm run db:migrate`
6. Rollback: Workers → Deployments → previous deployment → **Rollback**

## Blog Studio

- URL: `https://qyouthnz.com/studio/` (noindex; **Cloudflare Access**, invite-only — Zero Trust app on `qyouthnz.com/studio`, invite = add the email to the Access policy)
- Roles (server-side enforced from the `Cf-Access-Jwt-Assertion` JWT): `ADMIN_EMAILS` var → **admin** (Nate — AI pipeline, approve, publish anything), any other allowed email → **editor** (manual posting only)
- Idea statuses: `pending → researching → drafting → reflecting → ready → approved → published` (+ `failed`); illegal transitions rejected server-side; only humans can approve/publish
- **The AI stages only run while `runner/runner.py` is running on Nate's PC** (polls with `RUNNER_TOKEN`; heartbeat shows as "Runner: online" in the studio)
- Secrets (`wrangler secret put`): `DATABASE_URL`, `RUNNER_TOKEN`, `GITHUB_TOKEN` (fine-grained PAT, Contents R/W on qsite only)
- Vars (`wrangler.jsonc`): `GITHUB_REPO`, `ADMIN_EMAILS`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`

## Editor Usage

```
Windows:  double-click launch.vbs
Linux:    double-click launch.sh (or: python3 editor.py)
Mac:      double-click launch.command (or: python3 editor.py)
```

Browser opens at http://localhost:8080/editor automatically.

**Click anything with a blue outline in the preview to edit it.**

Sidebar panels:
- **Edit Text** — appears when you click editable text in the preview
- **Sponsors** — add/reorder/remove sponsor logos
- **Directory** — add/reorder/remove local organisations
- **Resources** — add/edit/remove resource items; PDFs upload via file picker (saved to `resources/`), videos accept a pasted YouTube embed iframe (rendered as an inline player), links take a URL
- **Blog** — add/edit/remove posts (title, date, body with blank-line paragraph breaks, optional image + alt text, optional "Read more" link). Posts show newest-first on blog.html. Images upload to `images/`
- **Image** — click any image to replace it, set a background colour, add an **Attribution / credit** (shown on hover via `image-attribution.js`, stored as `data-attribution` on the `<img>`), and crop/zoom: **X/Y sliders** pan the visible area, **Zoom** (100% = fills frame) crops in. Uses `object-fit: cover` + `object-position` + `transform`. **Save Page** writes the result to the HTML file.

## Completion Criteria

### Editor App
- [x] `editor.py` starts HTTP server on port 8080
- [x] Browser opens automatically on launch
- [x] `launch.vbs` created for Windows (pythonw = no console window)
- [x] `launch.sh` created for Linux/Mac
- [x] Split-pane layout: sidebar (360px) + iframe preview (flex: 1)
- [x] Page selector dropdown lets user switch between all 10 pages
- [x] Editable elements show blue/pink dashed outlines on hover
- [x] Clicking editable element opens Text Edit panel in sidebar
- [x] Typing in sidebar textarea updates element in preview in real-time
- [x] "Save to Page" writes change to HTML file on disk (BeautifulSoup4)
- [x] Sponsors panel: list, add, edit, delete, reorder
- [x] Directory panel: list, add, edit, delete, reorder
- [x] Resources panel: groups + items, add, edit, delete
- [x] Structured data save writes to site-data.json
- [x] GET /api/pages returns all 10 pages for page selector
- [x] Device width toggle: Desktop / Tablet / Mobile

### Content Editable (data-editable attributes)
- [x] index.html: hero-title, hero-sub, about-title, about-body-1/2/3, data-edit-panel="sponsors"
- [x] All inner pages: page-title, page-desc in page hero
- [x] local-directory.html: data-edit-panel="directory"
- [x] resources.html: data-edit-panel="resources"
- [x] blog.html: data-edit-panel="blog"
- [x] index.html: cta-banner-title, cta-banner-text

## Verification Loop

Run after each significant change:

```bash
# 1. Python syntax check
python3 -m py_compile editor.py && echo "OK"

# 2. JSON valid
python3 -c "import json; json.load(open('public/site-data.json'))" && echo "OK"

# 3. No nested anchors
python3 -c "
import glob, re
bad = [f for f in glob.glob('public/*.html') if re.search(r'<a[^>]+><a', open(f).read())]
print('NESTED ANCHORS:', bad or 'none')
"

# 4. All HTML files present
python3 -c "
import os
pages = ['index','drop-ins','young-adults','events','education','local-directory','resources','get-involved','privacy-policy','blog']
missing = [p for p in pages if not os.path.exists('public/'+p+'.html')]
print('MISSING:', missing or 'none')
"

# 5. Worker + runner test suites
npm test
.venv/bin/python -m pytest tests/runner/

# 6. Start and test server (manual - press Ctrl+C after checking)
# python3 editor.py
# Then visit http://localhost:8080/editor
```

## Known Issues / Notes

- Hosting moved from GoDaddy to Netlify (git-connected) 2026-07-16, then Netlify to **Cloudflare Workers** (git-connected via Workers Builds) 2026-07-19 — any GoDaddy/cPanel or Netlify-specific instructions you find elsewhere are obsolete
- Local dev: `npm run dev` (wrangler dev, serves site + API on :8787). Access is absent locally — `DEV_USER_EMAIL` in `.dev.vars` stands in for a logged-in user and must never be set as a production var
- sponsor logo filenames have spaces — handled by encodeURIComponent in site-content.js
- Google Calendar iframe embed uses calendar ID: e12d0...@group.calendar.google.com
- BeautifulSoup4 needed for HTML editing: `pip install beautifulsoup4`
- Privacy Policy covers NZ Privacy Act 2020, mentions Google Analytics
- Homepage section order: hero → **CTA banner** → stats → **sponsors banner** → programmes → about → events → newsletter → contact
- The sponsors marquee, directory list, and resources list are rendered at runtime by `site-content.js` into empty containers (`#sponsor-marquee`, `#directory-list`, `#resources-container`, `#blog-container`). `editor-inject.js` empties these before saving a page, so their output is never baked into the HTML (otherwise each save duplicated them)
- **HEIC images don't render in browsers** — convert to JPG/WebP before use (e.g. `heif-convert in.heic out.jpg` then resize/compress); the editor preview uses the image's natural size, so a non-loading image makes the crop/zoom sliders appear dead
- After editing `editor.html`/`editor-inject.js`, **hard-reload** the editor tab (Ctrl+Shift+R); the open tab also caches `site-data.json`, so reload before clicking Save to avoid overwriting on-disk JSON edits
- Resource videos store the full `<iframe>` embed code in the item's `url`; `renderResources` strips its width/height and wraps it in a responsive 16:9 `.resource-embed`
- Image credits live in a `data-attribution="..."` attribute on the `<img>`; `image-attribution.js` shows them as a hover tooltip and must be included (`<script src="image-attribution.js" defer></script>`) on any new page that has images
- Canonical/og/schema/sitemap URLs use the **apex domain** (`https://qyouthnz.com`) and are **extensionless** (`/blog`, not `/blog.html`) — Cloudflare's asset layer 307s `*.html`→extensionless, so never put `www.` or `.html` in absolute metadata URLs (relative nav links keep `.html`; the redirect handles them)
- **`www.qyouthnz.com` has had no DNS record since the Cloudflare migration** (found 2026-07-21— the old "301s www→apex" behaviour died with Netlify). Fix is dashboard-only: DNS AAAA `www`→`100::` (proxied) + a 301 redirect rule www→apex. Until then any `www.` link is dead
- **SEO (2026-07-21):** every page has a full OG set + `og:image` (`images/og-default.jpg`, 1200×630, regenerate with ImageMagick) + `twitter:card`; blog posts get real URLs at `/blog/<slug>` server-rendered by `worker/blogPages.ts` (post pages carry BlogPosting JSON-LD, per-post canonical/OG, and a `<base href="/">` because they live one path level down); sitemap + RSS are worker-generated from site-data.json, so publishing a post updates both automatically. **Renaming a post's title changes its URL** (slug = slugified title) — avoid retitling published posts
- The homepage **CTA banner** (`.cta-banner`, between hero and stats bar) links to blog.html; its heading/text are `data-editable` (`cta-banner-title`/`cta-banner-text`). Post topical issues as blog posts. Banner gradient starts at `#DB2777` (not `--color-secondary`) for WCAG AA contrast with white text
- Never let saved pages contain base64 `data:image` URIs — they bloated three pages by up to 279KB each (fixed 2026-07-16 by extracting to `images/*.webp`). If an `<img src>` shows `data:image/...` after an editor save, extract it to a file
- Sponsor entries in site-data.json carry `width`/`height` (real pixel dims) that `site-content.js` puts on the marquee `<img>` for Lighthouse's unsized-images audit; new sponsor logos get dims added manually or via `magick identify`
