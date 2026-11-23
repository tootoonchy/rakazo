-- Modified by Agental: computer time taken from credits. Additive: older releases never read or
-- write either column, and a run without a rate is charged nothing.
ALTER TABLE "computer_runs"
  ADD COLUMN "creditRateMicros" INTEGER,
  ADD COLUMN "creditedThroughAt" TIMESTAMP(3);

-- Ended runs that still have time to take: what the safety-net pass looks for.
CREATE INDEX "computer_runs_uncredited_idx" ON "computer_runs"("endedAt")
  WHERE "creditRateMicros" IS NOT NULL AND "endedAt" IS NOT NULL
    AND ("creditedThroughAt" IS NULL OR "creditedThroughAt" < "endedAt");
