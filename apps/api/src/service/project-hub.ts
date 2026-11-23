// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { createHmac } from "node:crypto";
import type { TicketChange, TicketChangeNotifier } from "@rakazo/adapters";
import { retry } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { runAsSystem } from "@rakazo/db";
import { bestEffort } from "@rakazo/logging";

/** The system that owns the projects this server's Spaces were provisioned for. */
export type ProjectHub = { url: string; secret: string; fetch?: typeof fetch };

const TIMEOUT_MS = 10_000;
const RECENT_COMMENTS = 5;

/** "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>", the header the hub checks. */
export function signHubBody(secret: string, body: string, unixSeconds: number): string {
  const mac = createHmac("sha256", secret).update(`${unixSeconds}.${body}`).digest("hex");
  return `t=${unixSeconds},v1=${mac}`;
}

/**
 * What a project's Space presents to the hub's tools: "<project id>.<hex HMAC-SHA256(secret,
 * "tools:" + project id)>". Both sides can make it and neither stores it; one project's token
 * opens no other project.
 */
export function projectToolsToken(secret: string, projectId: string): string {
  return `${projectId}.${createHmac("sha256", secret).update(`tools:${projectId}`).digest("hex")}`;
}

async function post(hub: ProjectHub, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  const response = await (hub.fetch ?? fetch)(hub.url, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-agental-signature": signHubBody(hub.secret, body, Math.floor(Date.now() / 1000)),
    },
  });
  // The body is not read: a status is all a delivery needs, and it is all that is logged.
  if (!response.ok) throw new Error(`project hub answered ${response.status}`);
}

/** What the hub is told about a ticket it created: where it stands and the last few comments. */
export async function ticketEvent(prisma: PrismaClient, change: TicketChange) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: change.ticketId, spaceId: change.spaceId, externalId: { not: null } },
    include: {
      board: { select: { ticketPrefix: true } },
      assigneeBot: { select: { name: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        take: RECENT_COMMENTS,
        include: { authorBot: { select: { name: true } }, authorUser: { select: { name: true } } },
      },
    },
  });
  if (!ticket) return null;
  return {
    type: "ticket.updated" as const,
    space_id: ticket.spaceId,
    external_id: ticket.externalId,
    ref: `${ticket.board.ticketPrefix}-${ticket.number}`,
    title: ticket.title,
    status: ticket.status,
    assignee: ticket.assigneeBot?.name ?? null,
    updated_at: ticket.updatedAt.toISOString(),
    completed_at: ticket.completedAt?.toISOString() ?? null,
    comments: ticket.comments.reverse().map((comment) => ({
      id: comment.id,
      author: comment.authorBot?.name ?? comment.authorUser?.name ?? "",
      by_bot: Boolean(comment.authorBotId),
      body: comment.body.slice(0, 4000),
      at: comment.createdAt.toISOString(),
    })),
  };
}

/**
 * Tells the hub when a ticket it created changes. The ticket change itself never waits on the
 * hub or fails because of it: delivery is tried a few times after the change is done, and the
 * hub can always read a ticket's current state from the service API instead.
 */
export function forwardTicketChanges(
  notify: TicketChangeNotifier,
  deps: { prisma: PrismaClient; hub: ProjectHub },
): TicketChangeNotifier {
  return async (change) => {
    await notify(change);
    void bestEffort(
      "project hub ticket event",
      (async () => {
        const event = await runAsSystem("project hub ticket event", () =>
          ticketEvent(deps.prisma, change),
        );
        if (event) await retry(() => post(deps.hub, event), { attempts: 4, retryable: () => true });
      })(),
    );
  };
}
