// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import * as z from "zod";
import type { PrismaClient } from "../database/client.js";
import { readJsonColumn } from "../database/json-column.js";

/**
 * What the system that owns a project says about it: its kind, its name and where it stands.
 * Kept on the project's organization, in the JSON text the auth library stores there, under one
 * key of its own. Bots are told these facts on every turn (see the project context prompt).
 */
export const ProjectContextSchema = z.object({
  type: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  phase: z.string().min(1).max(40).optional(),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

const MetadataSchema = z.looseObject({ project: ProjectContextSchema.optional() });

/** The stored text as a value, or undefined when it is empty or not JSON. */
function parseMetadata(text: string | null): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function contextOf(organization: { id: string; metadata: string | null }) {
  const stored = parseMetadata(organization.metadata);
  if (stored === undefined) return undefined;
  return readJsonColumn(
    MetadataSchema,
    stored,
    { table: "organization", column: "metadata", id: organization.id },
    { fallback: {} },
  ).project;
}

/** The project a Space belongs to, when its owner system has described one. */
export async function projectContextForSpace(
  prisma: Pick<PrismaClient, "space">,
  spaceId: string,
): Promise<ProjectContext | undefined> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { organization: { select: { id: true, metadata: true } } },
  });
  return space?.organization ? contextOf(space.organization) : undefined;
}

/**
 * Describes an organization's project. A phase left out keeps the one already stored, so a repeat
 * of the first description does not undo a later update; null removes it. Other keys the auth
 * library keeps in the same text are left as they are.
 */
export async function setProjectContext(
  prisma: PrismaClient,
  organizationId: string,
  input: { type: string; name: string; phase?: string | null | undefined },
): Promise<ProjectContext> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ metadata: string | null }[]>`
      SELECT metadata FROM organization WHERE id=${organizationId} FOR UPDATE`;
    if (!row) throw new Error("Organization not found");
    const stored = parseMetadata(row.metadata);
    const kept =
      typeof stored === "object" && stored !== null && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    const phase =
      input.phase === undefined
        ? contextOf({ id: organizationId, metadata: row.metadata })?.phase
        : (input.phase ?? undefined);
    const project = ProjectContextSchema.parse({
      type: input.type,
      name: input.name,
      ...(phase ? { phase } : {}),
    });
    await tx.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify({ ...kept, project }) },
    });
    return project;
  });
}
