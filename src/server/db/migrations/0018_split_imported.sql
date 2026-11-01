ALTER TABLE "split_expenses" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "split_payments" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;