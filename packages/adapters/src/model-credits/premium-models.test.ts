// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { afterEach, describe, expect, it, vi } from "vitest";
import { premiumDefaultModelWarning } from "../models/deployment-model.js";
import {
  creditsCanPriceModel,
  creditsOutputPriceUsd,
  listPiCatalog,
} from "../runtime/pi/models/pi-models.js";
import { isPremiumModelPrice, premiumModelOutputUsd } from "./premium-models.js";

afterEach(() => vi.unstubAllEnvs());

describe("premium model setting", () => {
  it("has no premium models until a threshold is set", () => {
    expect(premiumModelOutputUsd({})).toBeNull();
    expect(premiumModelOutputUsd({ PREMIUM_MODEL_OUTPUT_USD: "  " })).toBeNull();
    expect(isPremiumModelPrice(1_000, {})).toBe(false);
  });

  it("counts a model at or above the threshold as premium, and an unpriced one as not", () => {
    const env = { PREMIUM_MODEL_OUTPUT_USD: "10" };
    expect(isPremiumModelPrice(9.99, env)).toBe(false);
    expect(isPremiumModelPrice(10, env)).toBe(true);
    expect(isPremiumModelPrice(75, env)).toBe(true);
    expect(isPremiumModelPrice(undefined, env)).toBe(false);
  });

  it("refuses a threshold that is not a number above 0", () => {
    for (const value of ["cheap", "0", "-5", "Infinity"])
      expect(() => premiumModelOutputUsd({ PREMIUM_MODEL_OUTPUT_USD: value })).toThrow(
        "PREMIUM_MODEL_OUTPUT_USD must be a number above 0",
      );
  });
});

describe("the output price credits pay", () => {
  it("is known for every registry model credits can price", () => {
    const priced = listPiCatalog().filter((entry) => creditsCanPriceModel(entry));
    expect(priced.length).toBeGreaterThan(0);
    for (const entry of priced) expect(creditsOutputPriceUsd(entry)).toBeGreaterThanOrEqual(0);
    expect(creditsOutputPriceUsd({ provider: "no-such-provider", id: "no-such-model" })).toBe(
      undefined,
    );
  });

  it("is the approved offering's tariff when the deployment lists its offerings", () => {
    offer(30);
    expect(creditsOutputPriceUsd({ provider: "provider-a", id: "model-a" })).toBe(30);
    expect(creditsOutputPriceUsd({ provider: "provider-a", id: "other" })).toBeUndefined();
  });
});

describe("a premium default model", () => {
  it("is reported, since credits would refuse it for every organization that has not opted in", () => {
    offer(30);
    vi.stubEnv("PREMIUM_MODEL_OUTPUT_USD", "20");
    expect(premiumDefaultModelWarning()).toContain("default model is premium");
    vi.stubEnv("PREMIUM_MODEL_OUTPUT_USD", "40");
    expect(premiumDefaultModelWarning()).toBeNull();
    vi.stubEnv("PREMIUM_MODEL_OUTPUT_USD", "");
    expect(premiumDefaultModelWarning()).toBeNull();
  });
});

function offer(outputUsdPerMillion: number) {
  vi.stubEnv(
    "MODEL_CREDIT_OFFERINGS",
    JSON.stringify({
      defaultOfferingId: "approved",
      offerings: [
        {
          id: "approved",
          connectionId: "operator-connection",
          provider: "provider-a",
          modelId: "model-a",
          price: { input: 1, output: outputUsdPerMillion, cacheRead: 0, cacheWrite: 1 },
        },
      ],
    }),
  );
}
