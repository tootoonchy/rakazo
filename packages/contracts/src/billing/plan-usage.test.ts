import { describe, expect, it } from "vitest";
import type { BillingStatus } from "./billing.js";
import { creditAlertLevel, modelCreditsUsd } from "./billing.js";
import { planUsagePercent } from "./usage.js";

describe("modelCreditsUsd", () => {
  const status = (overrides: Partial<BillingStatus>) => overrides as BillingStatus;

  it("hides credits from members who only run on their own plans", () => {
    expect(modelCreditsUsd(null)).toBeNull();
    expect(modelCreditsUsd(status({ funding: "byok", balanceUsd: 0 }))).toBeNull();
    expect(modelCreditsUsd(status({ funding: null }))).toBeNull();
  });

  it("shows a credit plan's balance, even when it is spent, and a balance left after switching", () => {
    expect(modelCreditsUsd(status({ funding: "credits", balanceUsd: 0 }))).toBe(0);
    expect(modelCreditsUsd(status({ funding: "byok", balanceUsd: 4.5 }))).toBe(4.5);
  });
});

describe("creditAlertLevel", () => {
  it("reports the highest share of the credits reached", () => {
    expect(creditAlertLevel(60, 40)).toBeNull();
    expect(creditAlertLevel(50, 50)).toBe(50);
    expect(creditAlertLevel(20, 80)).toBe(80);
    expect(creditAlertLevel(0.01, 99.99)).toBe(80);
    expect(creditAlertLevel(0, 100)).toBe(100);
  });

  it("stays quiet without credits or before any were used", () => {
    expect(creditAlertLevel(null, 30)).toBeNull();
    expect(creditAlertLevel(0, 0)).toBeNull();
  });
});

describe("planUsagePercent", () => {
  it("is the subscription with the most room, judged by its fullest window", () => {
    expect(planUsagePercent([])).toBeNull();
    expect(
      planUsagePercent([
        {
          credentialId: "a",
          name: "A",
          label: "A",
          windows: [
            { period: "session", usedPercent: 12, resetsAt: null },
            { period: "week", usedPercent: 64, resetsAt: null },
          ],
        },
        {
          credentialId: "b",
          name: "B",
          label: "B",
          windows: [{ period: "session", usedPercent: 93, resetsAt: null }],
        },
      ]),
    ).toBe(64);
  });
});
