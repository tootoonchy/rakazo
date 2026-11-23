// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).

/** Usage whose recorded cost is already the customer's price, so no markup is added on top. */
const ALREADY_PRICED_PROVIDER = "services";
const MICROS = 1_000_000;

/**
 * `COST_MARKUP`: how many dollars of credits a dollar of real cost takes. Unset is 1, the
 * upstream behavior (credits are spent at cost). A hosted deployment that must never sell below
 * cost sets it above 1; 2 means every dollar the provider reports takes two dollars of credits.
 * The real cost is still what `usage_records.costUsd` records, so cost and what was charged can
 * be compared per organization. A value that is not a number from 1 to 10 refuses to start work
 * rather than silently charging at cost.
 */
export function costMarkup(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.COST_MARKUP?.trim();
  if (!raw) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new Error("COST_MARKUP must be a number from 1 to 10");
  }
  return value;
}

/** The credits (in micro-dollars) a cost takes, rounded up so a charge is never below cost. */
export function chargedMicros(costUsd: number, provider?: string | null): bigint {
  const factor = provider === ALREADY_PRICED_PROVIDER ? 1 : costMarkup();
  return BigInt(Math.ceil(costUsd * factor * MICROS));
}

/** The largest real cost a hold of credits covers: the inverse of {@link chargedMicros}. */
export function coveredCostUsd(heldMicros: bigint, provider?: string | null): number {
  const factor = provider === ALREADY_PRICED_PROVIDER ? 1 : costMarkup();
  return Math.max(0, Number(heldMicros)) / MICROS / factor;
}

/**
 * `MONTHLY_PLATFORM_FEE_CENTS`: the part of each monthly plan payment that is the deployment's
 * fee, not credits. Unset is 0 (every cent paid becomes credits, as upstream). With 5000, a $200
 * monthly payment grants $150 of credits. One-time top-ups carry no fee: all of a top-up is
 * credits. A payment smaller than the fee (after a refund, say) grants nothing rather than less
 * than nothing.
 */
export function creditsGrantedCents(
  purchase: { amountCents: number; expiresAt?: string },
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.MONTHLY_PLATFORM_FEE_CENTS?.trim();
  if (!raw || !purchase.expiresAt) return purchase.amountCents;
  const fee = Number(raw);
  if (!Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("MONTHLY_PLATFORM_FEE_CENTS must be a whole number of cents, 0 or more");
  }
  return Math.max(0, purchase.amountCents - fee);
}
