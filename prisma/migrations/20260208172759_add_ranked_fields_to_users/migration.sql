-- AlterTable
ALTER TABLE "users" ADD COLUMN     "leaguePoints" INTEGER,
ADD COLUMN     "rank" TEXT,
ADD COLUMN     "rankedLosses" INTEGER,
ADD COLUMN     "rankedWins" INTEGER,
ADD COLUMN     "summonerId" TEXT,
ADD COLUMN     "tier" TEXT;

-- CreateIndex
CREATE INDEX "users_tier_idx" ON "users"("tier");
