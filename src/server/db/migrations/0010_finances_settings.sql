CREATE TABLE "finances_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"open_on_home_wallet_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_settings_household" CHECK ("finances_settings"."id" = 'household')
);
--> statement-breakpoint
ALTER TABLE "finances_settings" ADD CONSTRAINT "finances_settings_open_on_home_wallet_id_finances_wallets_id_fk" FOREIGN KEY ("open_on_home_wallet_id") REFERENCES "public"."finances_wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The household's one row: home opens on All until someone picks a Wallet.
INSERT INTO "finances_settings" ("id") VALUES ('household');
