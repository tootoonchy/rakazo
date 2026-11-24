<!-- Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE). -->

# Design registries

Besides the official shadcn registry, the white-label's `packages/ui-web/components.json` lists four registries the
maintainer chose. The file holds only `${NAME}` references; values never enter the repository.

| Registry | Address | Secret | Sent as |
| --- | --- | --- | --- |
| `@uiarc` | `https://uiarc.dev/r/{name}.json` | none | |
| `@uiarc-pro` | `https://uiarc.dev/r/pro/{name}.json` | `ARC_PRO_TOKEN` | `Authorization: Bearer …` |
| `@cult-ui-pro` | `https://pro.cult-ui.com/api/registry/{name}` | `CULT_PRO_API_KEY` | `X-API-Key: …` |
| `@aisdkagents` | `https://www.aisdkagents.com/pro-registry/{name}` | `AISDK_AGENTS_TOKEN` | `Authorization: Bearer …` |

## Secrets

- **Locally:** put the three names from `.env.example` in `packages/ui-web/.env.local` (gitignored). The shadcn CLI reads
  `.env.local` from the folder it runs in, so run it from `packages/ui-web`.
- **CI:** add them as repository secrets under the same names, only for a job that runs the shadcn CLI. No service reads
  them, so deployments need none.
- Each comes from its registry's account page: the Arc Pro token, the Cult Pro API key, the AI SDK Agents registry token.

## Using them

From `packages/ui-web`:

```bash
pnpm exec shadcn list @uiarc
pnpm exec shadcn view @uiarc-pro/agent-run
pnpm exec shadcn add @cult-ui-pro/<item>
```

Arc Pro publishes no index, so `list @uiarc-pro` fails: use `view` with an item name, or search through the Arc MCP server.
Install only items the maintainer picked, then restyle them with the `@rakazo/ui-tokens` tokens and the shared
primitives (AGENTS.md, UI system) before they reach a screen.

## MCP servers for Claude Code

`packages/ui-web/.mcp.json` (from `npx shadcn@latest mcp init --client claude`) starts the shadcn MCP server from
`packages/ui-web`, so it reads the same `.env.local`, and adds Arc's read-only MCP server (`https://uiarc.dev/api/mcp`).
Neither holds a token. Start Claude Code from `packages/ui-web` for them to load.

## Arc foundation

`@uiarc/arc-foundation` is installed once in `packages/ui-web/src/components/arc/`. `apps/web/src/styles.css` imports its
`foundation.css` into the `arc` cascade layer, declared before Tailwind's layers, so the product's tokens and Tailwind's
theme win wherever a variable name is shared (Arc also uses `--background`, `--foreground`, `--border`, `--accent` and the
same `data-theme` attribute). One effect does show: Arc's focus rules are `!important`, which no layer order overrides, so
focused buttons and links get Arc's 2px outline beside the product's ring, and inputs drop the browser's outline.
