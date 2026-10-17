CREATE TABLE "finances_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"nominal_date" date NOT NULL,
	"override_amount_cents" bigint,
	"override_date" date,
	"skipped" boolean DEFAULT false NOT NULL,
	"reconciled_transaction_id" uuid,
	"reconciled_transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finances_occurrences_reconciled_transaction_unique" UNIQUE("reconciled_transaction_id"),
	CONSTRAINT "finances_occurrences_reconciled_transfer_unique" UNIQUE("reconciled_transfer_id"),
	CONSTRAINT "finances_occurrences_touched" CHECK ("finances_occurrences"."override_amount_cents" is not null or "finances_occurrences"."override_date" is not null or "finances_occurrences"."skipped" or "finances_occurrences"."reconciled_transaction_id" is not null or "finances_occurrences"."reconciled_transfer_id" is not null),
	CONSTRAINT "finances_occurrences_one_link" CHECK ("finances_occurrences"."reconciled_transaction_id" is null or "finances_occurrences"."reconciled_transfer_id" is null)
);
--> statement-breakpoint
ALTER TABLE "finances_occurrences" ADD CONSTRAINT "finances_occurrences_schedule_id_finances_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."finances_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finances_occurrences_schedule_nominal_unique" ON "finances_occurrences" USING btree ("schedule_id","nominal_date");