// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANDS, brandAddresses, brandMobileConfig } from "./brand.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../../../apps/mobile/app.json", import.meta.url), "utf8"),
).expo;

describe("brandMobileConfig", () => {
  it("leaves the upstream brand's config as written", () => {
    expect(brandMobileConfig(manifest, {}, BRANDS.upstream)).toBe(manifest);
  });

  it("ships the app under the brand's name, schemes and identifiers", () => {
    const branded = brandMobileConfig(
      manifest,
      { owner: "example-owner", projectId: "11111111-2222-3333-4444-555555555555" },
      BRANDS.agental,
    );
    expect(branded.name).toBe("Agental");
    expect(branded.scheme).toEqual(["agental", "rakazo"]);
    expect(branded.ios.bundleIdentifier).toBe("com.agental.app");
    expect(branded.android.package).toBe("com.agental.app");
    expect(branded.owner).toBe("example-owner");
    expect(branded.updates.url).toBe("https://u.expo.dev/11111111-2222-3333-4444-555555555555");
    // Extensions, their shared container and the permission prompts follow the app.
    const text = JSON.stringify(branded);
    expect(text).toContain("com.agental.app.widgets");
    expect(text).toContain("group.com.agental.app");
    expect(text).not.toContain("com.rakazo.app");
    expect(branded.ios.infoPlist.NSCameraUsageDescription).toBe(
      "Agental uses the camera so you can attach photos to a bot message.",
    );
    // Paths and target names are internal and stay as upstream has them.
    expect(branded.ios.icon).toBe(manifest.ios.icon);
    expect(text).toContain("RakazoWidgets");
  });

  it("never keeps the upstream Expo project", () => {
    const branded = brandMobileConfig(manifest, {}, BRANDS.agental);
    expect(branded.owner).toBeUndefined();
    expect(branded.updates).toBeUndefined();
    expect(branded.extra.eas.projectId).toBeUndefined();
    expect(JSON.stringify(branded)).not.toContain(manifest.extra.eas.projectId);
  });
});

describe("brandAddresses", () => {
  it("takes the hosted app and the store listings from the deployment's settings", () => {
    expect(
      brandAddresses({
        RAKAZO_CLOUD_URL: " https://app.example.com ",
        BRAND_IOS_STORE_URL: "https://apps.example.com/app/id1",
        BRAND_ANDROID_STORE_URL: "https://play.example.com/details?id=com.example.app",
      }),
    ).toEqual({
      cloudUrl: "https://app.example.com",
      stores: {
        ios: "https://apps.example.com/app/id1",
        android: "https://play.example.com/details?id=com.example.app",
        androidApk: "",
      },
    });
  });

  it("leaves anything unset or not https empty, which hides its links", () => {
    expect(brandAddresses({ RAKAZO_CLOUD_URL: "http://app.example.com" })).toEqual({
      cloudUrl: "",
      stores: { ios: "", android: "", androidApk: "" },
    });
    expect(brandAddresses().cloudUrl).toBe("");
  });
});
