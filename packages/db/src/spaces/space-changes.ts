import type { RealtimeFanout } from "@rakazo/adapter-kit";
import { SpaceChangeKind } from "@rakazo/contracts";
import { bestEffort, getLogger } from "@rakazo/logging";
import type { PrismaClient } from "../database/client.js";
import { retryWhileDatabaseUnavailable } from "../database/database-outage.js";
import { runAsSystem } from "../database/row-security.js";
import { ChangeLatch } from "../threads/event-stream.js";

const IDLE_WAIT_MS = 60_000;

export const deploymentModelChangesScope = "deployment:model";
export const accountPreferencesChangesScope = (userId: string) => `preferences:${userId}`;

const spaceChangesTopic = (spaceId: string) => `space-changes:${spaceId}`;

const PUBLISH_RETRY_MS = 15_000;

/**
 * Apps re-read what a kind covers only on these signals, so a publish rides out a short database
 * outage in the background, without holding up the request or step that changed it. Past that it
 * gives up; apps catch up when their stream reopens. Call it after the change commits.
 */
export function publishSpaceChange(
  realtime: RealtimeFanout | undefined,
  spaceId: string,
  kind: SpaceChangeKind,
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  if (realtime)
    void retryWhileDatabaseUnavailable(() => realtime.publish(spaceChangesTopic(spaceId), kind), {
      source: `${kind} signal`,
      waitMs: PUBLISH_RETRY_MS,
      ...options,
    }).catch((error: unknown) => getLogger().warn("space change signal not published", { error }));
  return Promise.resolve();
}

/**
 * Modified by Agental: signals that a Space's runs changed. A run takes credits, and credits
 * belong to the organization, so its other Spaces are told as well: a member watching one of
 * them then reads the balance again. An organization with one Space, the usual case, costs one
 * read and no extra signal, and a failed read never holds up the run that finished.
 */
export async function publishRuns(
  prisma: PrismaClient,
  realtime: RealtimeFanout | undefined,
  spaceId: string,
): Promise<void> {
  await publishSpaceChange(realtime, spaceId, "runs");
  if (!realtime) return;
  const siblings = await bestEffort(
    "find an organization's other Spaces",
    runAsSystem(
      "signal an organization's other Spaces",
      () =>
        prisma.$queryRaw<{ id: string }[]>`
        SELECT other.id FROM spaces AS own
        JOIN spaces AS other ON other."organizationId" = own."organizationId"
        WHERE own.id = ${spaceId} AND other.id <> ${spaceId}`,
    ),
  );
  for (const sibling of siblings ?? []) await publishSpaceChange(realtime, sibling.id, "runs");
}

/**
 * Yields every kind once when following starts, then each kind that may have changed in the
 * Space. Signals carry no content, and a burst of one kind that arrives before the reader asks
 * again becomes one.
 */
export async function* followSpaceChanges(
  realtime: RealtimeFanout,
  spaceId: string,
  signal?: AbortSignal,
): AsyncGenerator<SpaceChangeKind> {
  const latch = new ChangeLatch();
  const pending = new Set<SpaceChangeKind>(SpaceChangeKind.options);
  const changed = (kind: SpaceChangeKind) => {
    pending.add(kind);
    latch.notify();
  };
  const unsubscribe = await realtime.subscribe(spaceChangesTopic(spaceId), (payload) => {
    // An empty payload is the fanout's catch-up after its listener reconnects: anything may have changed.
    if (payload === "") for (const kind of SpaceChangeKind.options) changed(kind);
    const kind = SpaceChangeKind.safeParse(payload);
    if (kind.success) changed(kind.data);
  });
  try {
    while (!signal?.aborted) {
      const seen = latch.generation;
      const kinds = [...pending];
      pending.clear();
      for (const kind of kinds) yield kind;
      await latch.waitForChange(seen, IDLE_WAIT_MS, signal);
    }
  } finally {
    await unsubscribe();
  }
}
