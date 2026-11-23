// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANDS } from "./brand.js";
import { brandDesktopPackage } from "./desktop-package.js";

const pkg = JSON.parse(
  readFileSync(new URL("../../../../apps/desktop/package.json", import.meta.url), "utf8"),
);

describe("brandDesktopPackage", () => {
  it("leaves the upstream brand's package as written", () => {
    expect(brandDesktopPackage(pkg, null, BRANDS.upstream)).toBe(pkg);
  });

  it("packages the app under the brand's name and identifier", () => {
    const branded = brandDesktopPackage(
      pkg,
      { owner: "example", repo: "app" },
      BRANDS.agental,
      "assets/brand/agental/icon.png",
    );
    for (const platform of ["mac", "win", "linux"]) {
      expect(branded.build[platform].icon).toBe("assets/brand/agental/icon.png");
    }
    expect(branded.productName).toBe("Agental");
    expect(branded.build.appId).toBe("com.agental.desktop");
    expect(branded.build.mac.extendInfo.NSMicrophoneUsageDescription).toBe(
      "Agental uses the microphone for dictation and voice calls with your bots.",
    );
    expect(branded.build.publish).toEqual([{ provider: "github", owner: "example", repo: "app" }]);
    // The package and binary names are internal and stay as upstream has them.
    expect(branded.name).toBe(pkg.name);
    expect(branded.build.linux.executableName).toBe(pkg.build.linux.executableName);
  });

  it("never keeps the upstream update feed", () => {
    const branded = brandDesktopPackage(pkg, null, BRANDS.agental);
    expect(branded.build.publish).toBeUndefined();
  });
});
