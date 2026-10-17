CREATE TABLE "finances_wallets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"in_forecast" boolean DEFAULT false NOT NULL,
	"low_balance_threshold_cents" bigint DEFAULT 0 NOT NULL,
	"shown_as_owed" boolean DEFAULT false NOT NULL,
	"bank_account_hash" text,
	"bank_account_last4" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_wallets_bank_account_hash_unique" UNIQUE("bank_account_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "finances_wallets_name_unique" ON "finances_wallets" USING btree (lower("name"));