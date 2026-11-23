// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Brand } from "@rakazo/contracts/brand";
import { BRAND, BRANDS, brandText } from "@rakazo/contracts/brand";
import type { Plugin } from "vite";

const NOTICE_MODULE = "virtual:open-source-notice";

/** Hands the app the repository's NOTICE file, word for word, as `virtual:open-source-notice`. */
export function openSourceNotice(): Plugin {
  const file = fileURLToPath(new URL("../../../NOTICE", import.meta.url));
  return {
    name: "open-source-notice",
    resolveId: (source) => (source === NOTICE_MODULE ? `\0${NOTICE_MODULE}` : undefined),
    load: (id) =>
      id === `\0${NOTICE_MODULE}`
        ? `export default ${JSON.stringify(readFileSync(file, "utf8"))};`
        : undefined,
  };
}

/** The built-in look of a themed brand, in the same format as a `RAKAZO_THEME` file. */
export function brandThemeFile(brand: Brand = BRAND): string | undefined {
  if (!brand.themed) return undefined;
  return fileURLToPath(import.meta.resolve("@rakazo/contracts/brand-theme"));
}

/** `index.html` as upstream wrote it, with the brand's name and description. */
export function brandIndexHtml(html: string, brand: Brand = BRAND): string {
  return brandText(html, brand)
    .replaceAll(BRANDS.upstream.description, brand.description)
    .replace(
      /href="\/(favicon\.ico|favicon\.png|apple-touch-icon\.png)"/g,
      (_link, file: string) => `href="${brandIcon(file, brand)}"`,
    );
}

/** An icon's address: the brand's own copy when it ships one, else upstream's at the root. */
export function brandIcon(file: string, brand: Brand = BRAND): string {
  return `${brand.iconPath}/${file}`;
}
