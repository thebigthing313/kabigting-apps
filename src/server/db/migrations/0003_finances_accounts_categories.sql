CREATE TABLE "finances_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "finances_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "finances_categories" ADD CONSTRAINT "finances_categories_merged_into_id_finances_categories_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."finances_categories"("id") ON DELETE no action ON UPDATE no action;