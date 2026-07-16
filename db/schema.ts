import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const ideas = pgTable("ideas", {
  id: serial().primaryKey(),
  title: varchar({ length: 255 }).notNull(),
  notes: text(),
  source: varchar({ length: 10 }).notNull().default("agent"),   // 'agent' | 'manual'
  status: varchar({ length: 20 }).notNull().default("pending"),
  error: text(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: serial().primaryKey(),
  ideaId: integer("idea_id").notNull().references(() => ideas.id),
  version: integer().notNull(),
  brief: text(),
  title: varchar({ length: 255 }),
  body: text(),
  reflectionNotes: text("reflection_notes"),
  image: varchar({ length: 255 }),
  imageAlt: varchar("image_alt", { length: 255 }),
  link: varchar({ length: 255 }),
  linkLabel: varchar("link_label", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const runnerHeartbeat = pgTable("runner_heartbeat", {
  id: integer().primaryKey(),                                    // always row 1
  lastSeen: timestamp("last_seen").notNull(),
});

export type Idea = typeof ideas.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
