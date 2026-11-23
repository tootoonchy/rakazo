# The Agental white-label

This branch (`agental-whitelabel`) is Rakazo with another name and look. It is built so that an
upstream sync stays a plain merge: the code underneath is left as upstream wrote it, and the
white-label is a thin layer on top.

## One config

[`packages/contracts/src/brand/brand.ts`](../../packages/contracts/src/brand/brand.ts) is the
brand: the product name, its description, the site and legal links, the native app identifiers,
the icon folder, and whether upstream's own prompts (star the project, its store listings, its
self-host docs) are shown. The colors, corners and font live beside it in
[`brand/theme/theme.json`](../../packages/contracts/src/brand/theme/theme.json), in the format the
web app already reads for `RAKAZO_THEME`.

| What a person sees                                  | Where it comes from                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The product name in every screen and every language | Source strings and translation catalogs still say the upstream name. `brandI18n` swaps the name as a catalog loads, and in the English fallback of a string no catalog lists yet. Text a person typed is never rewritten. |
| Page title, description, install name               | `brandIndexHtml` and the web manifest read the brand.                                                                                                                                                                     |
| Colors, square corners, Inter                       | The brand's theme file is the default theme; `RAKAZO_THEME` still overrides it.                                                                                                                                           |
| Icons                                               | `apps/web/public/brand/agental/`. Upstream's icons stay where they are.                                                                                                                                                   |
| Sign-in mark                                        | `BrandMark` replaces the upstream mascot on the sign-in screen.                                                                                                                                                           |
| Sign-in prompts (passkeys, authenticator apps)      | The auth server's app name reads the brand.                                                                                                                                                                               |
| Credits                                             | Account menu, "Open-source licenses": the project this is built on, its license and the `NOTICE` file.                                                                                                                    |

## What is deliberately not renamed

Package names (`@rakazo/*`), environment variables (`RAKAZO_*`), storage keys, cookies, request
headers, database roles, file paths and release scripts keep their upstream names. Renaming them
would break existing installs and make every upstream sync conflict, and nobody using the product
sees them.

## Tests

The repository's own suite is written upstream and names the upstream product, so it runs with
`RAKAZO_BRAND=upstream` (set in `vitest.config.ts`) and keeps passing after a sync. The
white-label has its own tests: `packages/i18n/src/brand.test.ts` and
`apps/web/server/brand-page.test.ts`. Builds and deployments leave `RAKAZO_BRAND` unset.

## Syncing upstream

Merge upstream's `main` into this fork's `main` (never squash), then merge `main` into
`agental-whitelabel`. Files changed for the white-label carry a "Modified by Agental" comment at
the change, so a conflict is easy to recognise.

## Known gaps

- The instructions bots are given still name the upstream product, so a bot asked what it runs on
  may say so.
- Lifecycle emails take their wording from the deployment (`EMAIL_COPY_DIR`); none is supplied yet.
- The desktop and mobile apps take the brand when they are built, and have not been built for a
  store or signed yet: see [agental-apps-release.md](../agental-apps-release.md).
- The icons are a plain placeholder mark until the brand's own artwork is supplied.
