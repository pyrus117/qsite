import { describe, expect, it, beforeEach } from "vitest";
import { rolesOf, hasRole, requireRunner } from "../../netlify/functions/_shared/auth";

describe("rolesOf", () => {
  it("reads camelCase appMetadata roles", () => {
    expect(rolesOf({ appMetadata: { roles: ["admin"] } })).toEqual(["admin"]);
  });
  it("reads snake_case app_metadata roles", () => {
    expect(rolesOf({ app_metadata: { roles: ["editor"] } })).toEqual(["editor"]);
  });
  it("returns [] for missing metadata or null user", () => {
    expect(rolesOf({})).toEqual([]);
    expect(rolesOf(null)).toEqual([]);
  });
});

describe("hasRole", () => {
  it("passes when any allowed role present", () => {
    expect(hasRole(["editor"], ["admin", "editor"])).toBe(true);
  });
  it("fails when no allowed role present", () => {
    expect(hasRole(["editor"], ["admin"])).toBe(false);
    expect(hasRole([], ["admin"])).toBe(false);
  });
});

describe("requireRunner", () => {
  beforeEach(() => { process.env.RUNNER_TOKEN = "s3cret-token-value"; });
  const req = (auth?: string) =>
    new Request("http://x/api/runner/claim", { headers: auth ? { authorization: auth } : {} });

  it("accepts the correct bearer token", () => {
    expect(requireRunner(req("Bearer s3cret-token-value"))).toBeNull();
  });
  it("rejects a wrong token with 401", () => {
    const res = requireRunner(req("Bearer wrong"));
    expect(res?.status).toBe(401);
  });
  it("rejects a missing header with 401", () => {
    expect(requireRunner(req())?.status).toBe(401);
  });
  it("rejects when RUNNER_TOKEN is unset (fail closed)", () => {
    delete process.env.RUNNER_TOKEN;
    expect(requireRunner(req("Bearer s3cret-token-value"))?.status).toBe(401);
  });
});
