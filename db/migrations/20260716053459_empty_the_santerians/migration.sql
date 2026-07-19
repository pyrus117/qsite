CREATE TABLE "drafts" (
	"id" serial PRIMARY KEY,
	"idea_id" integer NOT NULL,
	"version" integer NOT NULL,
	"brief" text,
	"title" varchar(255),
	"body" text,
	"reflection_notes" text,
	"image" varchar(255),
	"image_alt" varchar(255),
	"link" varchar(255),
	"link_label" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" serial PRIMARY KEY,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"source" varchar(10) DEFAULT 'agent' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_heartbeat" (
	"id" integer PRIMARY KEY,
	"last_seen" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_idea_id_ideas_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id");