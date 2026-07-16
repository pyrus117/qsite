# Blog Byline, Greeting & Runner Images — Implementation Plan (2026-07-17)

Spec: `docs/superpowers/specs/2026-07-17-blog-byline-image-design.md`. Two tasks, sequential (both touch publish/blogMerge/site-content).

## Global constraints

- Greeting is EXACTLY `Kia Ora Peers and Queers,` — own first line of body, blank line after.
- Byline text: `by Nate`, only when a post has `author`; posts without `author` must render byte-identically to today.
- `author` is set by publish.ts ONLY when `idea.source === "agent"`, value `"Nate"`.
- Image step must be fail-soft: no failure in find/download/upload may fail the draft stage.
- Image sources must be reuse-licensed (Wikimedia Commons / Unsplash / Pexels or similar); `imageCredit` names creator + source.
- Download guards: 30s timeout, ≤3MB, extension in jpg/jpeg/png/webp/gif; filename = slugged post title.
- Runner image endpoint reuses the SAME validation as images.ts via a shared `_shared/` helper (no duplicated validation logic).
- Editor blog edits must preserve keys the form doesn't know (`author`, `imageCredit`, future fields).
- Run tests: `.venv/bin/python -m pytest tests/runner/` and `npm test`. Commit per task on main, no push.

## Task A — Byline + greeting + retrofit

1. `netlify/functions/_shared/blogMerge.ts`: `BlogPost` gains `author?: string`; clean object includes it when present.
2. `netlify/functions/publish.ts`: pass `author: "Nate"` into `mergePost` when `idea.source === "agent"`.
3. `public/site-content.js` `renderBlog`: when `post.author`, append byline ("by Nate") after the date element; class `blog-post-author`.
4. `public/styles.css`: `.blog-post-author` — small, muted, consistent with `.blog-post-date`.
5. `runner/runner.py`: draft prompt — body opens with the exact greeting line (after TITLE:); reflect prompt — preserve greeting verbatim; backstop `_ensure_greeting(body)` applied to draft body and reflect revised_body.
6. `editor.html` `saveModal` (`add-b`/`ed-b`): on edit, spread `D.blog[mCtx]` into the new object first so unknown keys survive.
7. Retrofit `public/site-data.json`: Pride Week post (`title` starts "250-plus schools") gets `"author": "Nate"` and greeting + blank line prepended to `body`.
8. Tests — pytest: draft prompt contains greeting instruction; backstop prepends when absent, doesn't double when present (draft + reflect). vitest: blogMerge author passthrough + omission.

## Task B — Runner image pipeline

1. `db/schema.ts`: `drafts.imageCredit` varchar("image_credit", 255). Run `npm run db:generate` (drizzle migration folder is committed; applied at deploy — do NOT try to apply against prod locally).
2. New `netlify/functions/_shared/imageUpload.ts` (or similar): filename + base64 validation extracted from `images.ts` (SAFE_NAME regex, data-URI strip, 4.5M base64 cap); `images.ts` refactored to use it.
3. `netlify/functions/runner.ts`: update action accepts `body.draft.image / imageAlt / imageCredit` with `?? latest?.x ?? null` fallbacks; new action `"image"` — validates via shared helper, `putBinaryFile("public/images/<name>", …)`, returns `{filename}`.
4. `netlify/functions/publish.ts` + `blogMerge.ts`: `imageCredit?` passthrough (post JSON field `imageCredit`).
5. `public/site-content.js` `renderBlog`: `img.setAttribute('data-attribution', post.imageCredit)` when present.
6. `runner/runner.py` draft stage sub-step (after body generated, inside try/except → warn + continue):
   - claude call (tools WebSearch,WebFetch): return JSON only `{image_url, page_url, alt, credit, license}` or `null` — reuse-licensed image relevant to the post.
   - download with urllib (UA header, timeout 30, cap 3MB, allowed extensions), filename = slug(title) + ext.
   - `api("/api/runner/image", {filename, data: base64})`.
   - merge `image/imageAlt/imageCredit` into the draft payload sent with status `reflecting`… (image fields ride the SAME update call as the draft body).
   - dry-run: skip image step entirely.
7. `editor.html`: blog form gains "Image credit" input (`f-bcredit`) wired into save; preserved-keys spread from Task A already covers posts edited without the field.
8. Tests — pytest: image JSON parse (valid/null/garbage); fail-soft (mocked download raises → draft still sent, no image fields); slug/extension logic; size/extension rejection. vitest: shared validation helper (good/bad filenames, oversize, data-URI strip); blogMerge imageCredit passthrough.
