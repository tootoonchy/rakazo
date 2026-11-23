// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import {
  MODEL_CREDIT_CAP_REACHED_ERROR,
  MODEL_CREDIT_DAILY_CAP_ERROR,
  MODEL_CREDITS_EXHAUSTED_ERROR,
} from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import type { PrismaClient } from "../database/client.js";
import { runAsSystem } from "../database/row-security.js";
import {
  computersBilledToCredits,
  computerTimeCostUsd,
  coveredCostUsd,
  dailyCreditCapMicros,
} from "./cost-markup.js";
import { dailyCreditCapStatus } from "./model-credit-cap.js";
import {
  reserveModelCredits,
  settleModelCreditsTx,
  unexpiredCreditAccount,
} from "./model-credits.js";

/**
 * Computer time taken from credits. A run that starts for an organization on credits carries its
 * hourly rate (`computer_runs.creditRateMicros`), and each stretch of its time is taken once: at
 * every idle check while it runs and when it ends. The stretch is a credit entry like a model
 * call's, held and settled by the same ledger, so lots, the daily cap and the audit journal all
 * see it. The real cost is the entry's receipt; what was taken is its amount.
 */
export const COMPUTER_USAGE_PROVIDER = "computers";

/**
 * A running computer's shorter stretches wait for the next charge rather than become entries of
 * their own. An ended run has no next charge, so whatever is left of it is taken.
 */
const MIN_OPEN_STRETCH_MS = 1_000;

const REFUSALS = new Set([
  MODEL_CREDITS_EXHAUSTED_ERROR,
  MODEL_CREDIT_DAILY_CAP_ERROR,
  MODEL_CREDIT_CAP_REACHED_ERROR,
]);
const isRefusal = (error: unknown) => error instanceof Error && REFUSALS.has(error.message);

/**
 * The credits an organization can still spend right now, in micro-dollars: its balance, or what
 * is left of the day's cap when that is less.
 */
async function creditRoomMicros(prisma: PrismaClient, organizationId: string, now: Date) {
  const [account, daily] = await Promise.all([
    unexpiredCreditAccount(prisma, organizationId, now),
    dailyCreditCapStatus(prisma, organizationId, dailyCreditCapMicros(), now),
  ]);
  const underCap = daily.capMicros === null ? null : daily.capMicros - daily.usedMicros;
  const room =
    underCap !== null && underCap < account.balanceMicros ? underCap : account.balanceMicros;
  return { room, capped: underCap !== null && underCap <= account.balanceMicros };
}

/**
 * Why an organization whose computers run on credits may not run one now, or null when it may:
 * nothing is left, or the day's cap is reached. One micro-dollar is not enough to hold.
 */
export async function computerCreditsRefusal(
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
): Promise<string | null> {
  return runAsSystem("an organization's credits for computer time", async () => {
    const { room, capped } = await creditRoomMicros(prisma, organizationId, now);
    if (room > 1n) return null;
    return capped ? MODEL_CREDIT_DAILY_CAP_ERROR : MODEL_CREDITS_EXHAUSTED_ERROR;
  });
}

/**
 * Holds the stretch's cost. The time is already used, so when the organization cannot cover all
 * of it, what room is left is held instead and the charge still settles in full: the balance
 * then says what is owed and nothing more starts. Null when there is no room at all.
 */
async function holdStretch(
  prisma: PrismaClient,
  organizationId: string,
  costUsd: number,
  attribution: { callId: string; spaceId: string; provider: string; model: string },
  now: Date,
): Promise<string | null> {
  try {
    return await reserveModelCredits(prisma, organizationId, costUsd, attribution, now);
  } catch (error) {
    if (!isRefusal(error)) throw error;
  }
  const { room } = await creditRoomMicros(prisma, organizationId, now);
  if (room <= 1n) return null;
  // One micro-dollar less than the room, so rounding the hold up cannot overshoot it.
  const coveredUsd = Math.min(costUsd, coveredCostUsd(room - 1n, attribution.provider));
  if (coveredUsd <= 0) return null;
  try {
    return await reserveModelCredits(prisma, organizationId, coveredUsd, attribution, now);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return null;
  }
}

export type ComputerRunCharge = "charged" | "nothing" | "refused" | "unpaid";

/**
 * Takes one run's time since it was last charged from its organization's credits.
 *  - `charged`: an entry was settled and the run is charged through now (or its end).
 *  - `nothing`: the run is not charged to credits, or has no new time to take.
 *  - `refused`: the run is still open and its organization has no room left; it must stop.
 *  - `unpaid`: the run has ended and its organization has no room left. The remainder is
 *    written to the billing audit journal and never tried again.
 * Each stretch is named by the run and where the stretch starts, and the run moves forward in
 * the transaction that settles it, so the same time is never taken twice.
 */
export async function chargeComputerRun(
  prisma: PrismaClient,
  runId: string,
  now = new Date(),
): Promise<ComputerRunCharge> {
  return runAsSystem("take computer time from an organization's credits", async () => {
    const run = await prisma.computerRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        kind: true,
        size: true,
        spaceId: true,
        startedAt: true,
        endedAt: true,
        creditRateMicros: true,
        creditedThroughAt: true,
        space: { select: { organizationId: true } },
      },
    });
    if (!run?.creditRateMicros || !run.spaceId || !run.space) return "nothing";
    const rate = run.creditRateMicros;
    const from = run.creditedThroughAt ?? run.startedAt;
    const through = run.endedAt ?? now;
    if (through.getTime() - from.getTime() < (run.endedAt ? 1 : MIN_OPEN_STRETCH_MS))
      return "nothing";
    const organizationId = run.space.organizationId;
    const callId = `computer:${run.id}:${from.getTime()}`;
    const reservationId = await holdStretch(
      prisma,
      organizationId,
      computerTimeCostUsd(rate, from, through),
      {
        callId,
        spaceId: run.spaceId,
        provider: COMPUTER_USAGE_PROVIDER,
        model: run.size ?? run.kind,
      },
      now,
    );
    if (reservationId) {
      // The stretch settles below, or at the next charge of the same stretch: it is not a model
      // call the credit reconciler could look up.
      await prisma.modelCreditEntry.updateMany({
        where: { id: reservationId, pending: true },
        data: { nextReconcileAt: null },
      });
    } else if (!run.endedAt) return "refused";

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM computer_runs WHERE id=${run.id} FOR UPDATE`;
      const locked = await tx.computerRun.findUnique({
        where: { id: run.id },
        select: { startedAt: true, endedAt: true, creditedThroughAt: true },
      });
      // Another charge of this stretch got here first.
      if (!locked || (locked.creditedThroughAt ?? locked.startedAt).getTime() !== from.getTime())
        return "nothing";
      const to = locked.endedAt ?? now;
      if (to <= from) return "nothing";
      const costUsd = computerTimeCostUsd(rate, from, to);
      if (!reservationId) {
        await tx.billingAuditEvent.create({
          data: {
            source: `computer-unpaid:${run.id}:${from.getTime()}`,
            kind: "computer_time_unpaid",
            organizationId,
            spaceId: run.spaceId,
            provider: COMPUTER_USAGE_PROVIDER,
            details: {
              runId: run.id,
              from: from.toISOString(),
              to: to.toISOString(),
              hourlyCostMicros: rate,
              costUsd,
            },
          },
        });
        await tx.computerRun.update({ where: { id: run.id }, data: { creditedThroughAt: to } });
        return "unpaid";
      }
      await settleModelCreditsTx(tx, reservationId, costUsd, false, now);
      await tx.modelCreditEntry.update({
        where: { id: reservationId },
        data: {
          usage: {
            costUsd,
            costSource: "deployment-tariff",
            usageSource: "metered",
            inputTokens: null,
            outputTokens: null,
            computerRunId: run.id,
            from: from.toISOString(),
            to: to.toISOString(),
            hourlyCostMicros: rate,
          },
          reconciliationState: "complete",
          nextReconcileAt: null,
        },
      });
      await tx.computerRun.update({ where: { id: run.id }, data: { creditedThroughAt: to } });
      return "charged";
    });
  });
}

/**
 * Takes a running computer's time so far, at an idle check. A run that started before its time
 * was taken from credits (the setting was off, its organization paid another way, or its start
 * was never recorded) is charged from now on, never for the time before.
 */
export async function chargeOpenComputerRun(
  prisma: PrismaClient,
  computer: { id: string; runningSince: Date },
  hourlyCostMicros: (run: { kind: string; size: string | null }) => number,
  now = new Date(),
): Promise<ComputerRunCharge> {
  const run = await runAsSystem("a running computer's time to take from credits", async () => {
    const open = await prisma.computerRun.findFirst({
      where: { computerId: computer.id, startedAt: computer.runningSince, endedAt: null },
      select: { id: true, kind: true, size: true, creditRateMicros: true },
    });
    if (open && open.creditRateMicros === null)
      await prisma.computerRun.updateMany({
        where: { id: open.id, creditRateMicros: null },
        data: { creditRateMicros: hourlyCostMicros(open), creditedThroughAt: now },
      });
    return open;
  });
  return run ? chargeComputerRun(prisma, run.id, now) : "nothing";
}

/**
 * Takes the time of runs that have ended and still have some to take: all of one computer's when
 * it has just stopped, or a bounded batch of any as the safety net for an end nobody charged
 * (a crash, or a run closed by the reconciler). Never fails its caller.
 */
export async function chargeEndedComputerRuns(
  prisma: PrismaClient,
  computerId?: string,
  now = new Date(),
): Promise<void> {
  if (!computersBilledToCredits()) return;
  try {
    const runs = await runAsSystem(
      "ended computer runs with time to take from credits",
      () =>
        prisma.$queryRaw<{ id: string }[]>`
        SELECT r."id" FROM "computer_runs" AS r
        WHERE r."creditRateMicros" IS NOT NULL AND r."endedAt" IS NOT NULL
          AND (r."creditedThroughAt" IS NULL OR r."creditedThroughAt" < r."endedAt")
          AND r."spaceId" IS NOT NULL
          AND (${computerId ?? null}::text IS NULL OR r."computerId" = ${computerId ?? null})
        ORDER BY r."endedAt" LIMIT 25`,
    );
    for (const run of runs) {
      try {
        await chargeComputerRun(prisma, run.id, now);
      } catch (error) {
        getLogger().error("computer.credit_charge_failed", error, { "computer_run.id": run.id });
      }
    }
  } catch (error) {
    getLogger().error("computer.credit_charge_failed", error, { "computer.id": computerId });
  }
}
