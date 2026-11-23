-- Modified by Agental: a ticket can carry the id another system knows it by.
-- Additive only: the previous release never reads or writes the column.
ALTER TABLE "tickets" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "tickets_spaceId_externalId_key" ON "tickets"("spaceId", "externalId");
