import { describe, expect, it } from "vitest";
import { validateImageUpload } from "../../netlify/functions/_shared/imageUpload";

describe("validateImageUpload", () => {
  it("accepts valid jpg filename", () => {
    expect(validateImageUpload("photo.jpg", "abc123")).toBeNull();
  });
  it("accepts valid webp filename", () => {
    expect(validateImageUpload("pride-week.webp", "abc123")).toBeNull();
  });
  it("accepts valid png filename", () => {
    expect(validateImageUpload("img.png", "abc123")).toBeNull();
  });
  it("accepts valid gif filename", () => {
    expect(validateImageUpload("anim.gif", "abc123")).toBeNull();
  });
  it("strips path separators via pop() leaving valid name (mirrors images.ts)", () => {
    // pop() strips the path — passwd.jpg is a valid filename; no error expected
    expect(validateImageUpload("../../etc/passwd.jpg", "abc")).toBeNull();
  });
  it("rejects disallowed extension", () => {
    const err = validateImageUpload("file.exe", "abc");
    expect(err).toMatch(/filename/i);
  });
  it("rejects svg (not in runner-allowed list)", () => {
    // SVG is allowed in images.ts but NOT for runner (XSS risk via runner upload)
    // validateImageUpload with strict=true blocks svg
    const err = validateImageUpload("icon.svg", "abc", { allowSvg: false });
    expect(err).toMatch(/filename/i);
  });
  it("strips data-URI prefix before size check", () => {
    const base64 = "data:image/jpeg;base64," + "a".repeat(100);
    expect(validateImageUpload("photo.jpg", base64)).toBeNull();
  });
  it("rejects base64 over 4.5M chars", () => {
    const big = "a".repeat(4_500_001);
    const err = validateImageUpload("photo.jpg", big);
    expect(err).toMatch(/large/i);
  });
  it("rejects empty base64", () => {
    const err = validateImageUpload("photo.jpg", "");
    expect(err).toMatch(/data/i);
  });
  it("rejects missing filename", () => {
    const err = validateImageUpload("", "abc");
    expect(err).toMatch(/filename/i);
  });
});
