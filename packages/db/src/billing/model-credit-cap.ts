import { randomUUID } from "node:crypto";
import { MODEL_CREDIT_CAP_REACHED_ERROR, MODEL_CREDIT_DAILY_CAP_ERROR } from "@rakazo/core";
import type { PrismaClient } from "../database/client.js";
import { runAsSystemInTransaction } from "../database/row-security.js";
import type { Prisma } from "../generated/prisma/client.js";

/** Attributed credit deltas include holds and survive deletion. Legacy baselines cannot
 * distinguish hosted spend from personal-key usage, so they cannot be assigned to a user. */
async function committedModelCredits(tx: Prisma.TransactionClient, userId: string) {
  const [row] = await tx.$queryRaw<{ micros: bigint }[]>`
    SELECT COALESCE(-SUM("amountMicros"), 0)::bigint AS micros
    FROM billing_audit_events
    WHERE "userId"=${userId} AND "callId" IS NOT NULL AND source LIKE 'credit:%'`;
  return row!.micros;
}

/** Only capped reservations reach here. The user lock covers calls across billing organizations. */
export async function enforceModelCreditCap(
  tx: Prisma.TransactionClient,
  userId: string,
  reservationMicros: bigint,
) {
  await runAsSystemInTransaction(tx, "enforce an operator-set model credit cap", async () => {
    const [user] = await tx.$queryRaw<{ modelCreditCapMicros: bigint | null }[]>`
      SELECT "modelCreditCapMicros" FROM "user" WHERE id=${userId} FOR UPDATE`;
    if (user?.modelCreditCapMicros == null) return;
    if ((await committedModelCredits(tx, userId)) + reservationMicros > user.modelCreditCapMicros)
      throw new Error(MODEL_CREDIT_CAP_REACHED_ERROR);
  });
}

/**
 * Modified by Agental: the deployment's daily ceiling per organization. Holds count as well as
 * settled calls, so work in flight cannot overshoot it. The caller holds the account lock, which
 * orders this organization's reservations.
 */
export async function enforceDailyCreditCap(
  tx: Prisma.TransactionClient,
  organizationId: string,
  reservationMicros: bigint,
  capMicros: bigint,
  now: Date,
) {
  const [row] = await tx.$queryRaw<{ micros: bigint }[]>`
    SELECT COALESCE(-SUM("amountMicros"), 0)::bigint AS micros
    FROM model_credit_entries
    WHERE "organizationId"=${organizationId} AND "callId" IS NOT NULL AND "createdAt" >= ${utcDayStart(now)}`;
  if (row!.micros + reservationMicros > capMicros) throw new Error(MODEL_CREDIT_DAILY_CAP_ERROR);
}

const MAX_DAILY_CAP_MICROS = 10_000_000_000n;

/** Start of the UTC day `now` falls in: the day a daily cap counts. */
const utcDayStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Modified by Agental: sets an organization's own daily cap, or with null returns it to the
 * deployment's default. Operator-only: no member-facing mutation reaches this.
 */
export async function setDailyCreditCap(
  prisma: PrismaClient,
  organizationId: string,
  capMicros: bigint | null,
) {
  if (capMicros !== null && (capMicros <= 0n || capMicros > MAX_DAILY_CAP_MICROS))
    throw new Error("Daily cap must be above $0 and at most $10,000");
  await prisma.$transaction(async (tx) => {
    // The account is locked before the old value is read, so two changes at once each record
    // the value they really replaced. An organization new to credits gets its account here.
    await tx.$executeRaw`
      INSERT INTO model_credit_accounts ("organizationId", "updatedAt")
      VALUES (${organizationId}, now()) ON CONFLICT ("organizationId") DO NOTHING`;
    const [previous] = await tx.$queryRaw<{ dailyCapMicros: bigint | null }[]>`
      SELECT "dailyCapMicros" FROM model_credit_accounts
      WHERE "organizationId"=${organizationId} FOR UPDATE`;
    await tx.modelCreditAccount.update({
      where: { organizationId },
      data: { dailyCapMicros: capMicros },
    });
    await tx.billingAuditEvent.create({
      data: {
        source: `daily-cap:${randomUUID()}`,
        kind: "daily_cap_changed",
        organizationId,
        details: {
          previousMicros: previous?.dailyCapMicros?.toString() ?? null,
          capMicros: capMicros?.toString() ?? null,
          by: "operator",
        },
      },
    });
  });
}

/** The cap in force for an organization today and what its work has taken so far (holds included). */
export async function dailyCreditCapStatus(
  prisma: PrismaClient,
  organizationId: string,
  defaultCapMicros: bigint | null,
  now = new Date(),
) {
  const account = await prisma.modelCreditAccount.findUnique({
    where: { organizationId },
    select: { dailyCapMicros: true },
  });
  const [row] = await prisma.$queryRaw<{ micros: bigint }[]>`
    SELECT COALESCE(-SUM("amountMicros"), 0)::bigint AS micros
    FROM model_credit_entries
    WHERE "organizationId"=${organizationId} AND "callId" IS NOT NULL AND "createdAt" >= ${utcDayStart(now)}`;
  return {
    capMicros: account?.dailyCapMicros ?? defaultCapMicros,
    own: account?.dailyCapMicros != null,
    usedMicros: row!.micros,
  };
}

/**
 * Modified by Agental: what an organization's work has taken (holds included) since credits were
 * last added to it. With the balance, this is how far through its current credits it is.
 */
export async function creditsUsedSinceAdded(prisma: PrismaClient, organizationId: string) {
  const [row] = await prisma.$queryRaw<{ micros: bigint }[]>`
    SELECT COALESCE(-SUM("amountMicros"), 0)::bigint AS micros
    FROM model_credit_entries
    WHERE "organizationId"=${organizationId} AND "callId" IS NOT NULL
      AND "createdAt" >= COALESCE(
        (SELECT MAX("createdAt") FROM model_credit_entries
          WHERE "organizationId"=${organizationId} AND "callId" IS NULL AND "amountMicros" > 0),
        '-infinity'::timestamp)`;
  return row!.micros > 0n ? row!.micros : 0n;
}

/** Operator-only control; no user-facing mutation exposes this setting. Null removes the cap. */
export async function setModelCreditCap(
  prisma: PrismaClient,
  userId: string,
  capMicros: bigint | null,
) {
  if (capMicros !== null && (capMicros < 0n || capMicros > 10_000_000_000n))
    throw new Error("Usage cap must be between $0 and $10,000");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id=${userId} FOR UPDATE`;
    const previous = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { modelCreditCapMicros: true },
    });
    await tx.user.update({ where: { id: userId }, data: { modelCreditCapMicros: capMicros } });
    await tx.billingAuditEvent.create({
      data: {
        source: `usage-cap:${randomUUID()}`,
        kind: "usage_cap_changed",
        userId,
        details: {
          previousMicros: previous.modelCreditCapMicros?.toString() ?? null,
          capMicros: capMicros?.toString() ?? null,
          by: "operator",
        },
      },
    });
    return modelCreditCapStatusTx(tx, userId);
  });
}

async function modelCreditCapStatusTx(tx: Prisma.TransactionClient, userId: string) {
  const { modelCreditCapMicros: capMicros } = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { modelCreditCapMicros: true },
  });
  const committedMicros = await committedModelCredits(tx, userId);
  const remaining = capMicros === null ? null : capMicros - committedMicros;
  return {
    capMicros,
    committedMicros,
    remainingMicros: remaining === null ? null : remaining > 0n ? remaining : 0n,
  };
}

export function modelCreditCapStatus(prisma: PrismaClient, userId: string) {
  return prisma.$transaction((tx) => modelCreditCapStatusTx(tx, userId));
}
