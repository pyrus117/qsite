import type { Config } from "@netlify/functions";

// temporary diagnostic — reports env var PRESENCE only, never values; delete after debugging
export default async () => {
  const names = Object.keys(process.env).filter((k) => k.startsWith("NETLIFY_")).sort();
  return new Response(JSON.stringify({
    netlifyVarNames: names,
    hasDbUrl: !!process.env.NETLIFY_DB_URL,
    hasLegacyDbUrl: !!process.env.NETLIFY_DATABASE_URL,
    hasRunnerToken: !!process.env.RUNNER_TOKEN,
    node: process.version,
  }), { headers: { "Content-Type": "application/json" } });
};

export const config: Config = { path: "/api/debug-env" };
