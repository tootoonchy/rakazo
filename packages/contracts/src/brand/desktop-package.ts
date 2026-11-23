// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { Brand } from "./brand.js";
import { BRAND, brandText, UPSTREAM_NAME } from "./brand.js";

/** The parts of the desktop app's package file a brand changes. */
type DesktopPackage = {
  productName?: string;
  author?: unknown;
  build?: {
    appId?: string;
    mac?: { extendInfo?: Record<string, unknown> } & Record<string, unknown>;
    win?: Record<string, unknown>;
    linux?: Record<string, unknown>;
    publish?: unknown;
  } & Record<string, unknown>;
};

/**
 * `apps/desktop/package.json` as this brand packages it: the name people see, the app
 * identifier and the permission prompts. Binary names, paths and the package name stay as
 * upstream has them. Updates come from `feed`, the repository that publishes this brand's
 * releases; with none the app is packaged without an update feed, never with upstream's.
 * `icon` is the brand's own icon file, relative to the package, when it has one.
 */
export function brandDesktopPackage<T extends DesktopPackage>(
  pkg: T,
  feed: { owner: string; repo: string } | null = null,
  brand: Brand = BRAND,
  icon: string | null = null,
): T {
  if (brand.name === UPSTREAM_NAME) return pkg;
  const { publish: _upstreamFeed, ...build } = pkg.build ?? {};
  const prompts = Object.fromEntries(
    Object.entries(build.mac?.extendInfo ?? {}).map(([key, value]) => [
      key,
      typeof value === "string" ? brandText(value, brand) : value,
    ]),
  );
  return {
    ...pkg,
    productName: brand.name,
    author: { name: brand.name },
    build: {
      ...build,
      appId: brand.appIds.desktop,
      ...(build.mac
        ? { mac: { ...build.mac, extendInfo: prompts, ...(icon ? { icon } : {}) } }
        : {}),
      ...(icon && build.win ? { win: { ...build.win, icon } } : {}),
      ...(icon && build.linux ? { linux: { ...build.linux, icon } } : {}),
      ...(feed ? { publish: [{ provider: "github", ...feed }] } : {}),
    },
  };
}
