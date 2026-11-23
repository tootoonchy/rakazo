// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { randomBytes } from "node:crypto";
import type { MemoryStore } from "@rakazo/adapter-kit";
import type { TicketChangeNotifier } from "@rakazo/adapters";
import { createTicket } from "@rakazo/adapters";
import { createServiceSignInToken, SERVICE_SIGN_IN_PATH } from "@rakazo/auth";
import type { Actor, Bot } from "@rakazo/contracts";
import { CreateRoutineInput } from "@rakazo/contracts";
import { hasValidBearerToken } from "@rakazo/core/node/secrets-guard";
import type { PrismaClient } from "@rakazo/db";
import { createOrganizationWithDefaultSpace, ensureBoard, runAsSystem } from "@rakazo/db";
import type { Context, Hono } from "hono";
import * as z from "zod";
import { routineRowData } from "../routines/routines.js";
import type { ProjectType } from "./service-starters.js";
import { PROJECT_TYPES, STARTER_BOTS, STARTER_ROUTINES } from "./service-starters.js";

/**
 * The service API: how the system that owns the projects (the "project hub") sets up and drives
 * the Spaces here. Server to server only, every call carrying `SERVICE_API_SECRET` as a bearer
 * token. One project is one organization with its default Space; everything is safe to repeat.
 *
 *   POST /api/v1/service/spaces         provision a project's Space, bots and routines
 *   POST /api/v1/service/sign-in-links  a one-minute, one-time link that signs the owner in
 *   POST /api/v1/service/tickets        put a task on the board, assigned to a bot
 *   GET  /api/v1/service/tickets        where a ticket stands
 *   POST /api/v1/service/memory         write a note every bot in the Space can read
 */
export const SERVICE_API_PATH = "/api/v1/service";
const MAX_BODY_BYTES = 256 * 1024;
/** Board prefix for provisioned Spaces, so ticket references read as the brand's own. */
const TICKET_PREFIX = "AGT";

export type ServiceApiDeps = {
  prisma: PrismaClient;
  secret: string;
  /** The auth server's public address, where a sign-in link is opened. */
  authUrl: string;
  createBot: (
    actor: Actor,
    input: {
      name: string;
      description: string;
      instructions: string;
      notifyOnFinish: boolean;
      spawnKey?: string;
    },
  ) => Promise<Bot>;
  onTicketChange?: TicketChangeNotifier;
  memory: MemoryStore;
};

const externalId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const line = (max: number) => z.string().trim().min(1).max(max);
const botKey = z.enum(["operator", "leads", "content"]);

const ProvisionInput = z.object({
  external_project_id: externalId,
  project_type: z.enum(PROJECT_TYPES),
  email: z.string().trim().toLowerCase().email().max(254),
  name: line(120).optional(),
  project_name: line(120),
  plan: line(40).optional(),
});
const SignInLinkInput = z.object({ space_id: line(64), email: z.string().trim().toLowerCase() });
const TicketInput = z.object({
  space_id: line(64),
  external_id: externalId,
  title: line(200),
  description: z.string().max(20_000).optional(),
  assignee: botKey.default("operator"),
});
const MemoryInput = z.object({
  space_id: line(64),
  path: z.string().regex(/^[a-z0-9][a-z0-9/_-]{0,118}\.md$/),
  content: z.string().min(1).max(60_000),
});

const spawnKey = (key: string) => `service:${key}`;
const projectSlug = (id: string) => `project-${id.toLowerCase()}`;
const newId = () => randomBytes(16).toString("hex");

class ServiceError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
  }
}

/** The Space's owner, as the actor work in the Space is done for. */
async function spaceOwner(prisma: PrismaClient, spaceId: string): Promise<Actor> {
  const member = await prisma.member.findFirst({
    where: { organizationId: spaceId, role: "owner" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!member) throw new ServiceError(404, "space_not_found");
  return {
    userId: member.user.id,
    spaceId,
    email: member.user.email,
    isDeploymentOwner: false,
  };
}

async function starterBots(prisma: PrismaClient, spaceId: string) {
  const rows = await prisma.bot.findMany({
    where: { spaceId, spawnKey: { in: STARTER_BOTS.map((bot) => spawnKey(bot.key)) } },
    select: { id: true, spawnKey: true },
  });
  return Object.fromEntries(
    STARTER_BOTS.map((bot) => [
      bot.key,
      rows.find((row) => row.spawnKey === spawnKey(bot.key))?.id ?? null,
    ]),
  ) as Record<"operator" | "leads" | "content", string | null>;
}

function signInUrl(deps: ServiceApiDeps, userId: string, spaceId: string): string {
  const token = createServiceSignInToken(deps.secret, userId, spaceId);
  return `${deps.authUrl}/api/auth${SERVICE_SIGN_IN_PATH}?token=${encodeURIComponent(token)}`;
}

async function provision(deps: ServiceApiDeps, input: z.infer<typeof ProvisionInput>) {
  const { prisma } = deps;
  const user =
    (await prisma.user.findFirst({ where: { email: input.email }, select: { id: true } })) ??
    (await prisma.user.create({
      // The hub has already verified this address: the person is signed in there.
      data: {
        id: newId(),
        email: input.email,
        name: input.name ?? input.email,
        emailVerified: true,
      },
      select: { id: true },
    }));
  const slug = projectSlug(input.external_project_id);
  const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  const spaceId = await createOrganizationWithDefaultSpace(prisma, {
    userId: user.id,
    orgId: newId(),
    name: input.project_name,
    slug,
  });
  const actor: Actor = { userId: user.id, spaceId, email: input.email, isDeploymentOwner: false };

  // Ask before anything that changes something: the owner approves each such step.
  await prisma.actionAutoReviewPreference.upsert({
    where: { spaceId_userId: { spaceId, userId: user.id } },
    create: { spaceId, userId: user.id, enabled: false, skipApprovals: false },
    update: {},
  });

  const board = await ensureBoard(prisma, spaceId);
  if (
    board.ticketPrefix !== TICKET_PREFIX &&
    !(await prisma.ticket.count({ where: { spaceId } }))
  ) {
    await prisma.board.update({ where: { id: board.id }, data: { ticketPrefix: TICKET_PREFIX } });
  }

  const bots: Record<string, string> = {};
  for (const starter of STARTER_BOTS) {
    // Idempotent on the spawn key. No intro run is started: nothing runs until the owner asks.
    const bot = await deps.createBot(actor, {
      name: starter.name,
      description: "",
      instructions: starter.about,
      notifyOnFinish: true,
      spawnKey: spawnKey(starter.key),
    });
    bots[starter.key] = bot.id;
  }

  await seedRoutines(prisma, actor, input.project_type, bots);
  return {
    space_id: spaceId,
    user_id: user.id,
    created: !existing,
    bots,
    sign_in_url: signInUrl(deps, user.id, spaceId),
  };
}

/** Each starter routine once per bot, paused: a schedule only starts when the owner turns it on. */
async function seedRoutines(
  prisma: PrismaClient,
  actor: Actor,
  type: ProjectType,
  bots: Record<string, string>,
) {
  for (const routine of STARTER_ROUTINES[type]) {
    const botId = bots[routine.bot];
    if (!botId) continue;
    const seen = await prisma.routine.findFirst({
      where: { spaceId: actor.spaceId, botId, name: routine.name },
      select: { id: true },
    });
    if (seen) continue;
    const input = CreateRoutineInput.parse({
      botId,
      name: routine.name,
      prompt: routine.prompt,
      crons: [routine.cron],
      active: false,
    });
    await prisma.routine.create({ data: routineRowData(actor, input, null) });
  }
}

async function upsertTicket(deps: ServiceApiDeps, input: z.infer<typeof TicketInput>) {
  const { prisma } = deps;
  const actor = await spaceOwner(prisma, input.space_id);
  const where = { spaceId: input.space_id, externalId: input.external_id };
  const found = await prisma.ticket.findFirst({ where, include: { board: true } });
  if (found) return { ...ticketView(found, found.board.ticketPrefix), created: false };
  const botId = (await starterBots(prisma, input.space_id))[input.assignee];
  if (!botId) throw new ServiceError(409, "bot_not_provisioned");
  const result = await createTicket(
    { prisma, onTicketChange: deps.onTicketChange },
    {
      spaceId: input.space_id,
      userId: actor.userId,
      title: input.title,
      description: input.description,
      ownerBotId: botId,
      externalId: input.external_id,
    },
  );
  if ("error" in result) throw new ServiceError(400, "invalid_ticket");
  const row = await prisma.ticket.findFirstOrThrow({ where, include: { board: true } });
  return { ...ticketView(row, row.board.ticketPrefix), created: true };
}

function ticketView(
  row: { id: string; number: number; status: string; title: string; updatedAt: Date },
  prefix: string,
) {
  return {
    ticket_id: row.id,
    ref: `${prefix}-${row.number}`,
    status: row.status,
    title: row.title,
    updated_at: row.updatedAt.toISOString(),
  };
}

async function readTicket(deps: ServiceApiDeps, spaceId: string, external: string) {
  const row = await deps.prisma.ticket.findFirst({
    where: { spaceId, externalId: external },
    include: { board: true },
  });
  if (!row) throw new ServiceError(404, "ticket_not_found");
  return ticketView(row, row.board.ticketPrefix);
}

async function writeMemory(deps: ServiceApiDeps, input: z.infer<typeof MemoryInput>) {
  const actor = await spaceOwner(deps.prisma, input.space_id);
  const current = await deps.prisma.memoryDocument.findFirst({
    where: { spaceId: actor.spaceId, userId: actor.userId, scope: "user", path: input.path },
    select: { revision: true },
  });
  await deps.memory.commit(
    {
      scope: "user",
      path: input.path,
      content: input.content,
      expectedRevision: current?.revision,
    },
    {
      operationId: newId(),
      traceId: newId(),
      spaceId: actor.spaceId,
      userId: actor.userId,
      signal: AbortSignal.timeout(30_000),
    },
  );
  return { ok: true as const, path: input.path };
}

async function signInLink(deps: ServiceApiDeps, input: z.infer<typeof SignInLinkInput>) {
  // Only someone who belongs to the Space gets a link into it.
  const member = await deps.prisma.member.findFirst({
    where: { organizationId: input.space_id, user: { email: input.email } },
    select: { userId: true },
  });
  if (!member) throw new ServiceError(404, "member_not_found");
  return { sign_in_url: signInUrl(deps, member.userId, input.space_id) };
}

export function mountServiceApi(app: Hono, deps: ServiceApiDeps) {
  /** Checks the bearer secret, reads a bounded JSON body, and runs the work outside any tenant. */
  const handle =
    <S extends z.ZodType>(schema: S, work: (input: z.infer<S>) => Promise<unknown>) =>
    async (c: Context) => {
      if (!hasValidBearerToken(c.req.header("authorization"), deps.secret)) {
        return c.json({ error: "unauthorized" }, 401);
      }
      const text = c.req.method === "GET" ? JSON.stringify(c.req.query()) : await c.req.text();
      if (text.length > MAX_BODY_BYTES) return c.json({ error: "too_large" }, 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: "invalid_payload", field: parsed.error.issues[0]?.path.join(".") },
          400,
        );
      }
      try {
        return c.json(await runAsSystem("service api", () => work(parsed.data)));
      } catch (error) {
        if (error instanceof ServiceError) return c.json({ error: error.code }, error.status);
        throw error;
      }
    };

  app.post(
    `${SERVICE_API_PATH}/spaces`,
    handle(ProvisionInput, (input) => provision(deps, input)),
  );
  app.post(
    `${SERVICE_API_PATH}/sign-in-links`,
    handle(SignInLinkInput, (input) => signInLink(deps, input)),
  );
  app.post(
    `${SERVICE_API_PATH}/tickets`,
    handle(TicketInput, (input) => upsertTicket(deps, input)),
  );
  app.get(
    `${SERVICE_API_PATH}/tickets`,
    handle(z.object({ space_id: line(64), external_id: externalId }), (input) =>
      readTicket(deps, input.space_id, input.external_id),
    ),
  );
  app.post(
    `${SERVICE_API_PATH}/memory`,
    handle(MemoryInput, (input) => writeMemory(deps, input)),
  );
}
