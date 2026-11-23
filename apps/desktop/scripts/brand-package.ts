// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BRAND } from "@rakazo/contracts/brand";
import { brandDesktopPackage } from "@rakazo/contracts/brand-desktop";

/**
 * Rewrites the desktop package file for the selected brand before packaging:
 * `pnpm exec tsx apps/desktop/scripts/brand-package.ts apps/desktop/package.json`. A release runner's
 * repository becomes the update feed. Run it in a release checkout, never commit the result.
 */
const file = process.argv[2];
if (!file) throw new Error("A desktop package file is required.");
const repository = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)$/.exec(
  process.env.GITHUB_REPOSITORY ?? "",
);
const feed = repository ? { owner: repository[1] ?? "", repo: repository[2] ?? "" } : null;
// The brand's own icon, when the checkout has one beside upstream's.
const art = `assets/brand/${BRAND.appIds.scheme}/icon.png`;
const icon = existsSync(path.join(path.dirname(file), art)) ? art : null;
const pkg = JSON.parse(readFileSync(file, "utf8"));
writeFileSync(file, `${JSON.stringify(brandDesktopPackage(pkg, feed, BRAND, icon), null, 2)}\n`);
