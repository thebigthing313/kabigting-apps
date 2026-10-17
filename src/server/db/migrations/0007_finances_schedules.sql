CREATE TABLE "finances_schedules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"amount_cents" bigint NOT NULL,
	"unit" text NOT NULL,
	"every" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"predecessor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_schedules_unit" CHECK ("finances_schedules"."unit" in ('week', 'month')),
	CONSTRAINT "finances_schedules_every" CHECK ("finances_schedules"."every" >= 1),
	CONSTRAINT "finances_schedules_transfer_wallets" CHECK ("finances_schedules"."to_wallet_id" <> "finances_schedules"."wallet_id"),
	CONSTRAINT "finances_schedules_end_after_start" CHECK ("finances_schedules"."end_date" >= "finances_schedules"."start_date"),
	CONSTRAINT "finances_schedules_transfer_no_category" CHECK ("finances_schedules"."to_wallet_id" is null or "finances_schedules"."category_id" is null),
	CONSTRAINT "finances_schedules_transfer_positive" CHECK ("finances_schedules"."to_wallet_id" is null or "finances_schedules"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "finances_schedules" ADD CONSTRAINT "finances_schedules_account_id_finances_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finances_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_schedules" ADD CONSTRAINT "finances_schedules_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_schedules" ADD CONSTRAINT "finances_schedules_to_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_schedules" ADD CONSTRAINT "finances_schedules_category_id_finances_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finances_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finances_schedules" ADD CONSTRAINT "finances_schedules_predecessor_id_finances_schedules_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."finances_schedules"("id") ON DELETE no action ON UPDATE no action;