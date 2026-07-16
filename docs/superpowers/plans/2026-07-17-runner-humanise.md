# Runner Humanise + Generated Titles — Plan Overview (2026-07-17)

Hand-off plan. Context: the runner's first published post was factually strong but read as AI-written. Nate also wants the studio prompt to stop becoming the post title. All changes are in `runner/` — **no server/function changes needed** (`netlify/functions/runner.ts:51` already accepts `draft.title`, falling back to the idea title; `publish.ts` publishes `draft.title`).

## The AI tells to eliminate (diagnosed from the live post)

- Fragment-stacking in threes ("Not the fastest. Not the flashiest. But…")
- "Here's the thing / part / takeaway" signposting
- One-word rhetorical Q&A ("And honestly?")
- "It's not X, it's Y" reversals
- Standalone affirmation one-liners ("You belong here.")
- Tidy metaphor-callback endings (the "bow")
- Em-dash overload (8+ in one post)

## Changes

### 1. `runner/blog_style_guide.json`
- `voice`: add writing references — Queerty's cheeky pop-culture energy, Jammidodger's warm self-deprecating banter, The Click's dry wit — anchored with "kind, never mean, age-appropriate" (readers as young as 11).
- `structure`: **remove** "Hook, why it matters, where to learn more, fun sign off" — that phrasing directly caused the formulaic opener + metaphor-bow ending. Replace with guidance like "no forced hook, no neat closing callback"; keep 400–700 words.

### 2. Draft stage — `build_prompt("draft", …)` in `runner/runner.py:35`
- Add a banned-patterns block listing the tells above, plus: max 2 em-dashes, don't end paragraphs on tidy punchlines, vary sentence length (let some run long).
- Instruct the model to output its own title as the first line with a `TITLE:` prefix, based on content — **not** the idea prompt.
- `run_stage("draft", …)` (`runner.py:50`) parses `TITLE:` off line 1, returns `{"title": ..., "body": ...}`; tolerate a missing prefix (title=None → server falls back to idea title).
- `process()` (`runner.py:106`) sends `draft = {"title": ..., "body": ...}`.

### 3. Reflect stage — `build_prompt("reflect", …)` at `runner.py:40`
- Repurpose from optional critique into a **humanising line-editor that always rewrites**: hunt exactly the banned tells plus anything else that smells generated, and fix the title if clunky.
- Return shape becomes `{"notes", "revised_title", "revised_body"}` — `revised_body` is always the full rewritten text (no more `null` / "no changes needed").
- `run_stage`/`process` pass `revised_title` through as `draft.title` alongside `body`.
- Note: `claude_call` dry-run branch (`runner.py:70`) fakes reflect JSON — update its shape to match.

## Tests — `tests/runner/test_stages.py`
- TITLE: parsing (present, missing, whitespace).
- Draft prompt contains the banned-patterns block and TITLE instruction.
- Reflect output parsing for the new `{notes, revised_title, revised_body}` shape (and fallback on invalid JSON).
- Existing tests asserting old reflect shape / draft-body-only output will need updating.

## Verify

```bash
.venv/bin/python -m pytest tests/runner/
npm test          # functions suite — should be untouched, run anyway
```

Then restart `runner/runner.py` on Nate's PC (changes only take effect on restart) and run a real idea through the studio to confirm: post gets a generated title, body reads human.
