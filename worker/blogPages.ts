// Server-rendered blog post pages, sitemap, and RSS feed.
// Crawlers and social scrapers get full HTML; the client JS on blog.html
// stays the source of the list view. Slugs are derived from titles —
// keep slugify in sync with the copy in public/site-content.js.

export interface BlogPost {
  title: string; date: string; body: string;
  author?: string; image?: string; imageAlt?: string; imageCredit?: string;
}

const ORIGIN = "https://qyouthnz.com";
const DEFAULT_OG_IMAGE = ORIGIN + "/images/og-default.jpg";
const STATIC_PAGES = [
  "", "drop-ins.html", "young-adults.html", "events.html", "education.html",
  "local-directory.html", "get-involved.html", "resources.html", "blog.html",
  "privacy-policy.html",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

export function slugify(title: string): string {
  return title
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// editor-authored posts bypass blogMerge validation, so guard at render time too
function isRenderable(p: BlogPost | undefined): p is BlogPost {
  return !!p
    && typeof p.title === "string" && !!p.title.trim()
    && typeof p.body === "string" && !!p.body.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ""))
    && slugify(p.title) !== "";
}

export function findPost(posts: BlogPost[], slug: string): BlogPost | undefined {
  return posts.filter(isRenderable).find((p) => slugify(p.title) === slug);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paragraphs(body: string): string[] {
  return String(body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function metaDescription(body: string): string {
  const text = paragraphs(body).join(" ").replace(/\s+/g, " ");
  return text.length > 160 ? text.slice(0, 157).trimEnd() + "…" : text;
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function postUrl(post: BlogPost): string {
  return ORIGIN + "/blog/" + slugify(post.title);
}

function articleHtml(post: BlogPost): string {
  const parts: string[] = ['<article class="blog-post">'];
  if (post.image) {
    const src = "images/" + encodeURIComponent(post.image);
    const credit = post.imageCredit
      ? ` data-attribution="${esc(post.imageCredit)}"` : "";
    parts.push(
      `<div class="blog-post-img"><img src="${src}" alt="${esc(post.imageAlt || "")}"${credit}></div>`,
    );
  }
  parts.push('<div class="blog-post-body">');
  parts.push(
    `<time class="blog-post-date" datetime="${esc(post.date)}">${esc(displayDate(post.date))}</time>`,
  );
  if (post.author) {
    parts.push(`<span class="blog-post-author">by ${esc(post.author)}</span>`);
  }
  for (const p of paragraphs(post.body)) parts.push(`<p>${esc(p)}</p>`);
  parts.push("</div></article>");
  return parts.join("\n");
}

function jsonLd(post: BlogPost, desc: string, image: string): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: desc,
    datePublished: post.date,
    url: postUrl(post),
    mainEntityOfPage: postUrl(post),
    image,
    author: post.author
      ? { "@type": "Person", name: post.author }
      : { "@type": "Organization", name: "Q Youth NZ" },
    publisher: {
      "@type": "Organization",
      name: "Q Youth NZ",
      logo: { "@type": "ImageObject", url: ORIGIN + "/images/logo.png" },
    },
  };
  // < stops a title containing </script> from closing the tag early
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

export function renderPostPage(template: string, post: BlogPost): string {
  const slug = slugify(post.title);
  const url = postUrl(post);
  const desc = metaDescription(post.body);
  const ogImage = post.image
    ? ORIGIN + "/images/" + encodeURIComponent(post.image)
    : DEFAULT_OG_IMAGE;

  // Attribute-order-independent matches (editor.py/bs4 re-saves reorder them)
  // and function-form replacements ($& in post content must stay literal).
  const html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(post.title)} — Q Youth NZ</title>`)
    .replace(/<meta [^>]*name="description"[^>]*>/,
      () => `<meta content="${esc(desc)}" name="description"/>`)
    .replace(/<meta [^>]*property="og:title"[^>]*>/,
      () => `<meta content="${esc(post.title)}" property="og:title"/>`)
    .replace(/<meta [^>]*property="og:description"[^>]*>/,
      () => `<meta content="${esc(desc)}" property="og:description"/>`)
    .replace(/<meta [^>]*property="og:type"[^>]*>/,
      '<meta content="article" property="og:type"/>')
    .replace(/<meta [^>]*property="og:url"[^>]*>/,
      () => `<meta content="${url}" property="og:url"/>`)
    .replace(/<link [^>]*rel="canonical"[^>]*>/,
      () => `<link href="${url}" rel="canonical"/>`)
    .replace(/<meta [^>]*property="og:image"[^>]*>/,
      () => `<meta content="${ogImage}" property="og:image"/>`)
    .replace(/\s*<meta [^>]*property="og:image:(?:width|height)"[^>]*>/g, "")
    .replace(/<meta [^>]*property="og:locale"[^>]*>/,
      (m) => m + `\n<meta content="${esc(post.date)}" property="article:published_time"/>`)
    .replace(/<meta charset="utf-8"[^>]*>/,
      (m) => m + '\n<base href="/">')
    // the template Blog JSON-LD must not ride along on post pages
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "")
    // server-rendered pages don't need the client data fetch
    .replace(/\s*<link [^>]*href="site-data\.json"[^>]*>/, "")
    .replace(/\s*<script src="site-content\.js"><\/script>/, "")
    .replace(/(<a [^>]*class="skip-link"[^>]*)href="#main"/,
      (_, open) => `${open}href="/blog/${slug}#main"`)
    .replace(/<h1 [^>]*data-editable="page-title"[^>]*>[^<]*<\/h1>/,
      () => `<h1>${esc(post.title)}</h1>`)
    .replace(/<p [^>]*data-editable="page-desc"[^>]*>[^<]*<\/p>/,
      () => `<p>${esc(displayDate(post.date))}${post.author ? " — by " + esc(post.author) : ""}</p>`)
    .replace("<a href=\"index.html\">Home</a> › Blog",
      '<a href="index.html">Home</a> › <a href="blog.html">Blog</a>')
    .replace('<div id="blog-container"></div>',
      () => `<div id="blog-container">\n${articleHtml(post)}\n</div>`)
    .replace(/^\s*renderBlog\([^)]*\);\s*$/m, "");

  return html.replace("</head>", () => jsonLd(post, desc, ogImage) + "\n</head>");
}

export function renderSitemap(posts: BlogPost[]): string {
  const urls = STATIC_PAGES.map(
    (p) => `  <url>\n    <loc>${ORIGIN}/${p}</loc>\n  </url>`,
  );
  for (const post of posts.filter(isRenderable)) {
    urls.push(
      `  <url>\n    <loc>${postUrl(post)}</loc>\n    <lastmod>${esc(post.date)}</lastmod>\n  </url>`,
    );
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.join("\n") + "\n</urlset>\n";
}

export function renderFeed(posts: BlogPost[]): string {
  const items = posts
    .filter(isRenderable)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((post) => {
      const url = postUrl(post);
      const d = new Date(post.date + "T00:00:00Z");
      // a shape-valid but impossible date (2026-99-99) must not emit "Invalid Date"
      const pubDate = Number.isNaN(d.getTime())
        ? "" : `      <pubDate>${d.toUTCString()}</pubDate>\n`;
      return "    <item>\n"
        + `      <title>${esc(post.title)}</title>\n`
        + `      <link>${url}</link>\n`
        + `      <guid isPermaLink="true">${url}</guid>\n`
        + pubDate
        + `      <description>${esc(paragraphs(post.body).join("\n\n"))}</description>\n`
        + "    </item>";
    });
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
    + "  <channel>\n"
    + "    <title>Q Youth NZ Blog</title>\n"
    + `    <link>${ORIGIN}/blog.html</link>\n`
    + '    <description>News, kōrero, and topical issues from Q Youth NZ.</description>\n'
    + "    <language>en-nz</language>\n"
    + `    <atom:link href="${ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml"/>\n`
    + items.join("\n") + "\n"
    + "  </channel>\n</rss>\n";
}

type Assets = { fetch: typeof fetch };

async function loadPosts(assets: Assets, origin: string): Promise<BlogPost[]> {
  const res = await assets.fetch(new Request(origin + "/site-data.json"));
  if (!res.ok) throw new Error("site-data.json fetch failed: " + res.status);
  const data = (await res.json()) as { blog?: BlogPost[] };
  return Array.isArray(data.blog) ? data.blog : [];
}

function xmlResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function handleBlogPage(
  req: Request, assets: Assets, slug: string,
): Promise<Response> {
  const { origin } = new URL(req.url);
  const posts = await loadPosts(assets, origin);
  const post = findPost(posts, slug);
  if (!post) {
    return new Response(
      '<!DOCTYPE html><html lang="en-NZ"><head><meta charset="utf-8"><title>Post not found | Q Youth NZ</title><meta name="robots" content="noindex"></head>'
      + '<body><p>That post doesn\'t exist — <a href="/blog.html">back to the blog</a>.</p></body></html>',
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const tplRes = await assets.fetch(new Request(origin + "/blog.html"));
  if (!tplRes.ok) throw new Error("blog.html fetch failed: " + tplRes.status);
  const html = renderPostPage(await tplRes.text(), post);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function handleSitemap(req: Request, assets: Assets): Promise<Response> {
  const posts = await loadPosts(assets, new URL(req.url).origin);
  return xmlResponse(renderSitemap(posts), "application/xml; charset=utf-8");
}

export async function handleFeed(req: Request, assets: Assets): Promise<Response> {
  const posts = await loadPosts(assets, new URL(req.url).origin);
  return xmlResponse(renderFeed(posts), "application/rss+xml; charset=utf-8");
}
