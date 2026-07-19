export default {
  async fetch(req: Request, env: { ASSETS: { fetch: typeof fetch } }): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/") || pathname.startsWith("/studio/api/")) {
      return new Response(JSON.stringify({ error: "API not yet ported" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }
    return env.ASSETS.fetch(req);
  },
};
