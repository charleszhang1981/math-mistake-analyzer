-- Add optional review note for milestone 5 review records
ALTER TABLE "ReviewSchedule"
ADD COLUMN "reviewNote" TEXT;

-- Speed up due-item query and pending-schedule lookup
CREATE INDEX "ReviewSchedule_scheduledFor_idx" ON "ReviewSchedule"("scheduledFor");
CREATE INDEX "ReviewSchedule_errorItemId_completedAt_idx" ON "ReviewSchedule"("errorItemId", "completedAt");
