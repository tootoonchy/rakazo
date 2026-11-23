// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../database/client.js";

/**
 * Whether an organization's credits may pay for a premium model. An organization with no credit
 * account has not opted in.
 */
export async function premiumModelsAllowed(
  prisma: Pick<PrismaClient, "modelCreditAccount">,
  organizationId: string,
): Promise<boolean> {
  const account = await prisma.modelCreditAccount.findUnique({
    where: { organizationId },
    select: { premiumModels: true },
  });
  return account?.premiumModels === true;
}

/**
 * Turns premium models on or off for one organization. Operator-only: no member-facing mutation
 * reaches this. The change is written to the billing audit journal.
 */
export async function setPremiumModels(
  prisma: PrismaClient,
  organizationId: string,
  allowed: boolean,
) {
  await prisma.$transaction(async (tx) => {
    // Locked before the old value is read, so two changes at once each record what they replaced.
    await tx.$executeRaw`
      INSERT INTO model_credit_accounts ("organizationId", "updatedAt")
      VALUES (${organizationId}, now()) ON CONFLICT ("organizationId") DO NOTHING`;
    const [previous] = await tx.$queryRaw<{ premiumModels: boolean }[]>`
      SELECT "premiumModels" FROM model_credit_accounts
      WHERE "organizationId"=${organizationId} FOR UPDATE`;
    await tx.modelCreditAccount.update({
      where: { organizationId },
      data: { premiumModels: allowed },
    });
    await tx.billingAuditEvent.create({
      data: {
        source: `premium-models:${randomUUID()}`,
        kind: "premium_models_changed",
        organizationId,
        details: { previous: previous?.premiumModels ?? false, allowed, by: "operator" },
      },
    });
  });
}
