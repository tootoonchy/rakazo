// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).

/**
 * `PREMIUM_MODEL_OUTPUT_USD`: the price, in dollars per million output tokens, at or above which
 * a model the deployment pays for is premium. An organization's credits run a premium model only
 * once the operator has turned premium models on for it. Unset is no premium models at all, the
 * upstream behavior: credits run any model they can price. A member's own key or subscription is
 * never limited. A value that is not a number above 0 refuses to start work rather than silently
 * allowing every model.
 */
export function premiumModelOutputUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.PREMIUM_MODEL_OUTPUT_USD?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("PREMIUM_MODEL_OUTPUT_USD must be a number above 0");
  }
  return value;
}

/**
 * Whether a model at this output price is premium. A model with no known price is not: credits
 * already refuse to run what they cannot price.
 */
export function isPremiumModelPrice(
  outputUsdPerMillion: number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const threshold = premiumModelOutputUsd(env);
  return (
    threshold !== null && outputUsdPerMillion !== undefined && outputUsdPerMillion >= threshold
  );
}
