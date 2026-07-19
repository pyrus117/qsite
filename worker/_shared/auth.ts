import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import { json } from "./http";

type VerifyKey = Parameters<typeof jwtVerify>[1];

export type StudioUser = { email: string; roles: string[] };

export function rolesForEmail(email: string): string[] {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase()) ? ["admin", "editor"] : ["editor"];
}

export function hasRole(userRoles: string[], allowed: string[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function accessKeys(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${process.env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  }
  return jwks;
}

function allow(user: StudioUser, allowed: string[]): { user: StudioUser } | Response {
  if (!hasRole(user.roles, allowed)) return json({ error: "Not allowed for your role" }, 403);
  return { user };
}

// Cloudflare injects Cf-Access-Jwt-Assertion on every request matched by the
// /studio Access application; we still verify signature, issuer and audience.
export async function requireUser(
  req: Request, allowed: string[], key?: VerifyKey,
): Promise<{ user: StudioUser } | Response> {
  const devEmail = process.env.DEV_USER_EMAIL; // wrangler dev only — never set in production
  if (devEmail) return allow({ email: devEmail, roles: rolesForEmail(devEmail) }, allowed);

  // jose skips a claim check when its option is undefined, so missing config must fail closed explicitly
  if (!process.env.CF_ACCESS_TEAM_DOMAIN || !process.env.CF_ACCESS_AUD) {
    return json({ error: "Not logged in" }, 401);
  }

  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) return json({ error: "Not logged in" }, 401);
  try {
    const { payload } = await jwtVerify(token, key ?? accessKeys(), {
      issuer: process.env.CF_ACCESS_TEAM_DOMAIN,
      audience: process.env.CF_ACCESS_AUD,
    });
    if (typeof payload.email !== "string" || !payload.email) {
      return json({ error: "Not logged in" }, 401);
    }
    return allow({ email: payload.email, roles: rolesForEmail(payload.email) }, allowed);
  } catch {
    return json({ error: "Not logged in" }, 401);
  }
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
