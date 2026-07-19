import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { drafts, ideas } from "../../db/schema";
import { requireUser } from "../_shared/auth";
import { json } from "../_shared/http";

export default async (req: Request, params: Record<string, string>) => {
  const auth = await requireUser(req, ["admin", "editor"]);
  if (auth instanceof Response) return auth;
  const isAdmin = auth.user.roles.includes("admin");
  const id = Number(params.id);

  try {
    const db = getDb();
    const [idea] = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1);
    if (!idea) return json({ error: "Idea not found" }, 404);
    if (idea.status === "published") return json({ error: "Already published — start a new post" }, 409);
    if (idea.source === "agent" && !isAdmin) {
      return json({ error: "Only the admin can edit AI pipeline drafts" }, 403);
    }

    const body = await req.json();
    if (!body.title?.trim() || !body.body?.trim()) {
      return json({ error: "Title and body are required" }, 422);
    }

    const [latest] = await db.select().from(drafts)
      .where(eq(drafts.ideaId, id)).orderBy(desc(drafts.version)).limit(1);
    const [created] = await db.insert(drafts).values({
      ideaId: id, version: (latest?.version ?? 0) + 1,
      brief: latest?.brief ?? null,
      title: body.title.trim(), body: body.body,
      image: body.image ?? null, imageAlt: body.imageAlt ?? null,
      link: body.link ?? null, linkLabel: body.linkLabel ?? null,
    }).returning();
    return json({ draft: created }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
};
