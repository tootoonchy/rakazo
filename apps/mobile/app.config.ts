import { existsSync } from "node:fs";
import path from "node:path";
import { BRAND, brandMobileConfig, UPSTREAM_NAME } from "@rakazo/contracts/brand";
import type { ConfigContext, ExpoConfig } from "expo/config";

const RELEASE_PROFILES = new Set(["production", "android-apk", "diagnostic"]);

export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  if (RELEASE_PROFILES.has(process.env.EAS_BUILD_PROFILE ?? "")) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be set in the EAS production environment before building a release.",
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for production builds.");
    }
  }

  // Modified by Agental: app.json stays as upstream wrote it and the brand is applied here. A
  // white-label build belongs to its own Expo project, named by EXPO_OWNER and EAS_PROJECT_ID.
  const project = { owner: process.env.EXPO_OWNER, projectId: process.env.EAS_PROJECT_ID };
  if (
    BRAND.name !== UPSTREAM_NAME &&
    RELEASE_PROFILES.has(process.env.EAS_BUILD_PROFILE ?? "") &&
    !(project.owner && project.projectId)
  ) {
    throw new Error("EXPO_OWNER and EAS_PROJECT_ID must name this brand's Expo project.");
  }
  let result = brandMobileConfig(config as ExpoConfig, project);
  if (BRAND.name !== UPSTREAM_NAME) {
    result = brandArtwork(result, projectRoot, `./assets/brand/${BRAND.appIds.scheme}`);
  }
  // Native links (notifications, the bots-at-work card, shortcuts) use the app's first scheme.
  result = { ...result, plugins: [...(result.plugins ?? []), "./plugins/with-link-scheme"] };
  const rpId = passkeyRpId(process.env.EXPO_PUBLIC_API_URL);
  if (rpId) {
    // Native passkeys only work for domains the binary is associated with, so the app reads the
    // same list at runtime to hide passkeys on other servers. Developer mode makes a
    // development-signed build fetch the association file itself, for a server on a private
    // network or VPN that Apple's CDN cannot reach.
    const mode = process.env.RAKAZO_PASSKEY_DEVELOPER_MODE === "1" ? "?mode=developer" : "";
    result = {
      ...result,
      ios: {
        ...result.ios,
        associatedDomains: [
          ...(result.ios?.associatedDomains ?? []),
          `webcredentials:${rpId}${mode}`,
        ],
      },
      extra: { ...result.extra, passkeyRpIds: [rpId] },
    };
  }

  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (googleServicesFile) {
    result = { ...result, android: { ...result.android, googleServicesFile } };
  }

  // Native crash handling autolinks; upload build hooks are optional and require credentials.
  if (process.env.SENTRY_AUTH_TOKEN) {
    result = {
      ...result,
      plugins: [
        ...(result.plugins ?? []),
        [
          "@sentry/react-native/expo",
          {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            url: process.env.SENTRY_URL,
            // R8 obfuscates release Java and Kotlin, so upload its mapping to read native stacks.
            experimental_android: {
              enableAndroidGradlePlugin: true,
              autoUploadProguardMapping: true,
              uploadNativeSymbols: false,
              includeNativeSources: false,
            },
          },
        ],
      ],
    };
  }
  return result;
};

/**
 * The brand's own icon files, wherever the config names one of upstream's: a file in `folder`
 * replaces the file of the same name in `./assets`. The iOS icon is upstream's layered icon
 * file, which a brand replaces with its plain icon.
 */
function brandArtwork(config: ExpoConfig, projectRoot: string, folder: string): ExpoConfig {
  const own = (file: string) => existsSync(path.join(projectRoot, folder, file));
  const swap = (value: unknown): unknown => {
    if (typeof value === "string") {
      const file = /^\.\/assets\/([^/]+\.png)$/.exec(value)?.[1];
      return file && own(file) ? `${folder}/${file}` : value;
    }
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, swap(item)]));
    }
    return value;
  };
  const result = swap(config) as ExpoConfig;
  return own("icon.png")
    ? { ...result, ios: { ...result.ios, icon: `${folder}/icon.png` } }
    : result;
}

/** The default server's host when native passkeys can use it: HTTPS and a domain name. */
function passkeyRpId(apiUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(apiUrl ?? "");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".")) return null;
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}
