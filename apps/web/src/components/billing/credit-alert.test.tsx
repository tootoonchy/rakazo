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
let billedSpace = "space-a";
vi.mock("./SubscriptionGate", () => ({
  CREDIT_ALERT_TOAST_ID: "credit-alert",
  useBilling: () => ({ status: billing, spaceId: billedSpace, showPlans: () => undefined }),
}));

const onAddCredits = vi.fn();
let probeAction: () => void = onAddCredits;
function Probe() {
  useCreditAlert(probeAction);
  return null;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.clear();
  billedSpace = "space-a";
  resetCreditAlertSessionForTests();
  onAddCredits.mockClear();
  probeAction = onAddCredits;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const credits = (leftUsd: number, usedUsd: number, owner = true, addedAt = "2027-01-01") =>
  ({
    funding: "credits",
    balanceUsd: leftUsd,
    creditsUsedUsd: usedUsd,
    creditsAddedAt: addedAt,
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
  await act(async () => button("Top up to continue")?.click());
  expect(onAddCredits).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(alert()).toBeNull());

  // A refill starts over: nothing at once, then the first level again.
  await show(credits(100, 0, true, "2027-02-01"));
  expect(alert()).toBeNull();
  await show(credits(50, 50, true, "2027-02-01"));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("50% of your credits are used."));
});

it("offers no purchase to a member who cannot buy credits", async () => {
  await show(credits(10, 90, false));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  expect(button("Add credits")).toBeUndefined();
  expect(button("Dismiss")).toBeDefined();
});

it("announces a level again after a refill the member was away for", async () => {
  await show(credits(20, 80));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  await act(async () => button("Dismiss")?.click());
  await vi.waitFor(() => expect(alert()).toBeNull());

  // The next visit finds credits added since, and already 80% of those used.
  await act(async () => root.unmount());
  root = createRoot(host);
  await show(credits(20, 80, true, "2027-02-01"));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
});

it("takes down a notice that a refill made untrue", async () => {
  await show(credits(0, 100));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("Your credits are used up."));
  // Credits were added in another window; the next status no longer has a level to report.
  await show(credits(100, 0, true, "2027-02-01"));
  await vi.waitFor(() => expect(alert()).toBeNull());
});

it("does not repeat a level that a settled hold dipped under without a refill", async () => {
  await show(credits(20, 80));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  // The hold settles for less: under half used again, so the notice no longer holds.
  await show(credits(60, 40));
  await vi.waitFor(() => expect(alert()).toBeNull());
  // The next hold passes the same levels in the same refill: nothing new to say.
  await show(credits(20, 80));
  expect(alert()).toBeNull();
  await show(credits(0, 100));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("Your credits are used up."));
});

it("keeps each Space's history under the Space its status was read for", async () => {
  await show(credits(20, 80));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  await act(async () => button("Dismiss")?.click());
  await vi.waitFor(() => expect(alert()).toBeNull());

  // Another Space at the same level in the same refill has its own history, so it is told.
  billedSpace = "space-b";
  await show(credits(20, 80));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  await act(async () => button("Dismiss")?.click());
  await vi.waitFor(() => expect(alert()).toBeNull());

  // Back in the first Space nothing was overwritten: its level is still seen.
  billedSpace = "space-a";
  await show(credits(20, 80));
  expect(alert()).toBeNull();
});

it("keeps its notice when the shell mounts again", async () => {
  await show(credits(20, 80));
  await vi.waitFor(() => expect(alert()?.textContent).toContain("80% of your credits are used."));
  // The shell can unmount and mount again (a Space switch); the level is already seen, so the
  // notice must stay rather than vanish for good.
  await act(async () => root.render(<Toaster />));
  const fromNewShell = vi.fn();
  probeAction = fromNewShell;
  await show(credits(20, 80));
  expect(alert()?.textContent).toContain("80% of your credits are used.");
  // Its button opens billing through the shell that is mounted now, not the one that is gone.
  await act(async () => button("Add credits")?.click());
  expect(fromNewShell).toHaveBeenCalledTimes(1);
  expect(onAddCredits).not.toHaveBeenCalled();
});
