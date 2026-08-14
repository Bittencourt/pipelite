CREATE INDEX "organizations_deleted_at_idx" ON "organizations" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "people_organization_id_idx" ON "people" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "people_deleted_at_idx" ON "people" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "deals_stage_id_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "deals_organization_id_idx" ON "deals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "deals_person_id_idx" ON "deals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deals_owner_id_idx" ON "deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "deals_deleted_at_idx" ON "deals" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "activities_due_date_idx" ON "activities" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "activities_deal_id_idx" ON "activities" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "activities_deleted_at_idx" ON "activities" USING btree ("deleted_at");