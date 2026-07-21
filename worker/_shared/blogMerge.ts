import { slugify } from "../blogPages";

export interface BlogPost {
  title: string; date: string; body: string;
  author?: string;
  image?: string; imageAlt?: string; imageCredit?: string;
  link?: string; linkLabel?: string;
}

export function mergePost(siteDataJson: string, post: BlogPost): string {
  if (!post.title?.trim()) throw new Error("Post title is required");
  if (!post.body?.trim()) throw new Error("Post body is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error("Post date must be YYYY-MM-DD");

  // post URLs derive from the title, so slugs must be non-empty and unique
  const slug = slugify(post.title);
  if (!slug) throw new Error("Post title must contain letters or numbers");

  const data = JSON.parse(siteDataJson);
  if (!Array.isArray(data.blog)) data.blog = [];
  if (data.blog.some((p: BlogPost) => p.title === post.title && p.date === post.date)) {
    throw new Error("A post with this title and date is already published");
  }
  if (data.blog.some((p: BlogPost) => slugify(p.title) === slug)) {
    throw new Error("A published post already uses this title (post URLs come from the title) — pick a different title");
  }

  const clean: BlogPost = { title: post.title.trim(), date: post.date, body: post.body };
  if (post.author?.trim()) clean.author = post.author.trim();
  for (const key of ["image", "imageAlt", "imageCredit", "link", "linkLabel"] as const) {
    if (post[key]?.trim()) clean[key] = post[key]!.trim();
  }
  data.blog.unshift(clean);
  return JSON.stringify(data, null, 2) + "\n";
}
