// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { SandboxProvider } from "@rakazo/adapter-kit";
import { COMPUTER_ALLOWANCE_USED_ERROR } from "@rakazo/contracts";
import { MODEL_CREDITS_EXHAUSTED_ERROR } from "@rakazo/core";
import type { ComputerRunEnd, PrismaClient } from "@rakazo/db";
import {
  chargeOpenComputerRun,
  chargesComputersToCredits,
  computerCreditsRefusal,
  computersBilledToCredits,
  recordComputerRunStart,
} from "@rakazo/db";
import { sandboxAllowanceUsedUp, sandboxHourlyCostMicros } from "./sandbox-allowance.js";

type Deps = { prisma: PrismaClient; sandbox: SandboxProvider };

/**
 * The organization whose credits pay for this computer's time and the real hourly cost it is
 * taken at, or null when credits do not pay for it: the deployment keeps allowances, the
 * computer does not bill while it runs, or its organization does not run on credits.
 */
async function creditedComputer(
  deps: Deps,
  computer: { spaceId: string; kind: string; size?: string | null },
): Promise<{ organizationId: string; hourlyCostMicros: number } | null> {
  if (!computersBilledToCredits()) return null;
  const hourlyCostMicros = sandboxHourlyCostMicros(deps.sandbox, computer);
  if (hourlyCostMicros === 0) return null;
  const space = await deps.prisma.space.findUnique({
    where: { id: computer.spaceId },
    select: { organizationId: true },
  });
  if (!space || !(await chargesComputersToCredits(deps.prisma, space.organizationId))) return null;
  return { organizationId: space.organizationId, hourlyCostMicros };
}

/** Records the start of a run, with the rate its time is taken from credits at when it is. */
export async function startComputerRun(
  deps: Deps,
  computer: Parameters<typeof recordComputerRunStart>[1],
  startedAt: Date,
  previousEnd?: ComputerRunEnd,
): Promise<void> {
  // A run carries a size only when the computer was sized for this very stretch.
  const size =
    computer.runningSizeSince?.getTime() === startedAt.getTime() ? computer.runningSize : null;
  const credited = await creditedComputer(deps, { ...computer, size });
  await recordComputerRunStart(
    deps.prisma,
    { ...computer, creditRateMicros: credited?.hourlyCostMicros },
    startedAt,
    previousEnd,
  );
}

/**
 * Why a computer may not start, or keep running: its organization spent this period's allowance,
 * or, where computer time is taken from credits, has none left (or reached the day's cap). Null
 * when it may. A running computer's time up to `takeThrough` is taken first, so what is left is
 * really left; null takes none, for a computer that was not just seen running.
 */
export async function computerTimeUsedUp(
  deps: Deps,
  computer: { id?: string; spaceId: string; kind: string; runningSince?: Date | null },
  takeThrough: Date | null = new Date(),
): Promise<string | null> {
  const credited = await creditedComputer(deps, computer);
  if (!credited)
    return (await sandboxAllowanceUsedUp(deps, computer)) ? COMPUTER_ALLOWANCE_USED_ERROR : null;
  const charge =
    computer.id && computer.runningSince && takeThrough
      ? await chargeOpenComputerRun(
          deps.prisma,
          { id: computer.id, runningSince: computer.runningSince },
          (run) => sandboxHourlyCostMicros(deps.sandbox, run),
          takeThrough,
        )
      : "nothing";
  const refusal = await computerCreditsRefusal(deps.prisma, credited.organizationId);
  return refusal ?? (charge === "refused" ? MODEL_CREDITS_EXHAUSTED_ERROR : null);
}
