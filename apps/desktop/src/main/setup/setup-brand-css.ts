// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { Brand } from "@rakazo/contracts/brand";
import { BRAND } from "@rakazo/contracts/brand";
import theme from "@rakazo/contracts/brand-theme" with { type: "json" };
import type { WebColorTokens } from "@rakazo/ui-tokens";
import { cssVariableName } from "@rakazo/ui-tokens";

type Palette = Record<string, string>;

function variables(palette: Palette): string {
  return Object.entries(palette)
    .map(([token, value]) => `${cssVariableName(token as keyof WebColorTokens)}:${value};`)
    .join("");
}

/**
 * The brand's colors and corners for the setup page, which is styled by the shared tokens file
 * and so needs only its variables replaced. Null for a brand that keeps the upstream look.
 */
export function setupBrandCss(brand: Brand = BRAND): string | null {
  if (!brand.themed) return null;
  const square = theme.radius === "0px" ? "*{border-radius:0!important}" : "";
  return (
    `:root,[data-theme="dark"]{${variables(theme.dark)}--radius:${theme.radius};}` +
    `[data-theme="light"]{${variables(theme.light)}}${square}`
  );
}
