import type { Config, Context } from "@netlify/functions";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { drafts, ideas, runnerHeartbeat } from "../../db/schema";
import { requireRunner } from "./_shared/auth";
import { putBinaryFile } from "./_shared/github";
import { json } from "./_shared/http";
import { stripDataUri, validateImageUpload } from "./_shared/imageUpload";
import { canTransition } from "./_shared/transitions";

export default async (req: Request, context: Context) => {
  const denied = requireRunner(req);
  if (denied) return denied;
  const action = context.params.action;

  try {
    if (action === "heartbeat") {
      await db.insert(runnerHeartbeat).values({ id: 1, lastSeen: new Date() })
        .onConflictDoUpdate({ target: runnerHeartbeat.id, set: { lastSeen: new Date() } });
      return json({ ok: true });
    }

    if (action === "claim") {
      const [next] = await db.select().from(ideas)
        .where(and(eq(ideas.status, "pending"), eq(ideas.source, "agent")))
        .orderBy(asc(ideas.createdAt)).limit(1);
      if (!next) return json({ idea: null });
      // guarded update: if another claim got here first, rowCount is 0 and we report empty
      const [claimed] = await db.update(ideas)
        .set({ status: "researching", updatedAt: new Date() })
        .where(and(eq(ideas.id, next.id), eq(ideas.status, "pending")))
        .returning();
      return json({ idea: claimed ?? null });
    }

    if (action === "update") {
      const body = await req.json();
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, body.ideaId)).limit(1);
      if (!idea) return json({ error: "Idea not found" }, 404);
      if (body.status === "published" || body.status === "approved") {
        return json({ error: "The runner cannot approve or publish" }, 403);
      }
      if (!canTransition(idea.status, body.status)) {
        return json({ error: `Cannot go ${idea.status} → ${body.status}` }, 409);
      }

      if (body.draft) {
        const [latest] = await db.select().from(drafts)
          .where(eq(drafts.ideaId, idea.id)).orderBy(desc(drafts.version)).limit(1);
        await db.insert(drafts).values({
          ideaId: idea.id, version: (latest?.version ?? 0) + 1,
          brief: body.draft.brief ?? latest?.brief ?? null,
          title: body.draft.title ?? latest?.title ?? idea.title,
          body: body.draft.body ?? latest?.body ?? null,
          reflectionNotes: body.draft.reflectionNotes ?? null,
          image: body.draft.image ?? latest?.image ?? null,
          imageAlt: body.draft.imageAlt ?? latest?.imageAlt ?? null,
          imageCredit: body.draft.imageCredit ?? latest?.imageCredit ?? null,
          link: latest?.link ?? null, linkLabel: latest?.linkLabel ?? null,
        });
      }

      const [updated] = await db.update(ideas)
        .set({ status: body.status, error: body.error ?? null, updatedAt: new Date() })
        .where(eq(ideas.id, idea.id)).returning();
      return json({ idea: updated });
    }

    if (action === "image") {
      // runner-token image upload — same validation as images.ts but no SVG (XSS risk)
      const body = await req.json();
      const err = validateImageUpload(body.filename ?? "", body.data ?? "", { allowSvg: false });
      if (err) return json({ error: err }, err.includes("large") ? 413 : 422);

      const name = (body.filename as string).split(/[\\/]/).pop()!;
      const base64 = stripDataUri(body.data as string);
      await putBinaryFile(`public/images/${name}`, base64, `blog: add image ${name}`);
      return json({ filename: name }, 201);
    }

    return json({ error: "Unknown runner action" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
};

export const config: Config = {
  path: "/api/runner/:action",
  method: ["POST"],
};
