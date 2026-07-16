# Q Youth Blog Studio — Design

**Date:** 2026-07-16
**Status:** Approved by Nate


> **Requirement from Nate (2026-07-16, incorporated below):** users other than Nate can
> log in and update the blog manually. Only Nate can use the AI agent pipeline.

## Purpose

A hosted dashboard for researching, drafting, reviewing, and publishing posts to the
qyouthnz.com blog. Architecture mirrors yt-agent-studio (idea queue → agent pipeline →
human review → publish) but rebuilt for Netlify hosting instead of a local Streamlit
server. Accessible from anywhere at an unlisted, login-protected path.

## Context / current state

- qyouthnz.com is already served by Netlify (manual drag-and-drop deploys). GoDaddy
  holds only the domain + DNS (nameservers `ns05/ns06.domaincontrol.com`, apex A →
  `75.2.60.5`). Mail is Google Workspace MX — independent of web hosting, never touched.
- The GoDaddy "Websites + Marketing Basics" subscription serves no function if domain
  registration is a separate line item. Nate to verify in the GoDaddy account before
  cancelling. Do not cancel if the domain is bundled.
- Qsite is not yet a git repo. Blog posts live in `site-data.json` (`blog` array),
  rendered client-side by `site-content.js` into blog.html.

## Decisions made

| Decision | Choice |
|----------|--------|
| Blog target | Q Youth blog (`site-data.json`) |
| Agent runtime | Local — Nate's PC, Claude Code subscription (zero API cost) |
| Hosting | Existing Netlify site, git-connected deploys |
| Queue storage | **Netlify Database (Postgres)** — chosen over git-as-database for snappier UI and cleaner concurrent access |
| Auth | Netlify Identity (`@netlify/identity`, NOT the deprecated widget), invite-only signups — Nate + a few trusted others |
| Roles | `admin` (Nate): full AI pipeline + manual posting. `editor` (everyone else): manual posting only. Enforced server-side via the Identity JWT roles claim, not just hidden in the UI |
| Publish safety | Human must click Approve & Publish; agents can never publish |

## Architecture

```
Nate's PC                          Netlify                         GitHub
┌─────────────┐   poll/claim   ┌──────────────────┐   commit    ┌─────────┐
│ runner.py    │ ─────────────▶ │ Functions (API)  │ ──────────▶ │ Qsite   │
│ (claude CLI) │ ◀───────────── │  + Netlify DB    │  publish    │ repo    │
└─────────────┘   job + post   └──────────────────┘             └────┬────┘
                    results          ▲    JWT                        │ auto-deploy
                               ┌─────┴────────┐                      ▼
                               │ /studio SPA  │              qyouthnz.com
                               │ (Identity)   │              (public site)
                               └──────────────┘
```

## Components

### 1. Phase 0 — repo + deploy pipeline (prerequisite)

- `git init` Qsite, push to a GitHub repo, connect the existing Netlify site to it.
- Restructure so only public files deploy: local-only tooling (`editor.py`,
  `editor.html`, `editor-inject.js`, `launch.*`, `docs/`) must not be served on the
  live site — via a `public/` publish directory or netlify.toml excludes (exact
  mechanism decided in the implementation plan).
- `/studio` gets `noindex` and stays out of sitemap.xml.
- From phase 0 on, deployment = git push (replaces manual drag-and-drop).

### 2. Data model (Netlify DB, Drizzle ORM)

- `ideas`: id, title, notes, source (`agent` | `manual`), status, error, created_at,
  updated_at — manual posts skip the agent stages and are created at `ready`
- `drafts`: id, idea_id, version, brief, title, body, reflection_notes,
  image_refs, created_at
- Every agent revision inserts a new `drafts` version row — full history, rollback.

Statuses: `pending → researching → drafting → reflecting → ready → approved →
published`, plus `failed` (error message stored and shown, never silent).

### 3. Netlify Functions (API)

- CRUD for ideas and drafts.
- Auth: dashboard requests require a valid Netlify Identity JWT; the runner
  authenticates with a shared-secret bearer token (env var on both sides).
  Unauthenticated requests are rejected — no public endpoints.
- Role enforcement (server-side, per endpoint): AI-pipeline endpoints (agent idea
  intake, stage transitions, runner claiming) require the `admin` role; manual
  draft/publish endpoints accept `admin` or `editor`.
- Job claiming: runner atomically claims one `pending`/stage-ready job (status
  transition guards against double-claiming).
- `publish` function: takes an approved draft, prepends the post to the `blog`
  array in `site-data.json` (matching the existing blog post shape site-content.js
  renders), commits it plus any post images to `images/` via the GitHub API,
  marks the idea `published`. GitHub token stored as a Netlify env var.

### 4. Local runner (`runner.py`)

- Python script in the Qsite repo (local-only, not deployed).
- Polls the API every 1–2 min; claims one job; shells out to `claude` (Claude Code
  CLI, Nate's subscription) for the stage prompt; posts results; advances status.
- Stages: **research** (brief with sources, NZ/Te Tau Ihu context where relevant) →
  **draft** (post per style guide) → **reflect** (critique against style guide;
  revise or flag).
- `blog_style_guide.json`: Q Youth voice; privacy-first (no identifying details of
  rangatahi, no outing); age-appropriate; evidence-based; no toxic positivity;
  NZ English.
- All failures write the `error` field. Dry-run mode fakes Claude output for testing.
- PC off = queue waits; dashboard review/approve still works from anywhere.

### 5. Dashboard SPA (`/studio`)

- Static JS app (no framework requirement beyond what the implementation plan picks;
  keep it light — the public site is plain HTML/JS).
- Two faces by role, driven by the Identity JWT:
  - **Everyone (`editor` + `admin`):** "New post" composer — title, date, body,
    optional image + alt text, optional link (the `site-data.json` blog post shape) —
    with save-draft and **Publish** buttons.
  - **Nate only (`admin`):** the AI pipeline — queue board with status
    colours/progress (visual kin of the Streamlit dashboard), idea intake form,
    brief viewer, draft editor (hand-edit before approving), reflection notes,
    version history, **Approve & Publish**, and a "runner last seen" indicator
    (runner heartbeats via the API).

## Error handling

- Every function returns explicit error JSON; SPA surfaces errors in the UI.
- Runner wraps every stage; any exception → status `failed` + error text.
- Publish is idempotent-guarded: re-publishing an already-published idea is a no-op
  with a visible message.

## Testing

- Unit tests for functions: auth rejection (no JWT, bad runner token), role
  enforcement (`editor` blocked from AI-pipeline endpoints), legal/illegal
  state transitions, double-claim prevention, publish merge logic.
- Publish merge tested against a fixture copy of `site-data.json`.
- Runner tested in dry-run mode end-to-end through all stages.

## Out of scope (this spec)

- **Phase 2 — hosted site editor** at `/editor`: same Identity login, save = commit
  via the GitHub-commit function this project builds. Separate spec after Blog
  Studio ships. Feasibility confirmed: `editor-inject.js` already serializes
  client-side; `editor.py`'s BeautifulSoup save logic moves into a function.
- Cancelling the GoDaddy subscription (Nate verifies domain bundling manually).
- Migrating DNS or nameservers — nothing DNS-side changes at all.
