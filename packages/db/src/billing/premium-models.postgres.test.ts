// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../database/client.js";
import { createDb } from "../database/client.js";
import { asSystem } from "../database/row-security.js";
import { premiumModelsAllowed, setPremiumModels } from "./premium-models.js";

const dbTests = process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe : describe.skip;
dbTests("premium models opt-in", () => {
  let organizationId: string;
  let db: ReturnType<typeof createDb>;
  let prisma: PrismaClient;
  beforeAll(() => {
    db = createDb(process.env.DATABASE_URL!);
    // An operator setting, so it is made the way an operator command makes it.
    prisma = asSystem(db.prisma);
  });
  beforeEach(async () => {
    organizationId = `premium-test-${process.pid}-${crypto.randomUUID()}`;
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Premium fixture",
        slug: organizationId,
        createdAt: new Date(),
      },
    });
  });
  afterEach(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await db.pool.end();
  });

  it("is off until the operator turns it on, and each change is journaled with what it replaced", async () => {
    // No credit account yet: not opted in.
    expect(await premiumModelsAllowed(prisma, organizationId)).toBe(false);
    await setPremiumModels(prisma, organizationId, true);
    expect(await premiumModelsAllowed(prisma, organizationId)).toBe(true);
    await setPremiumModels(prisma, organizationId, false);
    expect(await premiumModelsAllowed(prisma, organizationId)).toBe(false);
    const journal = await prisma.billingAuditEvent.findMany({
      where: { organizationId, kind: "premium_models_changed" },
      orderBy: { createdAt: "asc" },
      select: { details: true },
    });
    expect(journal.map((event) => event.details)).toEqual([
      { previous: false, allowed: true, by: "operator" },
      { previous: true, allowed: false, by: "operator" },
    ]);
    // The opt-in made the account without choosing a funding mode or granting anything.
    const account = await prisma.modelCreditAccount.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(account).toMatchObject({ mode: null, balanceMicros: 0n, dailyCapMicros: null });
  });
});
