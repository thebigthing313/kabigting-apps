CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"body" text,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_kind" CHECK ("notes"."kind" in ('text', 'checklist')),
	CONSTRAINT "notes_body_only_on_text" CHECK (("notes"."kind" = 'text') = ("notes"."body" is not null))
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_creator_id_auth_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_creator_id" ON "notes" USING btree ("creator_id");