// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  ANDROID_META,
  DEFAULT_SCHEME,
  PLIST_KEY,
  brandWidgetPlist,
  linkScheme,
} = require("./with-link-scheme.js");
const mobile = join(import.meta.dirname, "..");
const read = (file) => readFileSync(join(mobile, file), "utf8");

function nativeSources(dir) {
  return readdirSync(join(mobile, dir)).flatMap((name) => {
    const file = join(dir, name);
    if (name === "node_modules" || name === "test") return [];
    if (statSync(join(mobile, file)).isDirectory()) return nativeSources(file);
    return /\.(swift|kt)$/.test(name) ? [file] : [];
  });
}

describe("the app's link scheme in native code", () => {
  it("is the first scheme the config registers", () => {
    expect(linkScheme({ scheme: ["example", "rakazo"] })).toBe("example");
    expect(linkScheme({ scheme: "rakazo" })).toBe("rakazo");
    expect(linkScheme({})).toBe(DEFAULT_SCHEME);
  });

  it("reaches the widget, which has its own Info.plist, along with the app's name", () => {
    const config = { name: "Example & Co", scheme: ["example", "rakazo"] };
    const once = brandWidgetPlist(read("ios-widgets/Info.plist"), config);
    expect(once).toContain(`<key>${PLIST_KEY}</key>\n  <string>example</string>`);
    expect(once).toContain("<key>CFBundleDisplayName</key>\n  <string>Example &amp; Co</string>");
    // Prebuild runs again on an existing project: the key is replaced, never repeated.
    const twice = brandWidgetPlist(once, { ...config, scheme: "other" });
    expect(twice.match(new RegExp(PLIST_KEY, "g"))).toHaveLength(1);
    expect(twice).toContain("<string>other</string>");
  });

  // A link written with a literal scheme would open the wrong app, or none, under another brand.
  it("is read from the build wherever native code makes a link", () => {
    const sources = ["ios-intents", "ios-widgets", "native", "modules"].flatMap(nativeSources);
    const literal = sources.flatMap((file) =>
      read(file)
        .split("\n")
        .filter((line) => /rakazo:\/\/|scheme = "rakazo"/.test(line) && !/origin/i.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(literal).toEqual([]);
    expect(read("modules/rakazo-notifications/ios/WorkActivityAttributes.swift")).toContain(
      `forInfoDictionaryKey: "${PLIST_KEY}"`,
    );
    expect(read("ios-intents/RakazoIntents.swift")).toContain(
      `forInfoDictionaryKey: "${PLIST_KEY}"`,
    );
    expect(
      read(
        "modules/rakazo-notifications/android/src/main/java/com/rakazo/notifications/LinkScheme.kt",
      ),
    ).toContain(`"${ANDROID_META}"`);
  });
});
