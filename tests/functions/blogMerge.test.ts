import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergePost } from "../../netlify/functions/_shared/blogMerge";

const fixture = readFileSync("tests/functions/fixtures/site-data.json", "utf-8");
const post = { title: "Test post", date: "2026-07-20", body: "First para.\n\nSecond para." };

describe("mergePost", () => {
  it("prepends the post to the blog array", () => {
    const out = JSON.parse(mergePost(fixture, post));
    expect(out.blog[0].title).toBe("Test post");
    expect(out.blog.length).toBe(JSON.parse(fixture).blog.length + 1);
  });
  it("preserves every other top-level key untouched", () => {
    const before = JSON.parse(fixture);
    const after = JSON.parse(mergePost(fixture, post));
    expect(after.sponsors).toEqual(before.sponsors);
    expect(after.directory).toEqual(before.directory);
    expect(after.resources).toEqual(before.resources);
  });
  it("strips empty optional fields", () => {
    const out = JSON.parse(mergePost(fixture, { ...post, image: "", link: undefined }));
    expect(out.blog[0]).not.toHaveProperty("image");
    expect(out.blog[0]).not.toHaveProperty("link");
  });
  it("keeps provided optional fields", () => {
    const out = JSON.parse(mergePost(fixture, { ...post, image: "pic.webp", imageAlt: "A pic" }));
    expect(out.blog[0].image).toBe("pic.webp");
    expect(out.blog[0].imageAlt).toBe("A pic");
  });
  it("throws on a duplicate title+date (double-publish guard)", () => {
    const once = mergePost(fixture, post);
    expect(() => mergePost(once, post)).toThrow(/already/i);
  });
  it("throws on required-field gaps", () => {
    expect(() => mergePost(fixture, { title: "", date: "2026-07-20", body: "x" })).toThrow();
    expect(() => mergePost(fixture, { title: "t", date: "20-07-2026", body: "x" })).toThrow(/date/i);
  });
  it("passes author through when provided", () => {
    const out = JSON.parse(mergePost(fixture, { ...post, author: "Nate" }));
    expect(out.blog[0].author).toBe("Nate");
  });
  it("omits author when not provided", () => {
    const out = JSON.parse(mergePost(fixture, post));
    expect(out.blog[0]).not.toHaveProperty("author");
  });
  it("passes imageCredit through when provided", () => {
    const out = JSON.parse(mergePost(fixture, { ...post, imageCredit: "Photo: Jane / Unsplash" }));
    expect(out.blog[0].imageCredit).toBe("Photo: Jane / Unsplash");
  });
  it("omits imageCredit when not provided", () => {
    const out = JSON.parse(mergePost(fixture, post));
    expect(out.blog[0]).not.toHaveProperty("imageCredit");
  });
});
