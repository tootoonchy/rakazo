// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
//
// Native code (notifications, the bots-at-work card, shortcuts, calls) opens the app with links.
// The scheme those links use is the app's own first scheme, handed to native code the way the
// default server already is: an Info.plist key on iOS, a manifest value on Android. A widget
// extension has its own Info.plist, so it gets the key too (`brandWidgetPlist`).
const fs = require("node:fs");
const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

const PLIST_KEY = "RakazoLinkScheme";
const ANDROID_META = "rakazo.link_scheme";
/** What native code falls back to when a build did not say: the scheme upstream's links use. */
const DEFAULT_SCHEME = "rakazo";

/** The scheme people and other apps open the app with: the first one the config registers. */
function linkScheme(config) {
  const first = [config.scheme].flat().find((scheme) => typeof scheme === "string" && scheme);
  return first ?? DEFAULT_SCHEME;
}

function withLinkScheme(config) {
  const scheme = linkScheme(config);
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults[PLIST_KEY] = scheme;
    return cfg;
  });
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      const others = (app["meta-data"] ?? []).filter((m) => m.$?.["android:name"] !== ANDROID_META);
      app["meta-data"] = [
        ...others,
        { $: { "android:name": ANDROID_META, "android:value": scheme } },
      ];
    }
    return cfg;
  });
}

const xml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A widget extension's Info.plist, as this app ships it: its link scheme added (or replaced) and
 * its display name the app's. The file in the repository stays as upstream wrote it.
 */
function brandWidgetPlist(plist, config) {
  const entry = `  <key>${PLIST_KEY}</key>\n  <string>${xml(linkScheme(config))}</string>\n`;
  const without = plist.replace(
    new RegExp(`  <key>${PLIST_KEY}</key>\\n  <string>[^<]*</string>\\n`),
    "",
  );
  const named = config.name
    ? without.replace(
        /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
        (_, before, after) => `${before}${xml(config.name)}${after}`,
      )
    : without;
  const end = named.lastIndexOf("</dict>");
  return end === -1 ? named : `${named.slice(0, end)}${entry}${named.slice(end)}`;
}

/** Rewrites the copied widget Info.plist in place. Safe to run again on an existing project. */
function writeWidgetPlist(file, config) {
  fs.writeFileSync(file, brandWidgetPlist(fs.readFileSync(file, "utf8"), config));
}

module.exports = withLinkScheme;
Object.assign(module.exports, {
  ANDROID_META,
  DEFAULT_SCHEME,
  PLIST_KEY,
  brandWidgetPlist,
  linkScheme,
  writeWidgetPlist,
});
