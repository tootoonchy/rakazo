// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { BRAND } from "@rakazo/contracts/brand";
import { catalogMatchesBilling, planCatalog, syncPlanCatalog } from "./stripe-plan-catalog.js";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const flags = process.argv.slice(2);
const apply = flags.includes("--apply");
if (flags.some((flag) => flag !== "--apply")) {
  process.stderr.write("Usage: pnpm billing:plans [--apply]\n");
  process.exit(1);
}
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) {
  process.stderr.write("Set STRIPE_SECRET_KEY to the deployment's test-mode key.\n");
  process.exit(1);
}

try {
  const changes = await syncPlanCatalog({ secretKey, catalog: planCatalog(BRAND.name), apply });
  for (const change of changes) {
    if ("name" in change)
      process.stdout.write(`${change.action} ${change.productId} "${change.name}"\n`);
    else if ("priceId" in change)
      process.stdout.write(`${change.action} ${change.priceId} on ${change.productId}\n`);
    else
      process.stdout.write(
        `${change.action} ${change.lookupKey} ${dollars(change.amountCents)} per ${change.interval}\n`,
      );
  }
  const pending = changes.filter((change) => change.action !== "keep_price").length;
  process.stdout.write(
    pending === 0
      ? "Nothing to change.\n"
      : apply
        ? `Done: ${pending} changes made.\n`
        : `Dry run: ${pending} changes planned. Add --apply to make them.\n`,
  );
  if (!catalogMatchesBilling())
    process.stdout.write(
      "Warning: billing no longer sells these monthly amounts, so it will not find these prices.\n",
    );
  process.stdout.write(
    "The server needs these settings (names only): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, MONTHLY_PLATFORM_FEE_CENTS, COST_MARKUP.\n",
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
