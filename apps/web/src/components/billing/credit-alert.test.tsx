// @vitest-environment jsdom
import type { BillingStatus } from "@rakazo/contracts";
import { Toaster } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetCreditAlertSessionForTests, useCreditAlert } from "./credit-alert";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let billing: BillingStatus | null = null;
vi.mock("./SubscriptionGate", () => ({
  useBilling: () => ({ status: billing, showPlans: () => undefined }),
}));

const onAddCredits = vi.fn();
function Probe() {
  useCreditAlert(onAddCredits);
  return null;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.clear();
  resetCreditAlertSessionForTests();
  onAddCredits.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const credits = (leftUsd: number, usedUsd: number, owner = true) =>
  ({
    funding: "credits",
    balanceUsd: leftUsd,
    creditsUsedUsd: usedUsd,
    canManage: owner,
    creditPurchasesEnabled: true,
  }) as BillingStatus;

async function show(status: BillingStatus | null) {
  billing = status;
  await act(async () =>
    root.render(
      <>
        <Toaster />
        <Probe />
      </>,
    ),
  );
}

const alert = () => document.querySelector('[data-testid="credit-alert"]');
const button = (name: string) =>
  [...(alert()?.querySelectorAll("button") ?? [])].find((item) => item.textContent === name);

it("announces each level once, and again only after credits were added", async () => {
  await show(credits(60, 40));
  expect(alert()).toBeNull();

  await show(credits(40, 60));
  // The toaster mounts toasts on its own timers.
  await vi.waitFor(() => expect(alert()?.textContent).toContain("50% of your credits are used."));
  await act(async () => button("Dismiss")?.click());
  await vi.waitFor(() => expect(alert()).toBeNull());

  // The same level on a later read stays quiet.
  await show(credits(35, 65));
  expect(alert()).toBeNull();

  await show(credits(0, 100));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("Your credits are used up."));
  await act(async () => button("Add credits")?.click());
  expect(onAddCredits).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(alert()).toBeNull());

  // A refill starts over: nothing at once, then the first level again.
  await show(credits(100, 0));
  expect(alert()).toBeNull();
  await show(credits(50, 50));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("50% of your credits are used."));
});

it("offers no purchase to a member who cannot buy credits", async () => {
  await show(credits(10, 90, false));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  expect(button("Add credits")).toBeUndefined();
  expect(button("Dismiss")).toBeDefined();
});
