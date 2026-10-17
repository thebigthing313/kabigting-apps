CREATE TABLE "finances_balance_checks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finances_balance_checks" ADD CONSTRAINT "finances_balance_checks_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finances_balance_checks_wallet_date_unique" ON "finances_balance_checks" USING btree ("wallet_id","date");