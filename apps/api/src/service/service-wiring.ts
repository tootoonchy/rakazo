// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { MemoryStore } from "@rakazo/adapter-kit";
import type { TicketChangeNotifier } from "@rakazo/adapters";
import type { PrismaClient } from "@rakazo/db";
import type { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { RouterContext } from "../routes/context.js";
import { forwardTicketChanges } from "./project-hub.js";
import { mountServiceApi } from "./service-api.js";

/** Ticket changes also go to the project hub when one is configured; otherwise nothing changes. */
export function reportTicketsToHub(
  notify: TicketChangeNotifier,
  prisma: PrismaClient,
  env: Pick<AppEnv, "projectHub">,
): TicketChangeNotifier {
  return env.projectHub ? forwardTicketChanges(notify, { prisma, hub: env.projectHub }) : notify;
}

/** Mounts the service API when `SERVICE_API_SECRET` is set; without it the routes do not exist. */
export function mountService(
  app: Hono,
  env: Pick<AppEnv, "serviceApi" | "authUrl" | "projectHub">,
  routerContext: RouterContext,
  deps: { prisma: PrismaClient; ticketChanges: TicketChangeNotifier; memory: MemoryStore },
): void {
  if (!env.serviceApi) return;
  mountServiceApi(app, {
    prisma: deps.prisma,
    secret: env.serviceApi.secret,
    authUrl: env.authUrl,
    createBot: routerContext.repos.createBot,
    onTicketChange: deps.ticketChanges,
    memory: deps.memory,
    ...(env.projectHub?.toolsUrl
      ? {
          projectTools: {
            url: env.projectHub.toolsUrl,
            secret: env.projectHub.secret,
            prepare: routerContext.prepareMcpServer,
            insert: routerContext.insertMcpServer,
            announce: async (serverId, actor) => {
              const row = await deps.prisma.mcpServer.findUnique({ where: { id: serverId } });
              if (row) await routerContext.announceMcpServer(row, actor);
            },
          },
        }
      : {}),
  });
}
