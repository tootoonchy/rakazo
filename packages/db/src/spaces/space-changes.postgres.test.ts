// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../database/client.js";
import { createDb } from "../database/client.js";
import { asSystem } from "../database/row-security.js";
import { publishRuns } from "./space-changes.js";

const dbTests = process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe : describe.skip;
dbTests("run signals across an organization's Spaces (PostgreSQL)", () => {
  let db: ReturnType<typeof createDb>;
  let system: PrismaClient;
  const stamp = `run-signal-${process.pid}-${crypto.randomUUID()}`;
  const organizations = [`${stamp}-a`, `${stamp}-b`];
  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL!);
    system = asSystem(db.prisma);
    for (const id of organizations)
      await system.organization.create({
        data: { id, name: "Signals", slug: id, createdAt: new Date() },
      });
    await system.space.createMany({
      data: [
        { id: `${stamp}-a1`, organizationId: organizations[0]!, name: "One" },
        { id: `${stamp}-a2`, organizationId: organizations[0]!, name: "Two" },
        { id: `${stamp}-b1`, organizationId: organizations[1]!, name: "Other" },
      ],
    });
  });
  afterAll(async () => {
    await system.organization.deleteMany({ where: { id: { in: organizations } } });
    await db.prisma.$disconnect();
    await db.pool.end();
  });

  it("tells the run's Space and its organization's other Spaces, and no other organization", async () => {
    const published: string[] = [];
    const fanout = {
      publish: async (topic: string, payload: string) => {
        published.push(`${topic} ${payload}`);
      },
      subscribe: async () => async () => undefined,
    };
    await publishRuns(db.prisma, fanout as never, `${stamp}-a1`);
    await expect
      .poll(() => [...published].sort())
      .toEqual([`space-changes:${stamp}-a1 runs`, `space-changes:${stamp}-a2 runs`]);

    // An organization with one Space signals that Space only.
    published.length = 0;
    await publishRuns(db.prisma, fanout as never, `${stamp}-b1`);
    await expect.poll(() => published).toEqual([`space-changes:${stamp}-b1 runs`]);
  });
});
