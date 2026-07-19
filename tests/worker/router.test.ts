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
