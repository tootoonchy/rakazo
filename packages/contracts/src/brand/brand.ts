// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).

/**
 * The white-label in one place. Everything a person sees that names the product, links to its
 * site or identifies its apps reads from here, so the code underneath stays as upstream wrote it
 * and an upstream sync does not fight a rename. Internal names (packages, storage keys, headers,
 * environment variables, database roles) are deliberately not part of a brand.
 */
export type Brand = {
  /** The product name people see. */
  name: string;
  /** One line under the name: page description, install prompt, store listing. */
  description: string;
  site: string;
  links: { privacy: string; terms: string; support: string };
  /** Native app identifiers. Changing one makes a new app listing, so they are set once. */
  appIds: { ios: string; android: string; desktop: string; scheme: string };
  /** The hosted app the desktop app opens first; "" asks where to connect instead. */
  cloudUrl: string;
  /** Where the mobile apps are listed; "" until a listing exists, which hides its links. */
  stores: { ios: string; android: string; androidApk: string };
  /** Whether the brand ships its own colors, fonts and corners (`brand/theme/theme.json`). */
  themed: boolean;
  /** Folder under the web app's public files holding this brand's icons ("" keeps upstream's). */
  iconPath: string;
  /** Prompts that ask people to star or support the upstream project. */
  upstreamPromos: boolean;
  /** Where the code this product is built from lives, for the open-source credits. */
  source: { name: string; url: string; license: string };
};

/** The name the upstream code and its translation catalogs are written in. */
export const UPSTREAM_NAME = "Rakazo";

const UPSTREAM: Brand = {
  name: UPSTREAM_NAME,
  description: "Your team of always-on agents.",
  site: "https://rakazo.com",
  links: {
    privacy: "https://rakazo.com/privacy/",
    terms: "https://rakazo.com/terms/",
    support: "https://rakazo.com/docs/troubleshooting",
  },
  appIds: {
    ios: "com.rakazo.app",
    android: "com.rakazo.app",
    desktop: "dev.rakazo.desktop",
    scheme: "rakazo",
  },
  cloudUrl: "https://app.rakazo.com",
  stores: {
    ios: "https://apps.apple.com/app/rakazo/id6801531099",
    android: "https://play.google.com/store/apps/details?id=com.rakazo.app",
    androidApk: "https://github.com/elie222/rakazo/releases/download/android/rakazo.apk",
  },
  themed: false,
  iconPath: "",
  upstreamPromos: true,
  source: { name: UPSTREAM_NAME, url: "https://github.com/elie222/rakazo", license: "Apache-2.0" },
};

const AGENTAL: Brand = {
  name: "Agental",
  description: "Your operator and bots, working on your business.",
  site: "https://agental.com",
  links: {
    privacy: "https://agental.com/privacy",
    terms: "https://agental.com/terms",
    support: "https://agental.com/book-a-call",
  },
  appIds: {
    ios: "com.agental.app",
    android: "com.agental.app",
    desktop: "com.agental.desktop",
    scheme: "agental",
  },
  // Set when the hosted app and the store listings exist (docs/agental-apps-release.md).
  cloudUrl: "",
  stores: { ios: "", android: "", androidApk: "" },
  themed: true,
  iconPath: "/brand/agental",
  upstreamPromos: false,
  source: UPSTREAM.source,
};

/** Set by the web build (`define` in apps/web/vite.config.ts); absent everywhere else. */
declare const __RAKAZO_BRAND__: string | undefined;

/**
 * `RAKAZO_BRAND=upstream` keeps the upstream identity. The repository's own unit and end-to-end
 * suites run that way (vitest.config.ts and the testkit harness), so tests written upstream keep
 * passing after every sync; builds and deployments of this branch leave it unset and get the
 * white-label. Servers read the variable when they start; the web app has it built in.
 */
function selectedBrand(): Brand {
  const built = typeof __RAKAZO_BRAND__ === "string" ? __RAKAZO_BRAND__ : "";
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return (built || env?.RAKAZO_BRAND) === "upstream" ? UPSTREAM : AGENTAL;
}

export const BRAND: Brand = selectedBrand();
export const BRANDS = { upstream: UPSTREAM, agental: AGENTAL } as const;

/**
 * The link schemes the mobile app answers to. The brand's own scheme is the one people and other
 * apps use; the upstream scheme stays registered because the native notification, widget and
 * shortcut code builds its in-app links with it.
 */
export function appSchemes(brand: Brand = BRAND): string[] {
  return [...new Set([brand.appIds.scheme, UPSTREAM.appIds.scheme])];
}

const UPSTREAM_WORD = new RegExp(`\\b${UPSTREAM_NAME}\\b`, "g");

/** Text written upstream, with the product named as this brand names it. */
export function brandText(text: string, brand: Brand = BRAND): string {
  return brand.name === UPSTREAM_NAME ? text : text.replace(UPSTREAM_WORD, brand.name);
}

/**
 * A compiled translation, branded. A compiled message is a string, or a list of strings and
 * placeholders `[name, type, options]` whose options hold more compiled messages; only the
 * strings a person reads are touched, never a placeholder's name or type.
 */
export function brandCompiledMessage<T>(message: T, brand: Brand = BRAND): T {
  if (brand.name === UPSTREAM_NAME) return message;
  if (typeof message === "string") return brandText(message, brand) as T;
  if (!Array.isArray(message)) return message;
  return message.map((part: unknown) => {
    if (typeof part === "string") return brandText(part, brand);
    if (!Array.isArray(part)) return part;
    const [name, type, options] = part as [unknown, unknown, unknown];
    if (!options || typeof options !== "object" || Array.isArray(options)) return part;
    const branded = Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, brandCompiledMessage(value, brand)]),
    );
    return [name, type, branded];
  }) as T;
}

/** A whole catalog (`{ id: compiled message }`), branded. */
export function brandCatalog<T extends Record<string, unknown>>(
  catalog: T,
  brand: Brand = BRAND,
): T {
  if (brand.name === UPSTREAM_NAME) return catalog;
  return Object.fromEntries(
    Object.entries(catalog).map(([id, message]) => [id, brandCompiledMessage(message, brand)]),
  ) as T;
}

/** The parts of an Expo config a brand changes. Everything else passes through as written. */
type MobileConfig = {
  name?: string;
  slug?: string;
  owner?: string;
  scheme?: string | string[];
  android?: unknown;
  extra?: { eas?: { projectId?: string } } & Record<string, unknown>;
  updates?: { url?: string } & Record<string, unknown>;
};

/** The Expo account and project a brand's builds and over-the-air updates belong to. */
export type MobileProject = { owner?: string; projectId?: string };

/**
 * `apps/mobile/app.json` as this brand ships it: its name, link schemes, app and extension
 * identifiers, and the permission prompts that name the product. The file itself stays as
 * upstream wrote it. The upstream Expo project is never carried over: a build of another brand
 * that kept it would take upstream's over-the-air updates.
 */
export function brandMobileConfig<T extends MobileConfig>(
  config: T,
  project: MobileProject = {},
  brand: Brand = BRAND,
): T {
  if (brand.name === UPSTREAM_NAME) return config;
  const upstream = UPSTREAM.appIds;
  const { android, ...rest } = config;
  const result = {
    ...(renamed(rest, upstream.ios, brand.appIds.ios, brand) as T),
    ...(android === undefined
      ? {}
      : { android: renamed(android, upstream.android, brand.appIds.android, brand) }),
    name: brand.name,
    slug: brand.appIds.scheme,
    scheme: appSchemes(brand),
  };
  // Never upstream's project: its identifier is dropped whether or not this brand has one yet.
  const eas = { ...result.extra?.eas, projectId: project.projectId };
  if (!project.projectId) delete eas.projectId;
  result.extra = { ...result.extra, eas };
  if (project.projectId) {
    result.updates = { ...result.updates, url: `https://u.expo.dev/${project.projectId}` };
  } else {
    delete result.updates;
  }
  if (project.owner) result.owner = project.owner;
  else delete result.owner;
  return result;
}

/** Every string in `value`, with app identifiers swapped and product sentences renamed. */
function renamed(value: unknown, from: string, to: string, brand: Brand): unknown {
  if (typeof value === "string") {
    const swapped = value.split(from).join(to);
    // A sentence names the product; a path or identifier that happens to contain it does not.
    return /\s/.test(swapped) ? brandText(swapped, brand) : swapped;
  }
  if (Array.isArray(value)) return value.map((item) => renamed(item, from, to, brand));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renamed(item, from, to, brand)]),
    );
  }
  return value;
}
