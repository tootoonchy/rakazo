// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { BRANDS } from "@rakazo/contracts/brand";
import { describe, expect, it } from "vitest";
import { setupBrandCss } from "./setup-brand-css.js";

describe("setupBrandCss", () => {
  it("gives a themed brand its own colors and corners on the setup page", () => {
    const css = setupBrandCss(BRANDS.agental) ?? "";
    expect(css).toContain('[data-theme="light"]{--background:#FAFAF9;');
    expect(css).toContain("--card-foreground:");
    expect(css).toContain("--radius:0px;");
  });

  it("leaves the upstream look alone", () => {
    expect(setupBrandCss(BRANDS.upstream)).toBeNull();
  });
});
