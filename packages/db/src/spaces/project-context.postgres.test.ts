// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../database/client.js";
import { createDb } from "../database/client.js";
import { asSystem } from "../database/row-security.js";
import { projectContextForSpace, setProjectContext } from "./project-context.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = process.env.VERIFY_DATABASE && databaseUrl ? describe : describe.skip;

describePostgres("project context (PostgreSQL)", () => {
  const organizationId = `project-context-${process.pid}-${Date.now()}`;
  const spaceId = `${organizationId}-side`;
  let system: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    system = asSystem(db.prisma);
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    await system.organization.create({
      data: {
        id: organizationId,
        name: "Kettle",
        slug: organizationId,
        createdAt: new Date(),
        metadata: JSON.stringify({ theme: "dark" }),
      },
    });
    await system.space.create({ data: { id: spaceId, organizationId, name: "Side" } });
  });

  afterAll(async () => {
    if (!system) return;
    await system.organization.deleteMany({ where: { id: organizationId } });
    await close();
  });

  const metadata = async () =>
    JSON.parse(
      (await system.organization.findUniqueOrThrow({ where: { id: organizationId } })).metadata!,
    ) as unknown;

  it("has none until the project is described", async () => {
    expect(await projectContextForSpace(system, spaceId)).toBeUndefined();
    expect(await projectContextForSpace(system, "no-such-space")).toBeUndefined();
  });

  it("stores the project beside what the organization already keeps there", async () => {
    await setProjectContext(system, organizationId, {
      type: "store",
      name: "Blue Kettle",
      phase: "planning",
    });
    expect(await projectContextForSpace(system, spaceId)).toEqual({
      type: "store",
      name: "Blue Kettle",
      phase: "planning",
    });
    expect(await metadata()).toMatchObject({ theme: "dark" });
  });

  it("keeps the phase when a description leaves it out, and removes it on null", async () => {
    await setProjectContext(system, organizationId, { type: "store", name: "Blue Kettle" });
    await setProjectContext(system, organizationId, {
      type: "store",
      name: "Blue Kettle Co",
      phase: "building",
    });
    expect(
      await setProjectContext(system, organizationId, { type: "store", name: "Blue Kettle Co" }),
    ).toEqual({ type: "store", name: "Blue Kettle Co", phase: "building" });
    await setProjectContext(system, organizationId, {
      type: "store",
      name: "Blue Kettle Co",
      phase: null,
    });
    expect(await projectContextForSpace(system, spaceId)).toEqual({
      type: "store",
      name: "Blue Kettle Co",
    });
  });

  it("reads no project from a shape it cannot use, and replaces it when described again", async () => {
    await system.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify({ project: { type: 7 } }) },
    });
    expect(await projectContextForSpace(system, spaceId)).toBeUndefined();
    await setProjectContext(system, organizationId, { type: "academy", name: "Sourdough" });
    expect(await projectContextForSpace(system, spaceId)).toEqual({
      type: "academy",
      name: "Sourdough",
    });
  });
});
