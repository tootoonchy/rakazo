// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { BYOK_TIERS, MODEL_CREDIT_AMOUNTS } from "@rakazo/contracts";
import { deadlineSignal } from "@rakazo/core";
import { z } from "zod";
import { encodeStripeForm, STRIPE_API_VERSION } from "./stripe-billing.js";

/**
 * The plans a hosted deployment sells, created ahead of the first checkout so they can be
 * reviewed in the dashboard. Billing finds a price by its lookup key, so the monthly keys here
 * are the ones billing asks for; a price it does not find it creates under its own product.
 */
export interface CatalogPrice {
  interval: "month" | "year";
  amountCents: number;
  lookupKey: string;
}

export interface CatalogPlan {
  productId: string;
  name: string;
  /** Read by people in the dashboard only; billing does not read it. */
  metadata: Record<string, string>;
  prices: CatalogPrice[];
}

/** One credit is one cent. */
const OPERATOR_MONTHLY_CENTS = 20_000;
const OPERATOR_PLATFORM_FEE_CENTS = 5_000;
const OWN_KEY_TIER = "max";
const OWN_KEY_MONTHLY_CENTS = 9_900;
/** A year costs ten months. */
const YEARLY_MONTHS = 10;

export function planCatalog(brandName: string): CatalogPlan[] {
  return [
    {
      productId: "rakazo_plan_operator",
      name: `${brandName} Operator`,
      metadata: {
        platform_fee_cents: String(OPERATOR_PLATFORM_FEE_CENTS),
        credits: String(OPERATOR_MONTHLY_CENTS - OPERATOR_PLATFORM_FEE_CENTS),
      },
      prices: [
        {
          interval: "month",
          amountCents: OPERATOR_MONTHLY_CENTS,
          lookupKey: `rakazo_monthly_credits_${OPERATOR_MONTHLY_CENTS}`,
        },
        {
          interval: "year",
          amountCents: OPERATOR_MONTHLY_CENTS * YEARLY_MONTHS,
          lookupKey: `rakazo_yearly_credits_${OPERATOR_MONTHLY_CENTS * YEARLY_MONTHS}`,
        },
      ],
    },
    {
      productId: "rakazo_plan_own_key",
      name: `${brandName} Own Key`,
      metadata: { tier: OWN_KEY_TIER },
      prices: [
        {
          interval: "month",
          amountCents: OWN_KEY_MONTHLY_CENTS,
          lookupKey: `rakazo_byok_${OWN_KEY_TIER}_monthly_${OWN_KEY_MONTHLY_CENTS}`,
        },
        {
          interval: "year",
          amountCents: OWN_KEY_MONTHLY_CENTS * YEARLY_MONTHS,
          lookupKey: `rakazo_byok_${OWN_KEY_TIER}_yearly_${OWN_KEY_MONTHLY_CENTS * YEARLY_MONTHS}`,
        },
      ],
    },
  ];
}

/**
 * The monthly prices billing sells today: the monthly credit amount and the own-key tier's
 * monthly price. False once either constant moves, when the catalog must move with it.
 */
export function catalogMatchesBilling(): boolean {
  return (
    (MODEL_CREDIT_AMOUNTS as readonly number[]).includes(OPERATOR_MONTHLY_CENTS) &&
    BYOK_TIERS[OWN_KEY_TIER].monthlyPriceCents === OWN_KEY_MONTHLY_CENTS
  );
}

export type PlanChange =
  | { action: "create_product" | "update_product"; productId: string; name: string }
  | ({ action: "create_price" | "keep_price"; productId: string } & CatalogPrice)
  | { action: "archive_price"; productId: string; priceId: string };

export interface SyncPlanCatalogOptions {
  secretKey: string;
  catalog: CatalogPlan[];
  /** False only plans: it reads and writes nothing it would change. */
  apply: boolean;
  fetch?: typeof fetch;
}

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  metadata: z.record(z.string(), z.string()),
});
const priceSchema = z.object({
  id: z.string(),
  currency: z.string(),
  unit_amount: z.number().int().nullable(),
  lookup_key: z.string().nullish(),
  recurring: z.object({ interval: z.string(), interval_count: z.number().int() }).nullish(),
});
const priceListSchema = z.object({ data: z.array(priceSchema), has_more: z.boolean() });

/** Only a test-mode key may run this: live products and prices are made by a person, on purpose. */
export function isTestModeKey(secretKey: string): boolean {
  return /^(sk|rk)_test_/.test(secretKey);
}

/**
 * Makes the account's products and prices match the catalog, and returns what it did (or, without
 * `apply`, what it would do). Running it again changes nothing. A price is never edited: one that
 * no longer matches is replaced by a new price and archived, which leaves subscriptions already
 * on it as they are.
 */
export async function syncPlanCatalog(options: SyncPlanCatalogOptions): Promise<PlanChange[]> {
  if (!isTestModeKey(options.secretKey))
    throw new Error("Refusing to run: STRIPE_SECRET_KEY is not a test-mode key");
  const request = requester(options.secretKey, options.fetch ?? fetch);
  const changes: PlanChange[] = [];

  for (const plan of options.catalog) {
    const { productId, name, metadata } = plan;
    const found = await request("GET", `/v1/products/${encodeURIComponent(productId)}`, undefined, {
      missing: true,
    });
    const product = found === undefined ? undefined : productSchema.parse(found);
    if (!product) {
      changes.push({ action: "create_product", productId, name });
      if (options.apply) await request("POST", "/v1/products", { id: productId, name, metadata });
    } else if (
      !product.active ||
      product.name !== name ||
      Object.entries(metadata).some(([key, value]) => product.metadata[key] !== value)
    ) {
      changes.push({ action: "update_product", productId, name });
      if (options.apply)
        await request("POST", `/v1/products/${encodeURIComponent(productId)}`, {
          name,
          active: true,
          metadata,
        });
    }

    const active = product ? await activePrices(request, productId) : [];
    const kept = new Set<string>();
    for (const price of plan.prices) {
      const match = active.find(
        (existing) =>
          existing.lookup_key === price.lookupKey &&
          existing.currency === "usd" &&
          existing.unit_amount === price.amountCents &&
          existing.recurring?.interval === price.interval &&
          existing.recurring.interval_count === 1,
      );
      if (match) {
        kept.add(match.id);
        changes.push({ action: "keep_price", productId, ...price });
        continue;
      }
      // Billing may have made this price first, under a product of its own, and people may be
      // subscribed to it. It is kept as it is: moving its lookup key to a new price would leave
      // those subscriptions on a price billing can no longer tell the tier of.
      if (await soldElsewhere(request, price)) {
        changes.push({ action: "keep_price", productId, ...price });
        continue;
      }
      changes.push({ action: "create_price", productId, ...price });
      if (options.apply)
        await request("POST", "/v1/prices", {
          product: productId,
          currency: "usd",
          unit_amount: price.amountCents,
          recurring: { interval: price.interval },
          lookup_key: price.lookupKey,
          // Only a price with other terms can still hold this key, and it must stop being found.
          transfer_lookup_key: true,
        });
    }
    // The new prices exist before the old ones stop being sold.
    for (const stale of active.filter((existing) => !kept.has(existing.id))) {
      changes.push({ action: "archive_price", productId, priceId: stale.id });
      if (options.apply)
        await request("POST", `/v1/prices/${encodeURIComponent(stale.id)}`, { active: false });
    }
  }
  return changes;
}

type Request = (
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  options?: { missing?: boolean },
) => Promise<unknown>;

/** Whether an active price with this lookup key and these terms exists under any active product. */
async function soldElsewhere(request: Request, price: CatalogPrice): Promise<boolean> {
  const query = encodeStripeForm({
    active: true,
    lookup_keys: [price.lookupKey],
    expand: ["data.product"],
  });
  const found = z
    .object({ data: z.array(priceSchema.extend({ product: z.object({ active: z.boolean() }) })) })
    .parse(await request("GET", `/v1/prices?${query}`));
  return found.data.some(
    (existing) =>
      existing.product.active &&
      existing.currency === "usd" &&
      existing.unit_amount === price.amountCents &&
      existing.recurring?.interval === price.interval &&
      existing.recurring.interval_count === 1,
  );
}

async function activePrices(request: Request, productId: string) {
  const prices: z.infer<typeof priceSchema>[] = [];
  for (;;) {
    const query = encodeStripeForm({
      product: productId,
      active: true,
      limit: 100,
      starting_after: prices.at(-1)?.id,
    });
    const page = priceListSchema.parse(await request("GET", `/v1/prices?${query}`));
    prices.push(...page.data);
    if (!page.has_more || !page.data.length) return prices;
  }
}

function requester(secretKey: string, send: typeof fetch): Request {
  return async (method, path, params, options) => {
    const response = await send(`https://api.stripe.com${path}`, {
      method,
      signal: deadlineSignal(30_000),
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
        Accept: "application/json",
        ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(params ? { body: encodeStripeForm(params) } : {}),
    });
    if (response.status === 404 && options?.missing) return undefined;
    const text = await response.text();
    if (!response.ok) {
      const message = errorMessage(text)?.replaceAll(secretKey, "[redacted]");
      throw new Error(`Stripe request failed (${response.status})${message ? `: ${message}` : ""}`);
    }
    const json: unknown = JSON.parse(text);
    // The key's prefix already says test mode; an answer that says otherwise stops the run.
    if (z.object({ livemode: z.literal(true) }).safeParse(json).success)
      throw new Error("Refusing to continue: the account answered in live mode");
    return json;
  };
}

/** The provider's own words for a refused request; an answer that is not its JSON has none. */
function errorMessage(text: string): string | undefined {
  try {
    return z.object({ error: z.object({ message: z.string() }) }).safeParse(JSON.parse(text)).data
      ?.error.message;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
