// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { describe, expect, it, vi } from "vitest";
import { chargedMicros, costMarkup, coveredCostUsd, creditsGrantedCents } from "./cost-markup.js";

describe("cost markup", () => {
  it("charges at cost when unset, as upstream does", () => {
    expect(costMarkup({})).toBe(1);
    expect(chargedMicros(1.5)).toBe(1_500_000n);
  });

  it("charges the markup over real cost, rounded up, and never marks up an already priced service", () => {
    vi.stubEnv("COST_MARKUP", "2");
    expect(chargedMicros(1.5)).toBe(3_000_000n);
    expect(chargedMicros(0.0000004)).toBe(1n);
    expect(chargedMicros(1.5, "services")).toBe(1_500_000n);
    expect(coveredCostUsd(3_000_000n)).toBe(1.5);
  });

  it("keeps the platform fee out of a monthly plan's credits, and never out of a top-up", () => {
    const fee = { MONTHLY_PLATFORM_FEE_CENTS: "5000" };
    const monthly = { amountCents: 20_000, expiresAt: "2027-02-01T00:00:00.000Z" };
    expect(creditsGrantedCents(monthly, fee)).toBe(15_000);
    expect(creditsGrantedCents({ amountCents: 20_000 }, fee)).toBe(20_000);
    expect(creditsGrantedCents({ ...monthly, amountCents: 3000 }, fee)).toBe(0);
    expect(creditsGrantedCents(monthly, {})).toBe(20_000);
  });

  it("refuses a markup that would sell below cost or is not a number", () => {
    for (const value of ["0.5", "0", "-2", "abc", "11"]) {
      expect(() => costMarkup({ COST_MARKUP: value })).toThrow("COST_MARKUP");
    }
  });
});
