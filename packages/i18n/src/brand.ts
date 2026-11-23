// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { I18n } from "@lingui/core";
import type { Brand } from "@rakazo/contracts/brand";
import { BRAND, brandCatalog, brandText, UPSTREAM_NAME } from "@rakazo/contracts/brand";

type Catalog = Record<string, unknown>;
type Descriptor = { id: string; message?: string };

/**
 * Makes one Lingui instance speak the brand's name. Source strings and translation catalogs stay
 * exactly as upstream ships them (they say the upstream name); the name is swapped as a catalog
 * is loaded, and in the English fallback of a string no catalog lists yet. Values a person typed
 * (a bot's name, a message) are never rewritten, because only the message text is touched.
 */
export function brandI18n(i18n: I18n, brand: Brand = BRAND): void {
  if (brand.name === UPSTREAM_NAME) return;
  const load = i18n.load.bind(i18n) as (a: unknown, b?: unknown) => void;
  const loadAndActivate = i18n.loadAndActivate.bind(i18n);
  const translate = i18n._.bind(i18n) as (...args: unknown[]) => string;

  i18n.load = ((localeOrCatalogs: string | Record<string, Catalog>, catalog?: Catalog) => {
    if (typeof localeOrCatalogs === "string") {
      load(localeOrCatalogs, catalog && brandCatalog(catalog, brand));
      return;
    }
    load(
      Object.fromEntries(
        Object.entries(localeOrCatalogs).map(([locale, messages]) => [
          locale,
          brandCatalog(messages, brand),
        ]),
      ),
    );
  }) as typeof i18n.load;

  i18n.loadAndActivate = ((options: Parameters<typeof loadAndActivate>[0]) =>
    loadAndActivate({
      ...options,
      messages: brandCatalog(options.messages as Catalog, brand) as typeof options.messages,
    })) as typeof i18n.loadAndActivate;

  const branded = ((
    id: string | Descriptor,
    values?: unknown,
    options?: { message?: string },
  ): string => {
    if (typeof id !== "string") {
      return translate(
        id.message ? { ...id, message: brandText(id.message, brand) } : id,
        values,
        options,
      );
    }
    const message = options?.message;
    return translate(
      id,
      values,
      message ? { ...options, message: brandText(message, brand) } : options,
    );
  }) as typeof i18n._;
  i18n._ = branded;
  i18n.t = branded;
}
