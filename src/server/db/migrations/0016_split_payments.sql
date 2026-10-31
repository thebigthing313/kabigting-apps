CREATE TABLE "split_payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"date" date NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"added_by_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_payments_amount_positive" CHECK ("split_payments"."amount_cents" > 0),
	CONSTRAINT "split_payments_between_two" CHECK ("split_payments"."from_id" <> "split_payments"."to_id")
);
--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_from_id_auth_user_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_to_id_auth_user_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_added_by_id_auth_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_changed_by_id_auth_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_payments_date" ON "split_payments" USING btree ("date");--> statement-breakpoint
CREATE INDEX "split_payments_from_id" ON "split_payments" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "split_payments_to_id" ON "split_payments" USING btree ("to_id");