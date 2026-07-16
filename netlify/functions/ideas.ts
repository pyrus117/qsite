import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { drafts, ideas } from "../../db/schema";
import { hasRole, requireUser, rolesOf } from "./_shared/auth";
import { json } from "./_shared/http";
import { canTransition } from "./_shared/transitions";

export default async (req: Request, context: Context) => {
  const auth = await requireUser(["admin", "editor"]);
  if (auth instanceof Response) return auth;
  const isAdmin = hasRole(rolesOf(auth.user), ["admin"]);
  const id = context.params.id ? Number(context.params.id) : null;

  try {
    if (req.method === "GET" && id === null) {
      const all = await db.select().from(ideas).orderBy(desc(ideas.createdAt));
      return json({ ideas: all });
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

export const config: Config = {
  path: ["/api/ideas", "/api/ideas/:id"],
  method: ["GET", "POST", "PATCH"],
};
