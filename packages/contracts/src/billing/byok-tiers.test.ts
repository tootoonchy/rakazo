// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { describe, expect, it } from "vitest";
import { BRANDS } from "../brand/brand.js";
import { byokTiers } from "./billing.js";

describe("own-key tiers by brand", () => {
  it("sells the white-label's one plan in Standard's place, and no other tier", () => {
    const tiers = byokTiers(BRANDS.agental.ownKeyPlan);
    expect(tiers.standard).toMatchObject({ monthlyPriceCents: 9900, annualPriceCents: 99000 });
    expect([tiers.pro, tiers.max, tiers.ultra].map((tier) => tier.monthlyPriceCents)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("keeps upstream's tiers for a brand that names no plan", () => {
    const tiers = byokTiers(BRANDS.upstream.ownKeyPlan);
    expect(Object.values(tiers).map((tier) => tier.monthlyPriceCents)).toEqual([
      1500, 4900, 9900, 19900,
    ]);
  });
});
