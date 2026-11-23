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
  themed: true,
  iconPath: "/brand/agental",
  upstreamPromos: false,
  source: UPSTREAM.source,
};

/**
 * `RAKAZO_BRAND=upstream` keeps the upstream identity. The repository's own test suite runs that
 * way (see vitest.config.ts), so tests written upstream keep passing after every sync; builds and
 * deployments of this branch leave it unset and get the white-label.
 */
function selectedBrand(): Brand {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.RAKAZO_BRAND === "upstream" ? UPSTREAM : AGENTAL;
}

export const BRAND: Brand = selectedBrand();
export const BRANDS = { upstream: UPSTREAM, agental: AGENTAL } as const;

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
