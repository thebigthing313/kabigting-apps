CREATE TABLE "note_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"text" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"position" text NOT NULL,
	CONSTRAINT "note_items_checked_at" CHECK ("note_items"."checked" = ("note_items"."checked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "note_items" ADD CONSTRAINT "note_items_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_items_note_id" ON "note_items" USING btree ("note_id");