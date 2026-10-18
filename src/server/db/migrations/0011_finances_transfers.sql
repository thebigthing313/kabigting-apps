CREATE TABLE "finances_transfers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"status" text NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"from_wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid NOT NULL,
	"account_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"from_source" text,
	"from_source_key" text,
	"from_bank_description" text,
	"to_source" text,
	"to_source_key" text,
	"to_bank_description" text,
	"ignored" boolean DEFAULT false NOT NULL,
	"reconciled_actual_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_transfers_reconciled_actual_unique" UNIQUE("reconciled_actual_id"),
	CONSTRAINT "finances_transfers_status" CHECK ("finances_transfers"."status" in ('planned', 'actual')),
	CONSTRAINT "finances_transfers_positive" CHECK ("finances_transfers"."amount_cents" > 0),
	CONSTRAINT "finances_transfers_two_wallets" CHECK ("finances_transfers"."from_wallet_id" <> "finances_transfers"."to_wallet_id"),
	CONSTRAINT "finances_transfers_source" CHECK (("finances_transfers"."from_source" is null or "finances_transfers"."from_source" in ('manual', 'ofx', 'access')) and ("finances_transfers"."to_source" is null or "finances_transfers"."to_source" in ('manual', 'ofx', 'access'))),
	CONSTRAINT "finances_transfers_planned_has_no_source" CHECK ("finances_transfers"."status" = 'actual' or ("finances_transfers"."from_source" is null and "finances_transfers"."from_source_key" is null and "finances_transfers"."to_source" is null and "finances_transfers"."to_source_key" is null and not "finances_transfers"."ignored")),
	CONSTRAINT "finances_transfers_only_planned_reconciles" CHECK ("finances_transfers"."reconciled_actual_id" is null or "finances_transfers"."status" = 'planned')
);
--> statement-breakpoint
ALTER TABLE "finances_transfers" ADD CONSTRAINT "finances_transfers_from_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("from_wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transfers" ADD CONSTRAINT "finances_transfers_to_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transfers" ADD CONSTRAINT "finances_transfers_account_id_finances_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finances_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_transfers" ADD CONSTRAINT "finances_transfers_reconciled_actual_id_finances_transfers_id_fk" FOREIGN KEY ("reconciled_actual_id") REFERENCES "public"."finances_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finances_transfers_from_source_key_unique" ON "finances_transfers" USING btree ("from_wallet_id","from_source","from_source_key") WHERE "finances_transfers"."from_source_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "finances_transfers_to_source_key_unique" ON "finances_transfers" USING btree ("to_wallet_id","to_source","to_source_key") WHERE "finances_transfers"."to_source_key" is not null;--> statement-breakpoint
CREATE INDEX "finances_transfers_from_wallet_date" ON "finances_transfers" USING btree ("from_wallet_id","date");--> statement-breakpoint
CREATE INDEX "finances_transfers_to_wallet_date" ON "finances_transfers" USING btree ("to_wallet_id","date");--> statement-breakpoint
ALTER TABLE "finances_occurrences" ADD CONSTRAINT "finances_occurrences_reconciled_transfer_id_finances_transfers_id_fk" FOREIGN KEY ("reconciled_transfer_id") REFERENCES "public"."finances_transfers"("id") ON DELETE no action ON UPDATE no action;