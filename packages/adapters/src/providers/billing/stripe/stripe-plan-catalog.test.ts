// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { describe, expect, it } from "vitest";
import type { CatalogPlan } from "./stripe-plan-catalog.js";
import { catalogMatchesBilling, planCatalog, syncPlanCatalog } from "./stripe-plan-catalog.js";

const secretKey = "sk_test_fixture";

interface Product {
  id: string;
  name: string;
  active: boolean;
  metadata: Record<string, string>;
}
interface Price {
  id: string;
  product: string;
  active: boolean;
  currency: string;
  unit_amount: number;
  lookup_key: string | null;
  recurring: { interval: string; interval_count: number };
}

/** An account that keeps products and prices in memory and answers like the provider's API. */
function account() {
  const products = new Map<string, Product>();
  const prices: Price[] = [];
  const writes: string[] = [];
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    const method = init?.method ?? "GET";
    if (method === "POST") writes.push(`${url.pathname} ${form.toString()}`);
    const product = /^\/v1\/products\/([^/]+)$/.exec(url.pathname)?.[1];
    const price = /^\/v1\/prices\/([^/]+)$/.exec(url.pathname)?.[1];
    const metadata = Object.fromEntries(
      [...form].flatMap(([key, value]) => {
        const name = /^metadata\[(.+)\]$/.exec(key)?.[1];
        return name ? [[name, value]] : [];
      }),
    );
    if (method === "GET" && product) {
      const found = products.get(product);
      return found
        ? Response.json({ ...found, livemode: false })
        : Response.json({ error: { message: "No such product" } }, { status: 404 });
    }
    if (method === "POST" && url.pathname === "/v1/products") {
      const created = { id: form.get("id")!, name: form.get("name")!, active: true, metadata };
      products.set(created.id, created);
      return Response.json(created);
    }
    if (method === "POST" && product) {
      const existing = products.get(product)!;
      Object.assign(existing, { name: form.get("name"), active: true, metadata });
      return Response.json(existing);
    }
    if (method === "GET" && url.pathname === "/v1/prices") {
      const lookupKey = url.searchParams.get("lookup_keys[0]");
      return Response.json({
        data: lookupKey
          ? prices
              .filter((p) => p.active && p.lookup_key === lookupKey)
              .map((p) => ({ ...p, product: { active: products.get(p.product)?.active ?? true } }))
          : prices.filter((p) => p.active && p.product === url.searchParams.get("product")),
        has_more: false,
      });
    }
    if (method === "POST" && url.pathname === "/v1/prices") {
      const lookupKey = form.get("lookup_key");
      // The key moves to the new price, as a transferred lookup key does.
      for (const other of prices) if (other.lookup_key === lookupKey) other.lookup_key = null;
      const created = {
        id: `price_${prices.length + 1}`,
        product: form.get("product")!,
        active: true,
        currency: form.get("currency")!,
        unit_amount: Number(form.get("unit_amount")),
        lookup_key: lookupKey,
        recurring: { interval: form.get("recurring[interval]")!, interval_count: 1 },
      };
      prices.push(created);
      return Response.json(created);
    }
    if (method === "POST" && price) {
      const existing = prices.find((p) => p.id === price)!;
      existing.active = form.get("active") !== "false";
      return Response.json(existing);
    }
    return Response.json({ error: { message: "Unexpected request" } }, { status: 400 });
  }) as typeof fetch;
  return { products, prices, writes, send };
}

const catalog = planCatalog("Example");
const sync = (stand: ReturnType<typeof account>, plans: CatalogPlan[] = catalog, apply = true) =>
  syncPlanCatalog({ secretKey, catalog: plans, apply, fetch: stand.send });

describe("plan catalog", () => {
  it("prices a year at ten months, and a month at what billing sells", () => {
    expect(
      catalog.map((plan) => plan.prices.map((price) => [price.interval, price.amountCents])),
    ).toEqual([
      [
        ["month", 20_000],
        ["year", 200_000],
      ],
      [
        ["month", 9_900],
        ["year", 99_000],
      ],
    ]);
    expect(catalog[0]!.metadata).toEqual({ platform_fee_cents: "5000", credits: "15000" });
    expect(catalogMatchesBilling()).toBe(true);
  });

  it("creates every product and price once, and nothing on a second run", async () => {
    const stand = account();
    const first = await sync(stand);
    expect(first.map((change) => change.action)).toEqual([
      "create_product",
      "create_price",
      "create_price",
      "create_product",
      "create_price",
      "create_price",
    ]);
    expect([...stand.products.keys()]).toEqual(["rakazo_plan_operator", "rakazo_plan_own_key"]);
    expect(stand.prices.map((price) => price.lookup_key)).toEqual([
      "rakazo_monthly_credits_20000",
      "rakazo_yearly_credits_200000",
      "rakazo_byok_max_monthly_9900",
      "rakazo_byok_max_yearly_99000",
    ]);

    const writes = stand.writes.length;
    const second = await sync(stand);
    expect(second.every((change) => change.action === "keep_price")).toBe(true);
    expect(stand.writes).toHaveLength(writes);
  });

  it("replaces a price whose amount changed and archives the old one", async () => {
    const stand = account();
    await sync(stand);
    const raised = catalog.map((plan, index) =>
      index === 1
        ? {
            ...plan,
            prices: plan.prices.map((price) =>
              price.interval === "month" ? { ...price, amountCents: 10_900 } : price,
            ),
          }
        : plan,
    );
    const changes = await sync(stand, raised);
    expect(changes.filter((change) => change.action !== "keep_price")).toEqual([
      expect.objectContaining({ action: "create_price", amountCents: 10_900 }),
      { action: "archive_price", productId: "rakazo_plan_own_key", priceId: "price_3" },
    ]);
    const old = stand.prices.find((price) => price.id === "price_3")!;
    expect(old).toMatchObject({ active: false, unit_amount: 9_900 });
    expect(stand.prices.filter((price) => price.active && price.unit_amount === 10_900)).toEqual([
      expect.objectContaining({ lookup_key: "rakazo_byok_max_monthly_9900" }),
    ]);
  });

  it("keeps a price billing already sells under its own product, lookup key and all", async () => {
    const stand = account();
    // Billing made the own-key monthly price at a first checkout, and someone is subscribed to it.
    stand.prices.push({
      id: "price_billing",
      product: "prod_billing_inline",
      active: true,
      currency: "usd",
      unit_amount: 9_900,
      lookup_key: "rakazo_byok_max_monthly_9900",
      recurring: { interval: "month", interval_count: 1 },
    });
    const changes = await sync(stand);
    expect(changes.filter((change) => change.action === "create_price")).toHaveLength(3);
    expect(stand.prices.find((price) => price.id === "price_billing")).toMatchObject({
      active: true,
      lookup_key: "rakazo_byok_max_monthly_9900",
    });
    expect(
      stand.prices.filter((price) => price.lookup_key === "rakazo_byok_max_monthly_9900"),
    ).toHaveLength(1);
  });

  it("brings back a product that was archived or renamed by hand", async () => {
    const stand = account();
    await sync(stand);
    Object.assign(stand.products.get("rakazo_plan_operator")!, { active: false, name: "Old" });
    const changes = await sync(stand);
    expect(changes.filter((change) => change.action !== "keep_price")).toEqual([
      { action: "update_product", productId: "rakazo_plan_operator", name: "Example Operator" },
    ]);
    expect(stand.products.get("rakazo_plan_operator")).toMatchObject({
      active: true,
      name: "Example Operator",
    });
  });

  it("plans without writing unless told to apply", async () => {
    const stand = account();
    const changes = await sync(stand, catalog, false);
    expect(changes).toHaveLength(6);
    expect(stand.writes).toEqual([]);
  });

  it("refuses a live key before any request, and an answer in live mode", async () => {
    const stand = account();
    for (const key of ["sk_live_fixture", "rk_live_fixture", "fixture"])
      await expect(
        syncPlanCatalog({ secretKey: key, catalog, apply: true, fetch: stand.send }),
      ).rejects.toThrow("not a test-mode key");
    expect(stand.writes).toEqual([]);

    const live = (async () => Response.json({ id: "x", livemode: true })) as typeof fetch;
    await expect(syncPlanCatalog({ secretKey, catalog, apply: true, fetch: live })).rejects.toThrow(
      "live mode",
    );
  });
});
