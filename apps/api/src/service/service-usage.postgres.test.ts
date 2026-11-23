// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { PrismaClient } from "@rakazo/db";
import {
  asSystem,
  chargeComputerRun,
  createDb,
  creditAccount,
  reconcileCreditPurchase,
} from "@rakazo/db";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceApiDeps } from "./service-api.js";
import { mountServiceApi, SERVICE_API_PATH } from "./service-api.js";

const databaseUrl = process.env.DATABASE_URL;
const dbTests = process.env.VERIFY_DATABASE && databaseUrl ? describe : describe.skip;

dbTests("service API: the usage report (PostgreSQL)", () => {
  const secret = "test-service-secret-0123456789abcdef";
  const project = `usage-${process.pid}-${Date.now()}`;
  const id = `project-${project}`;
  const app = new Hono();
  let prisma: PrismaClient;
  let system: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    system = asSystem(prisma);
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await system.organization.create({
      data: { id, name: "Kettle", slug: id, createdAt: new Date() },
    });
    await system.space.create({ data: { id, organizationId: id, name: "Kettle" } });
    await creditAccount(prisma, id);
    // The route under test reads only the database and the secret.
    mountServiceApi(app, { prisma, secret } as ServiceApiDeps);
  });

  afterAll(async () => {
    if (!system) return;
    await system.computerRun.deleteMany({ where: { spaceId: id } });
    await system.organization.deleteMany({ where: { id } });
    await close();
  });

  it("reports computer time beside the model calls: its real cost and the credits taken for it", async () => {
    vi.stubEnv("COST_MARKUP", "2");
    await reconcileCreditPurchase(prisma, id, { id: `${id}-paid`, amountCents: 1000 });
    const startedAt = new Date("2027-03-01T10:00:00.000Z");
    const run = await system.computerRun.create({
      data: { computerId: id, spaceId: id, kind: "fake", startedAt, creditRateMicros: 200_000 },
    });
    // Ninety minutes at $0.20 an hour: $0.30 of real cost, $0.60 of credits.
    await chargeComputerRun(prisma, run.id, new Date(startedAt.getTime() + 90 * 60_000));

    // Entries are dated when they are made, so the report is for this month.
    const month = new Date().toISOString().slice(0, 7);
    const response = await app.request(`${SERVICE_API_PATH}/usage?month=${month}`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.status).toBe(200);
    const report = (await response.json()) as { projects: Record<string, unknown>[] };
    expect(report.projects.find((row) => row.external_project_id === project)).toEqual({
      external_project_id: project,
      name: "Kettle",
      cost_usd: 0,
      charged_usd: 0,
      computer_cost_usd: expect.closeTo(0.3, 9),
      computer_charged_usd: expect.closeTo(0.6, 9),
      services_charged_usd: 0,
      credits_granted_usd: 10,
    });
  });
});
