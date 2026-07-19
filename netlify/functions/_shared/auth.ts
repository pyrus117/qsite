import { getUser } from "@netlify/identity";
import { timingSafeEqual } from "node:crypto";
import { json } from "../../../worker/_shared/http";

export function rolesOf(user: unknown): string[] {
  const u = user as Record<string, any> | null;
  const roles = u?.appMetadata?.roles ?? u?.app_metadata?.roles;
  return Array.isArray(roles) ? roles : [];
}

export function hasRole(userRoles: string[], allowed: string[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}

export async function requireUser(allowed: string[]): Promise<{ user: any } | Response> {
  const user = await getUser();
  if (!user) return json({ error: "Not logged in" }, 401);
  if (!hasRole(rolesOf(user), allowed)) return json({ error: "Not allowed for your role" }, 403);
  return { user };
}

export function requireRunner(req: Request): Response | null {
  const expected = process.env.RUNNER_TOKEN;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // fail closed if env var missing; length check prevents timingSafeEqual throwing
  // (leaks token length to a timing oracle — acceptable for a 64-char random token)
  if (!expected || provided.length !== expected.length) return json({ error: "Runner not authorised" }, 401);
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return json({ error: "Runner not authorised" }, 401);
  }
  return null;
}
