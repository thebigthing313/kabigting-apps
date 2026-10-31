CREATE INDEX "split_expenses_added_by_id" ON "split_expenses" USING btree ("added_by_id");--> statement-breakpoint
CREATE INDEX "split_expenses_changed_by_id" ON "split_expenses" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX "split_payments_added_by_id" ON "split_payments" USING btree ("added_by_id");--> statement-breakpoint
CREATE INDEX "split_payments_changed_by_id" ON "split_payments" USING btree ("changed_by_id");