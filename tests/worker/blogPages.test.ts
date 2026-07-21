import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findPost, renderFeed, renderPostPage, renderSitemap, slugify,
} from "../../worker/blogPages";
import worker from "../../worker/index";

const template = readFileSync("public/blog.html", "utf-8");

const post = {
  title: "250-plus schools chose aroha out loud this Pride Week",
  date: "2026-07-16",
  author: "Nate",
  body: "First paragraph of kōrero.\n\nSecond paragraph here.",
};

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("strips macrons and diacritics", () => {
    expect(slugify("Kōrero & whānau time")).toBe("korero-whanau-time");
  });
  it("collapses runs and trims edge hyphens", () => {
    expect(slugify("  --Weird   spacing--  ")).toBe("weird-spacing");
  });
  it("drops apostrophes without splitting words", () => {
    expect(slugify("Pride Week's best")).toBe("pride-weeks-best");
  });
  it("keeps digits", () => {
    expect(slugify(post.title)).toBe(
      "250-plus-schools-chose-aroha-out-loud-this-pride-week",
    );
  });
});

describe("findPost", () => {
  it("finds a post by its slug", () => {
    expect(findPost([post], slugify(post.title))).toBe(post);
  });
  it("returns undefined for an unknown slug", () => {
    expect(findPost([post], "nope")).toBeUndefined();
  });
});

describe("renderPostPage", () => {
  const html = renderPostPage(template, post);
  const slugUrl = "https://qyouthnz.com/blog/" + slugify(post.title);

  it("puts the post title in <title>", () => {
    expect(html).toMatch(/<title>250-plus schools chose aroha out loud this Pride Week — Q Youth NZ<\/title>/);
  });
  it("sets canonical and og:url to the post URL", () => {
    expect(html).toContain(`href="${slugUrl}" rel="canonical"`);
    expect(html).toContain(`content="${slugUrl}" property="og:url"`);
  });
  it("marks the page as an article with published time", () => {
    expect(html).toContain('content="article" property="og:type"');
    expect(html).toContain('content="2026-07-16" property="article:published_time"');
  });
  it("derives the meta description from the body", () => {
    const desc = html.match(/name="description" content="([^"]*)"/) ??
      html.match(/content="([^"]*)" name="description"/);
    expect(desc?.[1]).toContain("First paragraph");
    expect(desc![1].length).toBeLessThanOrEqual(160);
  });
  it("renders body paragraphs into the blog container", () => {
    expect(html).toContain("<p>First paragraph of kōrero.</p>");
    expect(html).toContain("<p>Second paragraph here.</p>");
  });
  it("renders the byline when author is set", () => {
    expect(html).toContain('by Nate');
  });
  it("sets the page h1 to the post title", () => {
    expect(html).toMatch(/<h1[^>]*>250-plus schools chose aroha out loud this Pride Week<\/h1>/);
  });
  it("adds a base tag so relative asset URLs resolve from root", () => {
    expect(html).toContain('<base href="/">');
  });
  it("repoints the skip link so the base tag does not break it", () => {
    expect(html).toContain(`href="/blog/${slugify(post.title)}#main"`);
  });
  it("removes the client-side renderBlog call to avoid double rendering", () => {
    expect(html).not.toContain("renderBlog(");
  });
  it("includes BlogPosting JSON-LD", () => {
    expect(html).toContain('"@type": "BlogPosting"');
    expect(html).toContain('"datePublished": "2026-07-16"');
  });
  it("uses the default og:image when the post has none", () => {
    expect(html).toContain('content="https://qyouthnz.com/images/og-default.jpg" property="og:image"');
  });
  it("uses the post image for og:image and renders the figure", () => {
    const withImg = renderPostPage(template, {
      ...post, image: "my pic.webp", imageAlt: "A pic",
    });
    expect(withImg).toContain('content="https://qyouthnz.com/images/my%20pic.webp" property="og:image"');
    expect(withImg).toContain('src="images/my%20pic.webp"');
    expect(withImg).toContain('alt="A pic"');
  });
  it("escapes HTML in post fields", () => {
    const evil = renderPostPage(template, {
      ...post,
      title: 'XSS <script>alert(1)</script> & "quotes"',
      body: "<img src=x onerror=alert(1)>",
    });
    expect(evil).not.toContain("<script>alert(1)");
    expect(evil).not.toContain("<img src=x");
    expect(evil).toContain("&lt;script&gt;");
  });
});

describe("renderSitemap", () => {
  const xml = renderSitemap([post]);

  it("lists the static pages", () => {
    expect(xml).toContain("<loc>https://qyouthnz.com/</loc>");
    expect(xml).toContain("<loc>https://qyouthnz.com/blog</loc>");
    expect(xml).toContain("<loc>https://qyouthnz.com/privacy-policy</loc>");
    // Cloudflare 307s .html to extensionless — the sitemap must list the final URLs
    expect(xml).not.toContain(".html</loc>");
  });
  it("lists each post with its date as lastmod", () => {
    expect(xml).toContain(
      "<loc>https://qyouthnz.com/blog/" + slugify(post.title) + "</loc>",
    );
    expect(xml).toContain("<lastmod>2026-07-16</lastmod>");
  });
  it("omits priority and changefreq noise", () => {
    expect(xml).not.toContain("<priority>");
    expect(xml).not.toContain("<changefreq>");
  });
  it("is a valid urlset document", () => {
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});

describe("renderFeed", () => {
  const xml = renderFeed([{ ...post, title: "Fish & chips" }]);

  it("is an RSS 2.0 feed for the blog", () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Q Youth NZ Blog</title>");
    expect(xml).toContain("<link>https://qyouthnz.com/blog</link>");
  });
  it("links each item to its post URL", () => {
    expect(xml).toContain("<link>https://qyouthnz.com/blog/fish-chips</link>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://qyouthnz.com/blog/fish-chips</guid>',
    );
  });
  it("escapes XML entities in titles", () => {
    expect(xml).toContain("<title>Fish &amp; chips</title>");
  });
  it("formats pubDate as RFC 822", () => {
    expect(xml).toMatch(/<pubDate>[A-Z][a-z]{2}, 16 Jul 2026/);
  });
});

describe("worker fetch routing for blog pages", () => {
  const siteData = JSON.stringify({ blog: [post] });
  const env = {
    ASSETS: {
      fetch: async (req: Request) => {
        const { pathname } = new URL(req.url);
        if (pathname === "/site-data.json") return new Response(siteData);
        if (pathname === "/blog.html") return new Response(template);
        return new Response("not found", { status: 404 });
      },
    },
  };
  const get = (path: string) =>
    worker.fetch(new Request("https://qyouthnz.com" + path), env as never);

  it("serves a post page at /blog/<slug>", async () => {
    const res = await get("/blog/" + slugify(post.title));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain(post.title);
  });
  it("404s an unknown slug", async () => {
    const res = await get("/blog/not-a-post");
    expect(res.status).toBe(404);
  });
  it("serves the generated sitemap", async () => {
    const res = await get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    expect(await res.text()).toContain("/blog/" + slugify(post.title));
  });
  it("serves the RSS feed", async () => {
    const res = await get("/blog/feed.xml");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<rss");
  });
});

describe("hardening (adversarial review fixes)", () => {
  it("renderSitemap skips posts with missing fields instead of crashing", () => {
    const xml = renderSitemap([post, { title: "NoDate", body: "x" } as never]);
    expect(xml).not.toContain("nodate");
    expect(xml).toContain(slugify(post.title));
  });
  it("renderFeed skips invalid posts instead of crashing", () => {
    const xml = renderFeed([post, { title: "Bad", date: "", body: "x" } as never]);
    expect(xml).not.toContain("<title>Bad</title>");
  });
  it("renderFeed omits pubDate for unparseable dates", () => {
    const xml = renderFeed([{ ...post, date: "2026-99-99" }]);
    expect(xml).not.toContain("Invalid Date");
    expect(xml).not.toContain("<pubDate>");
  });
  it("findPost ignores posts whose titles slugify to nothing", () => {
    expect(findPost([{ title: "🌈🌈", date: "2026-01-01", body: "x" }], "")).toBeUndefined();
  });
  it("rewrites metadata even when bs4 has reordered attributes", () => {
    const reordered = template
      .replace(/<meta content="([^"]*)" name="description"\/>/,
        '<meta name="description" content="$1"/>')
      .replace(/<meta content="([^"]*)" property="og:title"\/>/,
        '<meta property="og:title" content="$1">');
    const html = renderPostPage(reordered, post);
    expect(html).toContain("First paragraph");
    expect(html).not.toContain("News, kōrero, and topical issues from Q Youth NZ —");
    expect(html).toContain(`content="${post.title}" property="og:title"`);
  });
  it("strips the template Blog JSON-LD so only BlogPosting remains", () => {
    const html = renderPostPage(template, post);
    expect(html).not.toMatch(/"@type": "Blog"[^P]/);
    expect(html).toContain('"@type": "BlogPosting"');
  });
  it("drops the site-data preload and site-content script from post pages", () => {
    const html = renderPostPage(template, post);
    expect(html).not.toContain('href="site-data.json"');
    expect(html).not.toContain('src="site-content.js"');
  });
});

describe("Search Console verification file", () => {
  const env = { ASSETS: { fetch: async () => new Response("unused") } };
  it("serves the exact .html path without the asset-layer 307", async () => {
    const res = await worker.fetch(
      new Request("https://qyouthnz.com/googlef0a7e85871371696.html"), env as never,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("google-site-verification: googlef0a7e85871371696.html");
  });
});

describe("trailing-slash redirect", () => {
  const env = {
    ASSETS: { fetch: async () => new Response("unused") },
  };
  it("301s /blog/<slug>/ to the canonical URL", async () => {
    const res = await worker.fetch(
      new Request("https://qyouthnz.com/blog/some-post/"), env as never,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://qyouthnz.com/blog/some-post");
  });
});
