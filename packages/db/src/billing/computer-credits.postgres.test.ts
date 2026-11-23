// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../database/client.js";
import { createDb } from "../database/client.js";
import { asSystem } from "../database/row-security.js";
import {
  chargeComputerRun,
  chargeEndedComputerRuns,
  chargeOpenComputerRun,
  computerCreditsRefusal,
} from "./computer-credits.js";
import { creditAccount, reconcileCreditPurchase, reserveModelCredits } from "./model-credits.js";
import { chargesComputersToCredits, sandboxAllowancePlan } from "./sandbox-allowance.js";

const dbTests = process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe : describe.skip;
dbTests("computer time taken from credits", () => {
  let id: string;
  let db: ReturnType<typeof createDb>;
  let prisma: PrismaClient;
  let system: PrismaClient;
  const start = new Date("2027-03-01T10:00:00.000Z");
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

  beforeAll(() => {
    db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    system = asSystem(prisma);
  });
  beforeEach(async () => {
    vi.stubEnv("COMPUTER_USAGE_BILLING", "credits");
    vi.stubEnv("COST_MARKUP", "2");
    id = `computer-credits-${process.pid}-${crypto.randomUUID()}`;
    await system.organization.create({
      data: { id, name: "Computer credits", slug: id, createdAt: new Date() },
    });
    await system.space.create({ data: { id, organizationId: id, name: "Computer credits" } });
    await creditAccount(prisma, id);
    await system.modelCreditAccount.update({
      where: { organizationId: id },
      data: { mode: "credits" },
    });
  });
  afterEach(async () => {
    await system.computerRun.deleteMany({ where: { spaceId: id } });
    await system.organization.delete({ where: { id } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await db.pool.end();
  });

  const fund = (amountCents: number) =>
    reconcileCreditPurchase(prisma, id, { id: `${id}-paid`, amountCents });
  const balance = async () => (await creditAccount(prisma, id)).balanceMicros;
  /** A run that began at `start`, at $0.20 an hour unless told otherwise. */
  const run = (data: { startedAt?: Date; endedAt?: Date; creditRateMicros?: number | null } = {}) =>
    system.computerRun.create({
      data: {
        computerId: id,
        spaceId: id,
        kind: "fake",
        startedAt: start,
        creditRateMicros: 200_000,
        ...data,
      },
    });
  const entries = () =>
    system.modelCreditEntry.findMany({
      where: { organizationId: id, provider: "computers" },
      orderBy: { createdAt: "asc" },
    });

  it("takes each stretch once at the hourly rate times the markup, and the remainder at the end", async () => {
    await fund(1000);
    const { id: runId } = await run();
    // Thirty minutes at $0.20 an hour really cost $0.10, so $0.20 of credits are taken.
    expect(await chargeComputerRun(prisma, runId, after(30))).toBe("charged");
    expect(await balance()).toBe(9_800_000n);
    // The same moment again, as a retried job would ask, takes nothing more.
    expect(await chargeComputerRun(prisma, runId, after(30))).toBe("nothing");
    expect(await balance()).toBe(9_800_000n);

    // The run ends fifteen minutes later: only those fifteen minutes are left to take.
    await system.computerRun.update({ where: { id: runId }, data: { endedAt: after(45) } });
    await chargeEndedComputerRuns(prisma, id);
    await chargeEndedComputerRuns(prisma);
    expect(await balance()).toBe(9_700_000n);
    expect(
      (await system.computerRun.findUniqueOrThrow({ where: { id: runId } })).creditedThroughAt,
    ).toEqual(after(45));

    // Each entry is settled, keeps its real cost as its receipt, and is done with reconciling.
    const settled = await entries();
    expect(settled.map((entry) => [entry.pending, entry.reconciliationState])).toEqual([
      [false, "complete"],
      [false, "complete"],
    ]);
    expect(settled.map((entry) => (entry.usage as { costUsd: number }).costUsd)).toEqual([
      expect.closeTo(0.1, 9),
      expect.closeTo(0.05, 9),
    ]);
    expect(settled.map((entry) => entry.amountMicros)).toEqual([-200_000n, -100_000n]);
  });

  it("settles a stretch whose hold was made before a crash, for the whole stretch and only once", async () => {
    await fund(1000);
    const { id: runId } = await run();
    // The hold for the first ten minutes was made, and the process died before settling it.
    await reserveModelCredits(prisma, id, 0.2 / 6, {
      callId: `computer:${runId}:${start.getTime()}`,
      spaceId: id,
      provider: "computers",
      model: "fake",
    });
    // The next charge of the same stretch, now an hour long, reuses that hold.
    expect(await chargeComputerRun(prisma, runId, after(60))).toBe("charged");
    expect(await balance()).toBe(9_600_000n);
    expect(await entries()).toHaveLength(1);
  });

  it("leaves a run alone that is not charged to credits, and charges an adopted one from now on", async () => {
    await fund(1000);
    const { id: runId } = await run({ creditRateMicros: null });
    expect(await chargeComputerRun(prisma, runId, after(60))).toBe("nothing");
    // The setting was turned on while the computer ran: nothing before that moment is taken.
    const computer = { id, runningSince: start };
    expect(await chargeOpenComputerRun(prisma, computer, () => 200_000, after(60))).toBe("nothing");
    expect(await balance()).toBe(10_000_000n);
    expect(await chargeOpenComputerRun(prisma, computer, () => 200_000, after(90))).toBe("charged");
    expect(await balance()).toBe(9_800_000n);
  });

  it("takes what is left when credits cannot cover a stretch, then refuses and writes off the rest", async () => {
    await fund(5);
    const { id: runId } = await run();
    expect(await computerCreditsRefusal(prisma, id)).toBeNull();
    // $0.20 of credits are due and $0.05 are left: the time was used, so the balance owes it.
    expect(await chargeComputerRun(prisma, runId, after(30))).toBe("charged");
    expect(await balance()).toBe(-150_000n);
    expect(await computerCreditsRefusal(prisma, id)).toContain("Not enough model credits");
    // With nothing left a running computer is told to stop.
    expect(await chargeComputerRun(prisma, runId, after(40))).toBe("refused");
    // Once it has stopped, what could not be taken is written down and never tried again.
    await system.computerRun.update({ where: { id: runId }, data: { endedAt: after(45) } });
    expect(await chargeComputerRun(prisma, runId)).toBe("unpaid");
    expect(await chargeComputerRun(prisma, runId)).toBe("nothing");
    expect(await balance()).toBe(-150_000n);
    const [unpaid] = await system.billingAuditEvent.findMany({
      where: { organizationId: id, kind: "computer_time_unpaid" },
    });
    expect(unpaid?.details).toMatchObject({ runId, costUsd: expect.closeTo(0.05, 9) });
    expect(unpaid?.amountMicros).toBe(0n);
  });

  it("counts computer time against the day's cap and stops at it, whatever the balance", async () => {
    vi.stubEnv("DAILY_CREDIT_CAP_CENTS", "10");
    await fund(1000);
    // The cap counts by the real clock, so this run began half an hour ago.
    const began = new Date(Date.now() - 30 * 60_000);
    const now = new Date(began.getTime() + 30 * 60_000);
    const { id: runId } = await run({ startedAt: began });
    // $0.20 of credits are due against a $0.10 day: it is taken in full, and the day is over.
    expect(await chargeComputerRun(prisma, runId, now)).toBe("charged");
    expect(await balance()).toBe(9_800_000n);
    expect(await computerCreditsRefusal(prisma, id, now)).toContain("Daily usage limit");
    expect(await chargeComputerRun(prisma, runId, new Date(now.getTime() + 60_000))).toBe(
      "refused",
    );
    await expect(reserveModelCredits(prisma, id, 0.01, undefined, now)).rejects.toThrow("Daily");
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    expect(await computerCreditsRefusal(prisma, id, tomorrow)).toBeNull();
  });

  it("applies only where the deployment says so, and only to an organization on credits", async () => {
    await system.deploymentSettings.upsert({
      where: { id: "default" },
      create: { id: "default", modelCreditsEnabled: true },
      update: { modelCreditsEnabled: true },
    });
    expect(await chargesComputersToCredits(system, id)).toBe(true);
    // No allowance is counted for it: its computer time has credits to run out of instead.
    expect(await sandboxAllowancePlan(system, id)).toBeNull();
    await system.modelCreditAccount.update({
      where: { organizationId: id },
      data: { mode: "byok" },
    });
    expect(await chargesComputersToCredits(system, id)).toBe(false);
    expect(await sandboxAllowancePlan(system, id)).not.toBeNull();
    await system.modelCreditAccount.update({
      where: { organizationId: id },
      data: { mode: "credits" },
    });
    vi.stubEnv("COMPUTER_USAGE_BILLING", "allowance");
    expect(await chargesComputersToCredits(system, id)).toBe(false);
    expect(await sandboxAllowancePlan(system, id)).not.toBeNull();
    // Off, the safety net does not look at runs at all.
    const { id: runId } = await run({ endedAt: after(30) });
    await fund(1000);
    await chargeEndedComputerRuns(prisma);
    expect(await balance()).toBe(10_000_000n);
    expect(
      (await system.computerRun.findUniqueOrThrow({ where: { id: runId } })).creditedThroughAt,
    ).toBeNull();
  });
});
