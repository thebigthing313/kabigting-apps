CREATE TABLE "finances_transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"status" text NOT NULL,
	"wallet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"bank_description" text,
	"source" text,
	"source_key" text,
	"ignored" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reconciled_actual_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_transactions_reconciled_actual_unique" UNIQUE("reconciled_actual_id"),
	CONSTRAINT "finances_transactions_status" CHECK ("finances_transactions"."status" in ('planned', 'actual')),
	CONSTRAINT "finances_transactions_source" CHECK ("finances_transactions"."source" is null or "finances_transactions"."source" in ('manual', 'ofx', 'access')),
	CONSTRAINT "finances_transactions_planned_has_no_source" CHECK ("finances_transactions"."status" = 'actual' or ("finances_transactions"."source" is null and "finances_transactions"."source_key" is null and not "finances_transactions"."ignored")),
	CONSTRAINT "finances_transactions_only_planned_reconciles" CHECK ("finances_transactions"."reconciled_actual_id" is null or "finances_transactions"."status" = 'planned')
);
--> statement-breakpoint
ALTER TABLE "finances_transactions" ADD CONSTRAINT "finances_transactions_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transactions" ADD CONSTRAINT "finances_transactions_account_id_finances_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finances_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transactions" ADD CONSTRAINT "finances_transactions_category_id_finances_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finances_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transactions" ADD CONSTRAINT "finances_transactions_reconciled_actual_id_finances_transactions_id_fk" FOREIGN KEY ("reconciled_actual_id") REFERENCES "public"."finances_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finances_transactions_source_key_unique" ON "finances_transactions" USING btree ("wallet_id","source","source_key") WHERE "finances_transactions"."source_key" is not null;--> statement-breakpoint
CREATE INDEX "finances_transactions_wallet_date" ON "finances_transactions" USING btree ("wallet_id","date");--> statement-breakpoint
ALTER TABLE "finances_occurrences" ADD CONSTRAINT "finances_occurrences_reconciled_transaction_id_finances_transactions_id_fk" FOREIGN KEY ("reconciled_transaction_id") REFERENCES "public"."finances_transactions"("id") ON DELETE no action ON UPDATE no action;