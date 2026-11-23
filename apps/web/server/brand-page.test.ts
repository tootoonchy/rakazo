// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRANDS, UPSTREAM_NAME } from "@rakazo/contracts/brand";
import { describe, expect, it } from "vitest";
import { brandIndexHtml, brandThemeFile } from "./brand-page";
import { parseInstanceTheme, renderInstanceThemeCss } from "./instance-theme";

describe("the white-label page", () => {
  it("ships a theme the instance-theme reader accepts, with square corners and its own font", () => {
    const file = brandThemeFile(BRANDS.agental);
    if (!file) throw new Error("the brand has no theme");
    const theme = parseInstanceTheme(readFileSync(file, "utf8"), path.dirname(file));
    const css = renderInstanceThemeCss(theme);
    expect(css).toContain("--radius: 0px;");
    expect(css).toContain('font-family: "Inter";');
    expect(theme.light.background).toBe("#FAFAF9");
  });

  it("names the brand in index.html and nowhere the upstream product", () => {
    const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
    const branded = brandIndexHtml(html, BRANDS.agental);
    expect(branded).toContain("<title>Agental</title>");
    expect(branded).toContain(BRANDS.agental.description);
    expect(branded).not.toContain(UPSTREAM_NAME);
  });

  it("has no theme for the upstream identity, so its default deploy is unchanged", () => {
    expect(brandThemeFile(BRANDS.upstream)).toBeUndefined();
  });
});
