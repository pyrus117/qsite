# Blog Byline, Sign-on Greeting & Runner Images — Design (2026-07-17)

Approved by Nate 2026-07-17 (byline: runner posts only; greeting: opening line of body; retrofit: Pride Week post only; images: always try, must be attributed; push when done).

## 1. Byline — "by Nate" on runner posts

Runner-pipeline posts show a byline; manual posts don't. No schema change: `publish.ts` already loads the idea, so when `idea.source === "agent"` it adds `author: "Nate"` to the post object passed to `mergePost`. Accurate because only the admin (Nate) can publish agent posts and Nate is the only runner user. Revisit if that changes.

- `site-data.json` blog posts gain optional `author` (string).
- `blogMerge.ts` `BlogPost` type + clean-object gain `author?`.
- `renderBlog` (site-content.js): when `post.author`, render a small byline element ("by Nate") beside/after the date; new `.blog-post-author` class in styles.css, muted styling matching the date. Posts without `author` render exactly as today.

## 2. Sign-on greeting — "Kia Ora Peers and Queers,"

Every runner-written post opens with exactly `Kia Ora Peers and Queers,` as its own first line of the body (blank line after it). Two layers:

1. **Prompts** (runner.py): draft prompt instructs the body to open with that exact line (after the TITLE: line); reflect prompt instructs the line be preserved verbatim.
2. **Deterministic backstop** (runner.py): after draft and after reflect parsing, if the body doesn't start with the greeting, prepend `greeting + blank line`. Code enforces what prompts request.

## 3. Retrofit

Pride Week post in `public/site-data.json` gets `"author": "Nate"` and the greeting prepended as its first line. Welcome post untouched. No image retrofit (live post stays text-only).

## 4. Runner images — always try, always attributed

New sub-step inside the draft stage (after the body is generated, before status moves to reflecting):

1. **Find**: a claude CLI call with WebSearch/WebFetch, prompted to return JSON only: `{image_url, page_url, alt, credit, license}` — an image relevant to the post from a source whose license permits reuse (Wikimedia Commons, Unsplash, Pexels, or similar); `credit` must name creator + source (e.g. "Photo: Jane Doe / Unsplash"); return `null` if nothing suitable.
2. **Download** (runner.py, urllib): UA header, 30s timeout, reject > 3MB or extension not in jpg/jpeg/png/webp/gif. Filename = slug of post title + extension.
3. **Upload**: new runner-token endpoint `POST /api/runner/image` (`runner.ts` action `"image"`), same validation as `images.ts` (safe filename, base64 size cap) — validation extracted to a shared helper in `_shared/` used by both endpoints — then `putBinaryFile` to `public/images/` (commits to GitHub → deploys).
4. **Record**: draft payload includes `image`, `imageAlt`, `imageCredit`.

**Fail-soft everywhere**: any failure in find/download/upload logs a warning and the post proceeds without an image ("always *try*"). A post is never blocked by the image step.

### Attribution plumbing
- `drafts` table gains `imageCredit` (varchar 255) — drizzle migration via `npm run db:generate` (applied automatically at deploy).
- `runner.ts` update action accepts `body.draft.image/imageAlt/imageCredit` (falling back to latest, as other fields do).
- `publish.ts`/`blogMerge.ts` pass `imageCredit` through to the published post.
- `renderBlog`: sets `data-attribution` on the `<img>` from `post.imageCredit` (blog.html already loads image-attribution.js → hover tooltip).

## 5. Local editor compatibility

`editor.html` `saveModal` rebuilds blog post objects from form fields, which would drop `author`/`imageCredit` on edit. Fix: spread the original post into the new object on edit so unknown keys survive. Add an "Image credit" input to the blog form for parity.

## 6. Testing

- pytest (tests/runner/): greeting instruction present in draft prompt; backstop prepends when missing (draft + reflect paths); image-candidate JSON parsing incl. null/invalid; fail-soft on download/upload error (mocked); draft payload carries image fields; filename slugging.
- vitest (tests/functions/): blogMerge passes through `author` and `imageCredit`; shared image-validation helper (filename/size rules) unit-tested.

## Out of scope

Studio UI image preview; bylines for manual/editor posts; image retrofit for live posts; multi-admin author resolution.
