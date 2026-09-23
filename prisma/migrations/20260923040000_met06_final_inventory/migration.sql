-- Existing rows stay unknown until the transactional offline rebuild.
ALTER TABLE "match_participants" ADD COLUMN "finalInventory" JSONB;
