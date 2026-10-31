CREATE TABLE "split_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_expenses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"total_cents" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paid" jsonb NOT NULL,
	"owed" jsonb NOT NULL,
	"added_by_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_expenses_total_not_zero" CHECK ("split_expenses"."total_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "split_shares" (
	"expense_id" uuid NOT NULL,
	"side" text NOT NULL,
	"account_id" text NOT NULL,
	"cents" bigint NOT NULL,
	CONSTRAINT "split_shares_expense_id_side_account_id_pk" PRIMARY KEY("expense_id","side","account_id"),
	CONSTRAINT "split_shares_side" CHECK ("split_shares"."side" in ('paid', 'owed')),
	CONSTRAINT "split_shares_not_zero" CHECK ("split_shares"."cents" <> 0)
);
--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_category_id_split_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."split_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_added_by_id_auth_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_changed_by_id_auth_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_account_id_auth_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "split_categories_name_unique" ON "split_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "split_expenses_date" ON "split_expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "split_expenses_category_id" ON "split_expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "split_shares_account_id" ON "split_shares" USING btree ("account_id");--> statement-breakpoint
-- The twelve Categories every household starts with (SEEDED_CATEGORY_NAMES in shared/split/categories.ts).
INSERT INTO "split_categories" ("name") VALUES ('Groceries'), ('Dining out'), ('Household supplies'), ('Home'), ('Utilities'), ('Car'), ('Travel'), ('Pets'), ('Gifts'), ('Entertainment'), ('Personal'), ('General');
