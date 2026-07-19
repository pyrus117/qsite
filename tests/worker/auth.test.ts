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
