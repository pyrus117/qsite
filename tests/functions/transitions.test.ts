import { describe, expect, it } from "vitest";
import { canTransition } from "../../netlify/functions/_shared/transitions";

describe("canTransition", () => {
  it.each([
    ["pending", "researching"],
    ["researching", "drafting"],
    ["drafting", "reflecting"],
    ["reflecting", "ready"],
    ["ready", "approved"],
    ["approved", "published"],
    ["researching", "failed"],
    ["drafting", "failed"],
    ["reflecting", "failed"],
    ["failed", "pending"],       // retry
  ])("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["pending", "published"],    // runner can never skip to published
    ["ready", "published"],      // must be approved first
    ["published", "pending"],    // published is terminal
    ["pending", "approved"],
    ["approved", "failed"],
    ["nonsense", "pending"],
  ])("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
