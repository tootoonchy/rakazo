// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { BillingStatus } from "@rakazo/contracts";
import { captureScreenshot, completeOnboarding, signup } from "../helpers/helpers";

async function enableBilling(route: Route, path: "me" | "bootstrap") {
  const response = await route.fetch();
  const body = (await response.json()) as { json?: Record<string, unknown> };
  const me = path === "me" ? body.json : (body.json?.me as Record<string, unknown> | undefined);
  if (me) me.billingEnabled = true;
  await route.fulfill({ response, json: body });
}

// $8 of work since credits were last added and $2 left: 80% of them are used.
const status: BillingStatus = {
  access: true,
  canManage: true,
  trialAvailable: false,
  trialDays: 7,
  state: "active",
  price: null,
  seats: 1,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  hasCustomer: true,
  funding: "credits",
  balanceUsd: 2,
  creditsUsedUsd: 8,
  creditPurchasesEnabled: true,
};

test("an owner is told once when most credits are used, and can go add more", async ({
  page,
}, testInfo) => {
  await signup(page, `credit-alert-${Date.now()}@rakazo.test`, "password12", "Credit alert");
  await completeOnboarding(page);

  await page.route("**/api/auth/capabilities", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), billing: true } });
  });
  await page.route("**/rpc/me", (route) => enableBilling(route, "me"));
  await page.route("**/rpc/bootstrap", (route) => enableBilling(route, "bootstrap"));
  await page.route("**/rpc/billing/status", (route) => route.fulfill({ json: { json: status } }));
  await page.reload();

  const alert = page.getByTestId("credit-alert");
  await expect(alert).toContainText("80% of your credits are used.");
  await captureScreenshot(page, testInfo, "credit-alert");

  await alert.getByRole("button", { name: "Add credits" }).click();
  await expect(page.getByTestId("user-settings")).toHaveAttribute(
    "data-settings-section",
    "billing",
  );
  await expect(alert).toHaveCount(0);

  // The same level is not announced again on the next visit.
  await page.reload();
  await expect(page.getByTestId("user-menu-trigger")).toBeVisible();
  await expect(alert).toHaveCount(0);
});
