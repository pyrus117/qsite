# Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move qyouthnz.com off Netlify onto Cloudflare Workers (static assets + API worker + Access auth), keeping the same Neon Postgres database and the unchanged local Python runner.

**Architecture:** One Worker serves `public/` as static assets and handles two API surfaces: `/studio/api/*` (humans — authenticated by a Cloudflare Access application covering `qyouthnz.com/studio`, validated in the worker via the `Cf-Access-Jwt-Assertion` JWT) and `/api/runner/*` (machine — bearer `RUNNER_TOKEN`, deliberately **outside** Access so the runner needs no changes). The database does not move: Netlify DB is Neon under the hood; we claim it and connect with the Neon serverless HTTP driver. Netlify Identity is deleted, not migrated — there are no users yet. Roles collapse to: email in `ADMIN_EMAILS` → admin, any other Access-authenticated email → editor.

**Tech Stack:** Cloudflare Workers (static assets, `nodejs_compat`), wrangler v4, `jose` (Access JWT verify), `@neondatabase/serverless` + `drizzle-orm/neon-http`, esbuild (unchanged studio bundle), vitest, Cloudflare Access (Zero Trust), Workers Builds (git push-to-deploy).

## Global Constraints

- **All work on branch `cloudflare-migration`** — `main` stays deployable to Netlify until the DNS cutover (runbook Task 8). Never push migration commits to `main` directly.
- **URGENT external dependency:** the Netlify DB (Neon) must be **claimed within 7 days of creation (created ~2026-07-16 → deadline ~2026-07-23)** or Neon deletes it. This is a Nate-only dashboard step, first item in the runbook. Code tasks don't block on it.
- `runner/runner.py` must not change. Its endpoints stay at `POST /api/runner/:action` with `Authorization: Bearer RUNNER_TOKEN`.
- Keep the `process.env.*` config-access pattern everywhere: `nodejs_compat` + `compatibility_date >= 2025-04-01` auto-populates `process.env` from Worker vars/secrets. Existing tests that set `process.env` keep working.
- Do NOT use Access "Bypass" policies — documented to fail silently when a Worker intercepts the request. The runner API avoids Access by path instead.
- Do NOT switch databases (no D1). Same Neon Postgres, same data, dialect stays `postgresql`.
- `npm test` (vitest) must pass at the end of every task. Do not touch `tests/runner/` (pytest) — the runner is unchanged.
- Public site behavior must not regress: apex-domain metadata, `X-Robots-Tag` noindex on `/studio/*`, and the `Link` preload headers from `netlify.toml` must all survive the move.
- Env var names in the new stack: `DATABASE_URL`, `RUNNER_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `ADMIN_EMAILS`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, plus dev-only `DEV_USER_EMAIL` (never set in production — it bypasses Access validation).
- Repo stays private.

## File Map (end state)

| Path | Fate |
|---|---|
| `wrangler.jsonc` | **new** — worker + static assets config |
| `worker/index.ts` | **new** — fetch handler + route table |
| `worker/api/{ideas,drafts,images,publish,runner,me}.ts` | **new** — ported endpoints (+ new `me`) |
| `worker/_shared/{http,github,blogMerge,imageUpload,transitions}.ts` | **moved** from `netlify/functions/_shared/`, logic unchanged |
| `worker/_shared/auth.ts` | **rewritten** — Access JWT instead of Netlify Identity |
| `public/_headers` | **new** — ports `netlify.toml` headers |
| `db/index.ts` | **modified** — lazy `getDb()` via neon-http |
| `db/migrations/` | **moved** from `netlify/database/migrations/` (journal intact) |
| `drizzle.config.ts` | **modified** — `out` + `dbCredentials` |
| `studio-src/studio.js`, `public/studio/index.html` | **modified** — Identity removed, `/studio/api` base, Access logout |
| `tests/worker/` | **moved/updated** from `tests/functions/` |
| `docs/CLOUDFLARE_CUTOVER_RUNBOOK.md` | **new** — Nate's manual dashboard/DNS checklist |
| `netlify/`, `netlify.toml`, `.netlify/`, `@netlify/*` deps | **deleted** (Task 7) |

---

### Task 1: Worker scaffold, static assets, headers

**Files:**
- Create: `wrangler.jsonc`
- Create: `worker/index.ts` (placeholder API responses; real routes come in Task 5)
- Create: `public/_headers`
- Modify: `package.json` (add `wrangler` devDependency, `dev`/`deploy` scripts)
- Modify: `.gitignore` (add `.dev.vars`)
- Create: `.dev.vars` (local only, gitignored)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `wrangler.jsonc` with assets binding `ASSETS` and `run_worker_first: ["/api/*", "/studio/api/*"]`; a default-export fetch handler that later tasks extend. Vars `ADMIN_EMAILS`, `GITHUB_REPO`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` defined in wrangler `vars`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b cloudflare-migration
```

- [ ] **Step 2: Write `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "qsite",
  "main": "worker/index.ts",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/studio/api/*"]
  },
  "vars": {
    "GITHUB_REPO": "pyrus117/qsite",
    "ADMIN_EMAILS": "nate@qyouthnz.com",
    // Set after the Access app exists (runbook step 4) — placeholder values fail closed
    "CF_ACCESS_TEAM_DOMAIN": "https://REPLACE-ME.cloudflareaccess.com",
    "CF_ACCESS_AUD": "REPLACE-ME"
  }
}
```

- [ ] **Step 3: Write the placeholder `worker/index.ts`**

```ts
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
```

- [ ] **Step 4: Write `public/_headers`** (ports every rule in `netlify.toml`; the `! Link` detach lines prevent the `/*` rule stacking a duplicate preload onto the data pages — same bug fixed on Netlify in commit be03aae)

```
/studio/*
  X-Robots-Tag: noindex, nofollow

/*
  Link: </styles.css>; rel=preload; as=style

/
  ! Link
  Link: </styles.css>; rel=preload; as=style, </site-content.js>; rel=preload; as=script, </site-data.json>; rel=preload; as=fetch; crossorigin

/index.html
  ! Link
  Link: </styles.css>; rel=preload; as=style, </site-content.js>; rel=preload; as=script, </site-data.json>; rel=preload; as=fetch; crossorigin

/blog.html
  ! Link
  Link: </styles.css>; rel=preload; as=style, </site-content.js>; rel=preload; as=script, </site-data.json>; rel=preload; as=fetch; crossorigin

/resources.html
  ! Link
  Link: </styles.css>; rel=preload; as=style, </site-content.js>; rel=preload; as=script, </site-data.json>; rel=preload; as=fetch; crossorigin

/local-directory.html
  ! Link
  Link: </styles.css>; rel=preload; as=style, </site-content.js>; rel=preload; as=script, </site-data.json>; rel=preload; as=fetch; crossorigin
```

- [ ] **Step 5: package.json — add wrangler and scripts**

In `devDependencies` add `"wrangler": "^4.0.0"`; in `scripts` add:

```json
"dev": "wrangler dev",
"deploy": "wrangler deploy"
```

Then run: `npm install`

- [ ] **Step 6: gitignore + dev vars**

Append `.dev.vars` to `.gitignore`. Create `.dev.vars`:

```
RUNNER_TOKEN=devtoken
DEV_USER_EMAIL=nate@qyouthnz.com
```

- [ ] **Step 7: Verify with wrangler dev**

```bash
npx wrangler dev --port 8787 &
sleep 8
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/            # expect 200
curl -sI http://localhost:8787/studio/ | grep -i x-robots-tag            # expect noindex, nofollow
curl -sI http://localhost:8787/ | grep -ic "link:"                       # expect exactly 1 Link line
curl -sI http://localhost:8787/ | grep -i "link:"                        # expect all three preloads, styles.css once
curl -s http://localhost:8787/api/anything | grep "not yet ported"       # expect placeholder JSON
kill %1
```

If the `/` Link header shows `styles.css` **twice**, the `! Link` detach didn't work on this wrangler version — fix by removing the `/*` rule and repeating the single styles.css line for the six non-data pages instead. Verify again.

- [ ] **Step 8: Run existing tests still pass**

Run: `npm test` — expect all existing suites green (nothing they import changed).

- [ ] **Step 9: Commit**

```bash
git add wrangler.jsonc worker/index.ts public/_headers package.json package-lock.json .gitignore
git commit -m "feat(cloudflare): worker scaffold — static assets, ported headers, dev config"
```

---

### Task 2: Move shared helpers to worker/_shared

**Files:**
- Move: `netlify/functions/_shared/{http,github,blogMerge,imageUpload,transitions}.ts` → `worker/_shared/` (do NOT move `auth.ts` — it is rewritten from scratch in Task 4 and deleted with the rest of `netlify/` in Task 7)
- Move: `tests/functions/` → `tests/worker/` (including `fixtures/`)
- Modify: import paths inside the moved tests

**Interfaces:**
- Consumes: Task 1 branch.
- Produces: `worker/_shared/http.ts` exports `json(data: unknown, status?: number): Response`; `worker/_shared/github.ts` exports `getFile(path): Promise<{content: string; sha: string}>`, `putFile(path, content, message, sha?)`, `putBinaryFile(path, base64, message)`; `worker/_shared/blogMerge.ts` exports `mergePost(siteDataJson: string, post: BlogPost): string`; `worker/_shared/imageUpload.ts` exports `validateImageUpload(filename, data, {allowSvg}): string | null` and `stripDataUri(data): string`; `worker/_shared/transitions.ts` exports `canTransition(from, to): boolean` and `STATUSES`. **Logic in all five files is byte-identical to the originals** (they already use only `fetch`, `Buffer`, and pure JS — all available under `nodejs_compat`).

- [ ] **Step 1: Move the files with git mv**

```bash
mkdir -p worker/_shared
git mv netlify/functions/_shared/http.ts worker/_shared/http.ts
git mv netlify/functions/_shared/github.ts worker/_shared/github.ts
git mv netlify/functions/_shared/blogMerge.ts worker/_shared/blogMerge.ts
git mv netlify/functions/_shared/imageUpload.ts worker/_shared/imageUpload.ts
git mv netlify/functions/_shared/transitions.ts worker/_shared/transitions.ts
git mv tests/functions tests/worker
```

- [ ] **Step 2: Update test imports**

In `tests/worker/blogMerge.test.ts`, `tests/worker/imageUpload.test.ts`, `tests/worker/transitions.test.ts`: change every import of `"../../netlify/functions/_shared/<name>"` to `"../../worker/_shared/<name>"`.

`tests/worker/auth.test.ts` still imports the old Netlify `auth.ts`. Leave that import pointing at `../../netlify/functions/_shared/auth` for now — Task 4 replaces this test file wholesale. (The old `netlify/functions/*.ts` endpoints also still import `./_shared/*`, which no longer exists — that breaks nothing because nothing imports or type-checks those files from the test suite; they are deleted in Task 7.)

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all suites PASS (blogMerge, imageUpload, transitions from new paths; auth from old path).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(cloudflare): move shared helpers to worker/_shared, tests to tests/worker"
```

---

### Task 3: Database layer — Neon HTTP driver + migrations home

**Files:**
- Modify: `db/index.ts`
- Modify: `drizzle.config.ts`
- Move: `netlify/database/migrations/` → `db/migrations/`
- Modify: `package.json` (add `@neondatabase/serverless`, replace `db:migrate` script)

**Interfaces:**
- Consumes: nothing new.
- Produces: `db/index.ts` exports `getDb(): NeonHttpDatabase<typeof schema>` (lazy singleton reading `process.env.DATABASE_URL`, throws `"DATABASE_URL is not set"` if missing) and re-exports everything from `./schema`. Endpoint tasks call `getDb()` instead of importing a `db` constant.

- [ ] **Step 1: Install driver**

```bash
npm install @neondatabase/serverless
```

- [ ] **Step 2: Rewrite `db/index.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

// lazy: process.env is only guaranteed populated at request time in Workers
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle({ client: neon(url), schema });
  }
  return _db;
}

export * from "./schema";
```

- [ ] **Step 3: Move migrations (journal must move with them)**

```bash
git mv netlify/database/migrations db/migrations
ls db/migrations/meta/_journal.json   # must exist — drizzle-kit needs it
```

- [ ] **Step 4: Update `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: package.json script**

Replace `"db:migrate": "netlify database migrations apply"` with:

```json
"db:migrate": "drizzle-kit migrate"
```

(Usage after the DB is claimed: `DATABASE_URL=postgres://… npm run db:migrate`. drizzle-kit tracks applied migrations in the `drizzle.__drizzle_migrations` table and skips ones already applied. **Caveat for the runbook:** if Netlify's own applier used a different tracking table, the first `db:migrate` run will try to re-create existing tables and fail with `already exists` — that failure is harmless/read-only-safe; the fix is documented in the runbook, not needed now.)

- [ ] **Step 6: Verify nothing broke**

```bash
npm test                                   # expect green
npx tsc --noEmit db/index.ts 2>/dev/null || npx esbuild db/index.ts --bundle --outfile=/dev/null --external:@neondatabase/serverless --external:drizzle-orm
```

Expected: tests pass; the esbuild bundle check exits 0 (syntax/imports resolve).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cloudflare): neon-http db driver, migrations moved to db/migrations"
```

---

### Task 4: Access-based auth (worker/_shared/auth.ts) — TDD

**Files:**
- Create: `worker/_shared/auth.ts`
- Create: `tests/worker/auth.test.ts` (replaces the old file's content entirely)
- Modify: `package.json` (add `jose`)

**Interfaces:**
- Consumes: `json` from `worker/_shared/http.ts`.
- Produces:
  - `type StudioUser = { email: string; roles: string[] }`
  - `rolesForEmail(email: string): string[]` — `["admin", "editor"]` if email (case-insensitive) is in comma-separated `process.env.ADMIN_EMAILS`, else `["editor"]`
  - `requireUser(req: Request, allowed: string[], key?: VerifyKey): Promise<{ user: StudioUser } | Response>` — `VerifyKey = Parameters<typeof jwtVerify>[1]`; the optional `key` is for tests; production uses a cached `createRemoteJWKSet` against `${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`
  - `requireRunner(req: Request): Response | null` — byte-identical to the old implementation
  - `hasRole(userRoles: string[], allowed: string[]): boolean`

- [ ] **Step 1: Install jose**

```bash
npm install jose
```

- [ ] **Step 2: Write the failing tests** — `tests/worker/auth.test.ts` (full replacement)

```ts
import { generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasRole, requireRunner, requireUser, rolesForEmail } from "../../worker/_shared/auth";

const TEAM = "https://qyouth.cloudflareaccess.com";
const AUD = "test-aud-tag";

async function signedRequest(privateKey: CryptoKey, email: string, opts: { aud?: string; iss?: string } = {}) {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  return new Request("http://x/studio/api/me", { headers: { "cf-access-jwt-assertion": token } });
}

describe("rolesForEmail", () => {
  beforeEach(() => { process.env.ADMIN_EMAILS = "nate@qyouthnz.com, second@qyouthnz.com"; });
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it("grants admin+editor to listed admins, case-insensitively", () => {
    expect(rolesForEmail("Nate@QYouthNZ.com")).toEqual(["admin", "editor"]);
  });
  it("grants editor only to everyone else", () => {
    expect(rolesForEmail("someone@qyouthnz.com")).toEqual(["editor"]);
  });
  it("grants editor only when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(rolesForEmail("nate@qyouthnz.com")).toEqual(["editor"]);
  });
});

describe("hasRole", () => {
  it("passes when any allowed role present", () => {
    expect(hasRole(["editor"], ["admin", "editor"])).toBe(true);
  });
  it("fails when no allowed role present", () => {
    expect(hasRole(["editor"], ["admin"])).toBe(false);
  });
});

describe("requireUser (Access JWT)", () => {
  let publicKey: CryptoKey, privateKey: CryptoKey;
  beforeEach(async () => {
    ({ publicKey, privateKey } = await generateKeyPair("RS256"));
    process.env.CF_ACCESS_TEAM_DOMAIN = TEAM;
    process.env.CF_ACCESS_AUD = AUD;
    process.env.ADMIN_EMAILS = "nate@qyouthnz.com";
    delete process.env.DEV_USER_EMAIL;
  });
  afterEach(() => {
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    delete process.env.CF_ACCESS_AUD;
    delete process.env.ADMIN_EMAILS;
    delete process.env.DEV_USER_EMAIL;
  });

  it("accepts a valid admin JWT", async () => {
    const res = await requireUser(await signedRequest(privateKey, "nate@qyouthnz.com"), ["admin"], publicKey);
    expect(res).not.toBeInstanceOf(Response);
    if (!(res instanceof Response)) {
      expect(res.user.email).toBe("nate@qyouthnz.com");
      expect(res.user.roles).toContain("admin");
    }
  });
  it("maps a non-admin email to editor and rejects admin-only routes with 403", async () => {
    const req = await signedRequest(privateKey, "editor@qyouthnz.com");
    const ok = await requireUser(req, ["editor"], publicKey);
    expect(ok).not.toBeInstanceOf(Response);
    const denied = await requireUser(await signedRequest(privateKey, "editor@qyouthnz.com"), ["admin"], publicKey);
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
  });
  it("rejects a missing header with 401", async () => {
    const res = await requireUser(new Request("http://x/studio/api/me"), ["editor"], publicKey);
    expect((res as Response).status).toBe(401);
  });
  it("rejects a wrong audience with 401", async () => {
    const res = await requireUser(await signedRequest(privateKey, "nate@qyouthnz.com", { aud: "other" }), ["editor"], publicKey);
    expect((res as Response).status).toBe(401);
  });
  it("rejects a token signed by a different key with 401", async () => {
    const other = await generateKeyPair("RS256");
    const res = await requireUser(await signedRequest(other.privateKey, "nate@qyouthnz.com"), ["editor"], publicKey);
    expect((res as Response).status).toBe(401);
  });
  it("rejects a JWT with no email claim with 401", async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256" })
      .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h").sign(privateKey);
    const req = new Request("http://x/", { headers: { "cf-access-jwt-assertion": token } });
    expect(((await requireUser(req, ["editor"], publicKey)) as Response).status).toBe(401);
  });
  it("DEV_USER_EMAIL bypasses JWT validation (local dev only)", async () => {
    process.env.DEV_USER_EMAIL = "nate@qyouthnz.com";
    const res = await requireUser(new Request("http://x/"), ["admin"]);
    expect(res).not.toBeInstanceOf(Response);
  });
});

describe("requireRunner", () => {
  beforeEach(() => { process.env.RUNNER_TOKEN = "s3cret-token-value"; });
  afterEach(() => { delete process.env.RUNNER_TOKEN; });
  const req = (auth?: string) =>
    new Request("http://x/api/runner/claim", { headers: auth ? { authorization: auth } : {} });

  it("accepts the correct bearer token", () => {
    expect(requireRunner(req("Bearer s3cret-token-value"))).toBeNull();
  });
  it("rejects a wrong token with 401", () => {
    expect(requireRunner(req("Bearer wrong"))?.status).toBe(401);
  });
  it("rejects a missing header with 401", () => {
    expect(requireRunner(req())?.status).toBe(401);
  });
  it("rejects when RUNNER_TOKEN is unset (fail closed)", () => {
    delete process.env.RUNNER_TOKEN;
    expect(requireRunner(req("Bearer s3cret-token-value"))?.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/worker/auth.test.ts`
Expected: FAIL — `Cannot find module '../../worker/_shared/auth'` (or equivalent).

- [ ] **Step 4: Write `worker/_shared/auth.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add worker/_shared/auth.ts tests/worker/auth.test.ts package.json package-lock.json
git commit -m "feat(cloudflare): Access-JWT auth with ADMIN_EMAILS role mapping"
```

---

### Task 5: Port the API endpoints + router

**Files:**
- Create: `worker/api/ideas.ts`, `worker/api/drafts.ts`, `worker/api/images.ts`, `worker/api/publish.ts`, `worker/api/runner.ts`, `worker/api/me.ts`
- Modify: `worker/index.ts` (real route table replaces placeholder)
- Create: `tests/worker/router.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `db/index.ts` (Task 3); `requireUser(req, allowed)`, `requireRunner(req)`, `StudioUser` from `worker/_shared/auth.ts` (Task 4); `json`, `getFile`, `putFile`, `putBinaryFile`, `mergePost`, `validateImageUpload`, `stripDataUri`, `canTransition` from `worker/_shared/` (Task 2).
- Produces: every endpoint module default-exports `(req: Request, params: Record<string, string>) => Promise<Response>`; `worker/index.ts` exports `matchRoute(method: string, pathname: string): { handler; params } | null` for tests. **Route map (used verbatim by Task 6's front-end and the unchanged runner):** `POST /api/runner/:action`; `GET|POST /studio/api/ideas`; `GET|PATCH /studio/api/ideas/:id`; `POST /studio/api/ideas/:id/drafts`; `POST /studio/api/ideas/:id/publish`; `POST /studio/api/images`; `GET /studio/api/me` → `{ email, roles }`.

Each port makes exactly these mechanical changes to the Netlify original — nothing else:
1. drop `import type { Config, Context } from "@netlify/functions"` and the `export const config` block;
2. signature `(req: Request, context: Context)` → `(req: Request, params: Record<string, string>)`, and `context.params.X` → `params.X`;
3. `import { db } from "../../db"` → `import { getDb } from "../../db"` with `const db = getDb();` as the first line inside the handler's `try` (for `runner.ts`: after the `requireRunner` check, before the `try`… no — keep it as the first line inside the `try`);
4. auth: `await requireUser(["admin", "editor"])` → `await requireUser(req, ["admin", "editor"])`, and `hasRole(rolesOf(auth.user), ["admin"])` → `auth.user.roles.includes("admin")`;
5. shared imports `./_shared/X` → `../_shared/X`, db imports `../../db/schema` unchanged.

- [ ] **Step 1: Write the failing router test** — `tests/worker/router.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../worker/index";

describe("matchRoute", () => {
  it("routes runner actions with the action param", () => {
    const m = matchRoute("POST", "/api/runner/claim");
    expect(m).not.toBeNull();
    expect(m!.params.action).toBe("claim");
  });
  it("routes the ideas collection for GET and POST only", () => {
    expect(matchRoute("GET", "/studio/api/ideas")).not.toBeNull();
    expect(matchRoute("POST", "/studio/api/ideas")).not.toBeNull();
    expect(matchRoute("DELETE", "/studio/api/ideas")).toBeNull();
  });
  it("routes idea detail with a numeric id param", () => {
    expect(matchRoute("GET", "/studio/api/ideas/12")!.params.id).toBe("12");
    expect(matchRoute("PATCH", "/studio/api/ideas/12")).not.toBeNull();
    expect(matchRoute("GET", "/studio/api/ideas/abc")).toBeNull();
  });
  it("routes drafts, publish, images, me", () => {
    expect(matchRoute("POST", "/studio/api/ideas/3/drafts")!.params.id).toBe("3");
    expect(matchRoute("POST", "/studio/api/ideas/3/publish")!.params.id).toBe("3");
    expect(matchRoute("POST", "/studio/api/images")).not.toBeNull();
    expect(matchRoute("GET", "/studio/api/me")).not.toBeNull();
  });
  it("returns null for unknown paths", () => {
    expect(matchRoute("GET", "/api/ideas")).toBeNull();     // old Netlify path must be gone
    expect(matchRoute("POST", "/api/runner/claim/extra")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/worker/router.test.ts`
Expected: FAIL — `matchRoute` is not exported.

- [ ] **Step 3: Write `worker/api/me.ts`**

```ts
import { requireUser } from "../_shared/auth";
import { json } from "../_shared/http";

export default async (req: Request, _params: Record<string, string>) => {
  const auth = await requireUser(req, ["admin", "editor"]);
  if (auth instanceof Response) return auth;
  return json({ email: auth.user.email, roles: auth.user.roles });
};
```

- [ ] **Step 4: Port `worker/api/ideas.ts`** (full file — the five mechanical changes applied)

```ts
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { drafts, ideas, runnerHeartbeat } from "../../db/schema";
import { requireUser } from "../_shared/auth";
import { json } from "../_shared/http";
import { canTransition } from "../_shared/transitions";

export default async (req: Request, params: Record<string, string>) => {
  const auth = await requireUser(req, ["admin", "editor"]);
  if (auth instanceof Response) return auth;
  const isAdmin = auth.user.roles.includes("admin");
  const id = params.id ? Number(params.id) : null;

  try {
    const db = getDb();
    if (req.method === "GET" && id === null) {
      const all = await db.select().from(ideas).orderBy(desc(ideas.createdAt));
      const [hb] = await db.select().from(runnerHeartbeat).limit(1);
      return json({ ideas: all, runnerLastSeen: hb?.lastSeen ?? null });
    }

    if (req.method === "GET" && id !== null) {
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1);
      if (!idea) return json({ error: "Idea not found" }, 404);
      const versions = await db.select().from(drafts)
        .where(eq(drafts.ideaId, id)).orderBy(desc(drafts.version));
      return json({ idea, drafts: versions });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.title?.trim()) return json({ error: "Title is required" }, 422);
      const source = body.source === "manual" ? "manual" : "agent";

      if (source === "agent") {
        if (!isAdmin) return json({ error: "Only the admin can queue AI posts" }, 403);
        const [created] = await db.insert(ideas)
          .values({ title: body.title.trim(), notes: body.notes ?? null, source, status: "pending" })
          .returning();
        return json({ idea: created }, 201);
      }

      // manual post: skips agent stages, lands at ready with a v1 draft
      if (!body.body?.trim()) return json({ error: "Post body is required" }, 422);
      const [created] = await db.insert(ideas)
        .values({ title: body.title.trim(), notes: null, source, status: "ready" })
        .returning();
      await db.insert(drafts).values({
        ideaId: created.id, version: 1,
        title: body.title.trim(), body: body.body,
        image: body.image ?? null, imageAlt: body.imageAlt ?? null,
        link: body.link ?? null, linkLabel: body.linkLabel ?? null,
      });
      return json({ idea: created }, 201);
    }

    if (req.method === "PATCH" && id !== null) {
      if (!isAdmin) return json({ error: "Only the admin can change status" }, 403);
      const { status } = await req.json();
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1);
      if (!idea) return json({ error: "Idea not found" }, 404);
      if (!canTransition(idea.status, status)) {
        return json({ error: `Cannot go ${idea.status} → ${status}` }, 409);
      }
      const [updated] = await db.update(ideas)
        .set({ status, error: status === "pending" ? null : idea.error, updatedAt: new Date() })
        .where(eq(ideas.id, id)).returning();
      return json({ idea: updated });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
};
```

- [ ] **Step 5: Port `worker/api/drafts.ts`, `worker/api/images.ts`, `worker/api/publish.ts`, `worker/api/runner.ts`**

Apply the same five mechanical changes to each Netlify original (`netlify/functions/{drafts,images,publish,runner}.ts` — read each and transform; do not restructure). Specifics:
- `drafts.ts` / `publish.ts`: `const id = Number(context.params.id)` → `const id = Number(params.id)`; publish keeps `hasRole` logic as `auth.user.roles.includes("admin")`.
- `images.ts`: signature `(req, _params: Record<string, string>)`; it uses no params and no db.
- `runner.ts`: `const action = context.params.action` → `const action = params.action`; `requireRunner(req)` call unchanged; add `const db = getDb();` as the first line inside the `try`.

- [ ] **Step 6: Replace `worker/index.ts` with the real router**

```ts
import { json } from "./_shared/http";
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
    return env.ASSETS.fetch(req);
  },
};
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS including the new router suite.

- [ ] **Step 8: Smoke-test under wrangler dev**

```bash
npx wrangler dev --port 8787 &
sleep 8
curl -s http://localhost:8787/studio/api/me                    # expect {"email":"nate@qyouthnz.com","roles":["admin","editor"]} via DEV_USER_EMAIL
curl -s -X POST http://localhost:8787/api/runner/heartbeat -H "Authorization: Bearer devtoken"
# expect {"error":"DATABASE_URL is not set"} wrapped as 500 — auth passed, db absent (fine until the DB is claimed)
curl -s -X POST http://localhost:8787/api/runner/heartbeat -H "Authorization: Bearer wrong" # expect 401 Runner not authorised
kill %1
```

- [ ] **Step 9: Commit**

```bash
git add worker/ tests/worker/router.test.ts
git commit -m "feat(cloudflare): port studio + runner API endpoints to the worker"
```

---

### Task 6: Studio front-end — drop Netlify Identity, use Access

**Files:**
- Modify: `studio-src/studio.js`
- Modify: `public/studio/index.html`
- Run: `npm run build` (regenerates gitignored `public/studio/studio.js`)

**Interfaces:**
- Consumes: `GET /studio/api/me` → `{ email: string, roles: string[] }` and the Task 5 route map. Access itself handles login before the page ever loads, so there is no login UI at all.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Edit `studio-src/studio.js`**

(a) Delete the entire `@netlify/identity` import (lines 1–3) and the `rolesOf` function.

(b) Replace `api()` so all short paths hit the new base:

```js
export async function api(path, options = {}) {
  const res = await fetch("/studio/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```

(c) Update every existing call site from absolute `/api/...` to the short form (the helper now prepends `/studio/api`): `api("/api/images"` → `api("/images"`, `api("/api/ideas"` → `api("/ideas"`, `` api(`/api/ideas/${idea.id}/publish` `` → `` api(`/ideas/${idea.id}/publish` ``, `` api(`/api/ideas/${idea.id}`,`` → `` api(`/ideas/${idea.id}`,``, `` api(`/api/ideas/${idea.id}/drafts` `` → `` api(`/ideas/${idea.id}/drafts` ``. After editing, `grep -n '"/api\|`/api' studio-src/studio.js` must return nothing.

(d) Replace `show()` — user shape is now `{ email, roles }`, and there is no login view:

```js
function show(user) {
  currentUser = user;
  $("loading").hidden = true;
  $("user-bar").hidden = !user;
  $("view-composer").hidden = !user;
  const isAdmin = !!user && user.roles.includes("admin");
  $("view-admin").hidden = !isAdmin;
  if (user) {
    $("user-email").textContent = user.email;
    $("post-date").value = new Date().toISOString().slice(0, 10);
    if (isAdmin) window.renderAdmin?.();   // defined in the admin module
  }
}
```

(e) Replace `init()` — Access has already authenticated the browser; just ask the API who we are:

```js
async function init() {
  try {
    show(await api("/me"));
  } catch (e) {
    $("loading").textContent = `Could not load your account — ${e.message}`;
    return;
  }
  // Access owns the session; this ends it for every Access app, then lands back here
  $("logout-btn").addEventListener("click", () => {
    window.location.href = "/cdn-cgi/access/logout";
  });
  $("composer-form").addEventListener("submit", publishManualPost);
}
```

(f) Delete the now-unused `handleAuthCallback`/invite/login logic (everything else in the old `init()`), keeping `publishManualPost`, `readImageAsBase64`, the toast, and the whole admin section unchanged.

- [ ] **Step 2: Edit `public/studio/index.html`**

Delete the entire `<section id="view-login" hidden>…</section>` block (the login + invite forms). Everything else stays.

- [ ] **Step 3: Rebuild the bundle and check it**

```bash
npm run build
grep -c "netlify" public/studio/studio.js   # expect 0
```

- [ ] **Step 4: Verify in wrangler dev**

```bash
npx wrangler dev --port 8787 &
sleep 8
curl -s http://localhost:8787/studio/ | grep -c "view-login"   # expect 0
kill %1
```

(Full interactive check happens on the deploy — Access doesn't exist locally; DEV_USER_EMAIL stands in.)

- [ ] **Step 5: Run tests + commit**

```bash
npm test
git add studio-src/studio.js public/studio/index.html
git commit -m "feat(cloudflare): studio auth via Access — Identity UI removed"
```

---

### Task 7: Remove the Netlify layer + update project docs

**Files:**
- Delete: `netlify/` (functions now live in `worker/`; migrations moved in Task 3), `netlify.toml`, `.netlify/` (local state, untracked or ignorable)
- Modify: `package.json` (drop `@netlify/database`, `@netlify/functions`, `@netlify/identity`, `netlify-cli`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1–6 complete (nothing may import from `netlify/` — verify, don't assume).
- Produces: a repo with no Netlify references outside docs/history.

- [ ] **Step 1: Prove nothing still imports the old tree**

```bash
grep -rn "netlify" --include="*.ts" --include="*.js" worker/ db/ tests/ studio-src/ drizzle.config.ts | grep -v node_modules
```

Expected: no output. If anything appears, fix it before deleting.

- [ ] **Step 2: Delete**

```bash
git rm -r netlify netlify.toml
rm -rf .netlify
npm uninstall @netlify/database @netlify/functions @netlify/identity netlify-cli
```

- [ ] **Step 3: Update `CLAUDE.md`** — exact edits:
  - File Inventory: replace the `netlify/functions/` row with `worker/` (`index.ts` router + `api/` endpoints + `_shared/` helpers), replace `netlify/database/migrations/` row with `db/migrations/`, replace the `netlify.toml` row with `wrangler.jsonc` + `public/_headers`, and note the studio API base is `/studio/api/*` while the runner keeps `/api/runner/*`.
  - Deployment Workflow: hosting is **Cloudflare Workers** (git-connected via Workers Builds to `pyrus117/qsite`, branch `main`); push → CF runs `npm run build` then `npx wrangler deploy`; rollback via Workers → Deployments → rollback; migrations are applied manually with `DATABASE_URL=… npm run db:migrate` (no longer automatic at deploy).
  - Blog Studio section: auth is **Cloudflare Access** (Zero Trust app on `qyouthnz.com/studio`, invite = add a rule/email to the Access policy); roles: `ADMIN_EMAILS` var → admin, any other allowed email → editor; env vars now `DATABASE_URL`, `RUNNER_TOKEN`, `GITHUB_TOKEN` (secrets, `wrangler secret put`) + `GITHUB_REPO`, `ADMIN_EMAILS`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (wrangler.jsonc vars).
  - Known Issues: delete the two Netlify-specific notes ("Netlify Identity does not work under netlify dev", "CLI draft deploys cannot reach the database"); add: "Local dev: `npm run dev` (wrangler); Access is absent locally — `DEV_USER_EMAIL` in `.dev.vars` stands in for a logged-in user and must never be set as a production var"; update the first line ("Hosting moved…") to record the Cloudflare move dated 2026-07-19.
  - Verification Loop: `npm test` line unchanged; drop any `netlify` CLI mentions.

- [ ] **Step 4: Verify + commit**

```bash
npm test
.venv/bin/python -m pytest tests/runner/
git add -A
git commit -m "chore(cloudflare): remove Netlify layer, update project docs"
```

---

### Task 8: Cutover runbook (human steps, in order)

**Files:**
- Create: `docs/CLOUDFLARE_CUTOVER_RUNBOOK.md`

**Interfaces:**
- Consumes: everything above merged on `cloudflare-migration`.
- Produces: the ordered manual checklist Nate executes; nothing in code depends on it.

- [ ] **Step 1: Write `docs/CLOUDFLARE_CUTOVER_RUNBOOK.md`** with exactly these sections (fill in the literal commands/URLs as written; keep the numbered order — later steps depend on earlier ones):

1. **URGENT — Claim the Neon database (do first, deadline ~2026-07-23).** Netlify dashboard → the qsite project → Extensions/Database → "Claim database" (hands it to your Neon account at neon.tech). Then in Neon: Dashboard → project → Connection Details → copy the **pooled** connection string. Sanity-check from the PC: `DATABASE_URL='<string>' npx drizzle-kit migrate` — expected "No migrations to apply" (or it creates `drizzle.__drizzle_migrations` and skips existing tables; if it instead errors `relation "ideas" already exists`, the tracking table didn't carry over — stop and baseline it by running the SQL in the appendix below, then re-run). Appendix SQL: `CREATE SCHEMA IF NOT EXISTS drizzle;` then insert one row per folder in `db/migrations/` into `drizzle.__drizzle_migrations(hash, created_at)` copying values from `db/migrations/meta/_journal.json`.
2. **Copy env values off Netlify before touching anything else:** Site configuration → Environment variables → record `RUNNER_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`. (These keep their values — the runner and GitHub commits must keep working unchanged.)
3. **First deploy to workers.dev:** `npx wrangler login`, then from the repo on branch `cloudflare-migration`: `npx wrangler deploy`. Set secrets: `npx wrangler secret put DATABASE_URL`, `npx wrangler secret put RUNNER_TOKEN`, `npx wrangler secret put GITHUB_TOKEN` (paste the recorded values). Visit `https://qsite.<account>.workers.dev/` — homepage renders; `/studio/` is NOT yet gated (Access comes next) but `/studio/api/me` returns 401, which proves fail-closed.
4. **Create the Access application:** Zero Trust dashboard → Access → Applications → Add → Self-hosted. Domain `qyouthnz.com`, path `studio` (covers `/studio` and everything under it, including `/studio/api/*`). Policy: Allow → Include → Emails ending in `@qyouthnz.com` (tighten to a named list later if wanted). Identity provider: the One-time PIN default is fine. After saving: Configure → copy the **Application Audience (AUD) tag**, and note the team domain (`https://<team>.cloudflareaccess.com`, visible under Zero Trust → Settings → Custom Pages). Put both real values into `wrangler.jsonc` `vars` (`CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`), commit on the branch, redeploy (`npx wrangler deploy`). Note: Access only fires on the proxied custom domain, not on workers.dev — full login testing happens after step 6.
5. **Connect Workers Builds:** Workers & Pages → qsite worker → Settings → Builds → connect GitHub repo `pyrus117/qsite`, production branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`. (Same pattern as the intranet.)
6. **Merge and let CI deploy:** merge `cloudflare-migration` → `main`, push, confirm the Workers Build goes green. (This also breaks the old Netlify build — expected; Netlify keeps serving its last good deploy until DNS moves.)
7. **Custom domains:** Worker → Settings → Domains & Routes → add `qyouthnz.com` and `www.qyouthnz.com`. Cloudflare converts the existing DNS records: apex `A 75.2.60.5` and the `www` CNAME get replaced by proxied Worker records. **Touch nothing else in the DNS zone — MX, SPF/TXT (`dc-aa8e722993._spfm` nested SPF), and any verification records are Google Workspace email and must survive.** Verify: `dig qyouthnz.com`, `dig MX qyouthnz.com` unchanged, `curl -sI https://qyouthnz.com | grep -i server` shows cloudflare.
8. **Post-cutover verification:** homepage + blog render; `curl -sI https://qyouthnz.com/ | grep -i link` shows the three preloads once; `/studio/` redirects to the Access login and gets in with a `@qyouthnz.com` email; the studio shows "Runner: online" within ~3 min of starting `python3 runner/runner.py` on the PC (`runner/.env` `STUDIO_URL=https://qyouthnz.com` — unchanged); publish a test manual post and confirm the GitHub commit lands and CF rebuilds; non-admin email sees composer but no AI pipeline panel.
9. **Decommission Netlify:** Netlify dashboard → site → Site settings → Delete site (env values were recorded in step 2; the DB survives — it's claimed on Neon now). Optionally delete `netlify-cli` remnants and the `.netlify/` dir if any machine still has one.
10. **Never set `DEV_USER_EMAIL` in production** (it bypasses Access entirely — dev-only, lives in `.dev.vars`).

- [ ] **Step 2: Commit**

```bash
git add docs/CLOUDFLARE_CUTOVER_RUNBOOK.md
git commit -m "docs(cloudflare): cutover runbook — Neon claim, Access, DNS flip"
```

---

## Self-Review Notes

- Spec coverage: every row of the handoff note's mapping table has a task (static assets → T1, functions → T5, DB → T3, Identity→Access → T4+T6+runbook 4, build → runbook 5, headers → T1, runner → resolved as "no change; path stays outside Access"). Open questions 1–4 from the note are all decided in the header/constraints.
- The `! Link` detach syntax in `_headers` and the Netlify→drizzle migration-table carry-over are the two facts verified least directly; both have explicit in-task verification steps with written fallbacks (T1 step 7, runbook step 1).
- Old `/api/ideas` paths are asserted **gone** in the router test, preventing a silent half-migration of the front-end.
