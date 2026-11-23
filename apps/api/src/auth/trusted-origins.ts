import { buildTrustedOrigins } from "@rakazo/auth";
import { appSchemes } from "@rakazo/contracts/brand";
import type { AppEnv } from "../env.js";

/**
 * Native clients always send the app scheme, including in Expo Go, so no
 * exp:// origin is trusted: it would accept any Expo host as a redirect target.
 * The loopback entries are the Expo web dev server.
 */
// Modified by Agental: the brand's own link scheme is trusted beside the upstream one.
const APP_ORIGINS = appSchemes().map((scheme) => `${scheme}://`);

export const MOBILE_AUTH_ORIGINS = [
  ...APP_ORIGINS,
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];

export function isTrustedOrigin(
  origin: string,
  env: Pick<AppEnv, "webOrigin" | "apiUrl" | "authUrl"> & { extraAuthOrigins?: string[] },
) {
  if (!origin) return true;
  if (APP_ORIGINS.some((app) => origin.startsWith(app))) return true;
  return new Set(trustedRequestOrigins(env)).has(origin);
}

export function trustedRequestOrigins(
  env: Pick<AppEnv, "webOrigin" | "apiUrl" | "authUrl"> & { extraAuthOrigins?: string[] },
) {
  return buildTrustedOrigins({
    origins: [env.webOrigin, env.apiUrl, env.authUrl, ...MOBILE_AUTH_ORIGINS],
    // Exactly as configured, like Better Auth's extraOrigins: no loopback twins.
    extraOrigins: env.extraAuthOrigins,
    requestOrigins: true,
  });
}
