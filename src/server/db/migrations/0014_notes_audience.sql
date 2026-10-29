CREATE TABLE "note_audience" (
	"note_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	CONSTRAINT "note_audience_note_id_account_id_pk" PRIMARY KEY("note_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "note_audience" ADD CONSTRAINT "note_audience_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_audience" ADD CONSTRAINT "note_audience_account_id_auth_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_audience_account_id" ON "note_audience" USING btree ("account_id");