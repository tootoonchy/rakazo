// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { PrismaClient } from "@rakazo/db";
import { asSystem, createDb, projectContextForSpace } from "@rakazo/db";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceApiDeps } from "./service-api.js";
import { mountServiceApi, SERVICE_API_PATH } from "./service-api.js";

const databaseUrl = process.env.DATABASE_URL;
const dbTests = process.env.VERIFY_DATABASE && databaseUrl ? describe : describe.skip;

dbTests("service API: describing a project (PostgreSQL)", () => {
  const secret = "test-service-secret-0123456789abcdef";
  const spaceId = `service-project-${process.pid}-${Date.now()}`;
  const app = new Hono();
  let system: PrismaClient;
  let close: () => Promise<void>;

  const post = (body: unknown, token = secret) =>
    app.request(`${SERVICE_API_PATH}/project`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    system = asSystem(db.prisma);
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    await system.organization.create({
      data: { id: spaceId, name: "Kettle", slug: spaceId, createdAt: new Date() },
    });
    await system.space.create({
      data: { id: spaceId, organizationId: spaceId, name: "Kettle", isDefault: true },
    });
    // The route under test reads only the database and the secret.
    mountServiceApi(app, { prisma: db.prisma, secret } as ServiceApiDeps);
  });

  afterAll(async () => {
    if (!system) return;
    await system.organization.deleteMany({ where: { id: spaceId } });
    await close();
  });

  it("stores what the caller says and answers with it", async () => {
    const response = await post({
      space_id: spaceId,
      project_type: "store",
      project_name: "Blue Kettle",
      project_phase: "building",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      space_id: spaceId,
      project: { type: "store", name: "Blue Kettle", phase: "building" },
    });
    expect(await projectContextForSpace(system, spaceId)).toEqual({
      type: "store",
      name: "Blue Kettle",
      phase: "building",
    });
  });

  it("refuses a caller without the secret, an unknown kind of project and an unknown Space", async () => {
    const body = { space_id: spaceId, project_type: "store", project_name: "Blue Kettle" };
    expect((await post(body, "wrong-secret-0123456789abcdef012345")).status).toBe(401);
    const unknownKind = await post({ ...body, project_type: "bank" });
    expect(unknownKind.status).toBe(400);
    expect(await unknownKind.json()).toEqual({ error: "invalid_payload", field: "project_type" });
    const unknownSpace = await post({ ...body, space_id: "no-such-space" });
    expect(unknownSpace.status).toBe(404);
    expect(await unknownSpace.json()).toEqual({ error: "space_not_found" });
  });
});
