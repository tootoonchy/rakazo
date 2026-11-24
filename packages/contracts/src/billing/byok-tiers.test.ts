// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { describe, expect, it } from "vitest";
import { BRANDS } from "../brand/brand.js";
import { byokTierPriceCents, byokTiers } from "./billing.js";

describe("own-key tiers by brand", () => {
  it("sells the white-label's one plan in Standard's place, and no other tier", () => {
    const tiers = byokTiers(BRANDS.agental.ownKeyPlan);
    expect(tiers.standard).toMatchObject({ monthlyPriceCents: 9900, annualPriceCents: 99000 });
    expect(byokTierPriceCents("standard", "month", tiers)).toBe(9900);
    for (const tier of ["pro", "max", "ultra"] as const) {
      expect(byokTierPriceCents(tier, "month", tiers)).toBeNull();
      // Someone already on the tier keeps what its price pays for.
      expect(tiers[tier].monthlyPriceCents).toBe(byokTiers(null)[tier].monthlyPriceCents);
    }
  });

  it("keeps upstream's tiers for a brand that names no plan", () => {
    const tiers = byokTiers(BRANDS.upstream.ownKeyPlan);
    expect(Object.values(tiers).map((tier) => tier.monthlyPriceCents)).toEqual([
      1500, 4900, 9900, 19900,
    ]);
  });
});
