import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { drafts, ideas } from "../../db/schema";
import { hasRole, requireUser, rolesOf } from "./_shared/auth";
import { mergePost } from "./_shared/blogMerge";
import { getFile, putFile } from "./_shared/github";
import { json } from "./_shared/http";

export default async (req: Request, context: Context) => {
  const auth = await requireUser(["admin", "editor"]);
  if (auth instanceof Response) return auth;
  const isAdmin = hasRole(rolesOf(auth.user), ["admin"]);
  const id = Number(context.params.id);

  try {
    const [idea] = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1);
    if (!idea) return json({ error: "Idea not found" }, 404);
    if (idea.status === "published") return json({ error: "Already published" }, 409);
    if (idea.source === "agent" && !isAdmin) {
      return json({ error: "Only the admin can publish AI pipeline posts" }, 403);
    }
    const publishableFrom = idea.source === "manual" ? ["ready", "approved"] : ["approved"];
    if (!publishableFrom.includes(idea.status)) {
      return json({ error: `Cannot publish from status "${idea.status}"` }, 409);
    }

    const [draft] = await db.select().from(drafts)
      .where(eq(drafts.ideaId, id)).orderBy(desc(drafts.version)).limit(1);
    if (!draft?.body || !draft.title) return json({ error: "No complete draft to publish" }, 422);

    const { date } = await req.json().catch(() => ({} as { date?: string }));
    const postDate = date ?? new Date().toISOString().slice(0, 10);

    const file = await getFile("public/site-data.json");
    const merged = mergePost(file.content, {
      title: draft.title, date: postDate, body: draft.body,
      // runner posts are always authored by Nate (admin-only publish enforced above)
      author: idea.source === "agent" ? "Nate" : undefined,
      image: draft.image ?? undefined, imageAlt: draft.imageAlt ?? undefined,
      imageCredit: draft.imageCredit ?? undefined,
      link: draft.link ?? undefined, linkLabel: draft.linkLabel ?? undefined,
    });
    await putFile("public/site-data.json", merged,
      `blog: publish "${draft.title}"`, file.sha);

    const [updated] = await db.update(ideas)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(ideas.id, id)).returning();
    return json({ idea: updated, publishedDate: postDate });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Publish failed" }, 500);
  }
};

export const config: Config = {
  path: "/api/ideas/:id/publish",
  method: ["POST"],
};
