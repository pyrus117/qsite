import { json } from "./_shared/http";
import { handleBlogPage, handleFeed, handleSitemap } from "./blogPages";
import drafts from "./api/drafts";
import ideas from "./api/ideas";
import images from "./api/images";
import me from "./api/me";
import publish from "./api/publish";
import runner from "./api/runner";

export type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

interface Route { methods: string[]; pattern: RegExp; handler: Handler }

const ROUTES: Route[] = [
  { methods: ["POST"], pattern: /^\/api\/runner\/(?<action>[a-z]+)$/, handler: runner },
  { methods: ["GET", "POST"], pattern: /^\/studio\/api\/ideas$/, handler: ideas },
  { methods: ["GET", "PATCH"], pattern: /^\/studio\/api\/ideas\/(?<id>\d+)$/, handler: ideas },
  { methods: ["POST"], pattern: /^\/studio\/api\/ideas\/(?<id>\d+)\/drafts$/, handler: drafts },
  { methods: ["POST"], pattern: /^\/studio\/api\/ideas\/(?<id>\d+)\/publish$/, handler: publish },
  { methods: ["POST"], pattern: /^\/studio\/api\/images$/, handler: images },
  { methods: ["GET"], pattern: /^\/studio\/api\/me$/, handler: me },
];

export function matchRoute(
  method: string, pathname: string,
): { handler: Handler; params: Record<string, string> } | null {
  for (const r of ROUTES) {
    if (!r.methods.includes(method)) continue;
    const m = r.pattern.exec(pathname);
    if (m) return { handler: r.handler, params: { ...m.groups } };
  }
  return null;
}

export default {
  async fetch(req: Request, env: { ASSETS: { fetch: typeof fetch } }): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/") || pathname.startsWith("/studio/api/")) {
      const match = matchRoute(req.method, pathname);
      if (!match) return json({ error: "Not found" }, 404);
      return match.handler(req, match.params);
    }
    // SEO pages rendered from site-data.json; asset requests fall through
    if (req.method === "GET" || req.method === "HEAD") {
      try {
        if (pathname === "/sitemap.xml") return await handleSitemap(req, env.ASSETS);
        if (pathname === "/blog/feed.xml") return await handleFeed(req, env.ASSETS);
        const post = /^\/blog\/([a-z0-9-]+)(\/?)$/.exec(pathname);
        if (post) {
          if (post[2]) {
            return Response.redirect(new URL("/blog/" + post[1], req.url).href, 301);
          }
          return await handleBlogPage(req, env.ASSETS, post[1]);
        }
      } catch (err) {
        console.error("blog page render failed:", err);
        return new Response("Something went wrong.", { status: 500 });
      }
    }
    return env.ASSETS.fetch(req);
  },
};
