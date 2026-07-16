# Q Youth NZ — Site Project Tracker

## What This Is
Static HTML/CSS/JS charity website for Q Youth NZ (qyouthnz.com).
LGBTQIA+/Takatāpui rangatahi support organisation, Nelson/Tasman, New Zealand.

## File Inventory

| File | Purpose |
|------|---------|
| `index.html` | Homepage (hero, stats, sponsors banner, programmes, about, events, newsletter, contact) |
| `drop-ins.html` | Kea (11–14, Thu) and Kākāpō (15–18, Tue) drop-in groups |
| `young-adults.html` | Monthly social group, ages 18–30 |
| `events.html` | Events listing + Google Calendar embed |
| `education.html` | School/workplace/community training |
| `local-directory.html` | Regional LGBTQIA+ organisation directory |
| `resources.html` | PDFs, videos, external links |
| `get-involved.html` | Volunteer, board, donate, newsletter |
| `blog.html` | Blog — posts rendered from site-data.json `blog` array, newest first |
| `privacy-policy.html` | NZ Privacy Act 2020 compliant |
| `styles.css` | Full design system (CSS variables, all components) |
| `icons.svg` | SVG sprite (all icons, no emojis) |
| `site-data.json` | **Edit this** — sponsors, directory, resources, blog posts |
| `site-content.js` | Async renderer — reads site-data.json (sponsors marquee, directory, resources incl. embedded videos, blog posts), no edits needed |
| `editor.py` | Local site editor server — run to launch editor |
| `editor.html` | Editor UI (split-pane preview + sidebar) |
| `editor-inject.js` | Injected into the editor preview iframe — click-to-edit, image crop/zoom, serialize-to-save (local tool only, never uploaded) |
| `image-attribution.js` | Hover-credit tooltip for images with a `data-attribution` attribute; included on all 10 public pages |
| `images/` | Page images, plus `images/sponsors/` and `images/logos/` |
| `resources/` | Uploaded resource PDFs (created by the Resources panel's PDF upload) |
| `launch.vbs` | Windows double-click launcher (no console) |
| `launch.sh` | Linux/Mac double-click launcher |
| `robots.txt` | SEO — allows all crawlers |
| `sitemap.xml` | SEO — all 10 pages |

## Deployment Workflow

1. Make changes using the editor (run `launch.vbs` or `python3 editor.py`)
2. Click **Save Changes** in the editor
3. Copy all changed files to GoDaddy via File Manager (cPanel)
4. Priority files to upload after editing: `site-data.json`, `site-content.js`, `image-attribution.js`, `styles.css`, any `.html` files you changed
5. Upload new images to `images/`, `images/sponsors/`, or `images/logos/` on GoDaddy
6. Upload new resource PDFs in the `resources/` folder to GoDaddy
7. Do **not** upload the editor tooling (`editor.py`, `editor.html`, `editor-inject.js`, `launch.*`) — those are local-only

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
python3 -c "import json; json.load(open('site-data.json'))" && echo "OK"

# 3. No nested anchors
python3 -c "
import glob, re
bad = [f for f in glob.glob('*.html') if re.search(r'<a[^>]+><a', open(f).read())]
print('NESTED ANCHORS:', bad or 'none')
"

# 4. All HTML files present
python3 -c "
import os
pages = ['index','drop-ins','young-adults','events','education','local-directory','resources','get-involved','privacy-policy','blog']
missing = [p for p in pages if not os.path.exists(p+'.html')]
print('MISSING:', missing or 'none')
"

# 5. Start and test server (manual - press Ctrl+C after checking)
# python3 editor.py
# Then visit http://localhost:8080/editor
```

## Known Issues / Notes

- GoDaddy hosting is cPanel/traditional (not Website Builder)
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
- Canonical/og/schema/sitemap URLs use the **apex domain** (`https://qyouthnz.com`) — the live server 301s www→apex, so never reintroduce `www.` in metadata
- The homepage **CTA banner** (`.cta-banner`, between hero and stats bar) links to blog.html; its heading/text are `data-editable` (`cta-banner-title`/`cta-banner-text`). Post topical issues as blog posts. Banner gradient starts at `#DB2777` (not `--color-secondary`) for WCAG AA contrast with white text
- Never let saved pages contain base64 `data:image` URIs — they bloated three pages by up to 279KB each (fixed 2026-07-16 by extracting to `images/*.webp`). If an `<img src>` shows `data:image/...` after an editor save, extract it to a file
- Sponsor entries in site-data.json carry `width`/`height` (real pixel dims) that `site-content.js` puts on the marquee `<img>` for Lighthouse's unsized-images audit; new sponsor logos get dims added manually or via `magick identify`
