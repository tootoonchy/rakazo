// @vitest-environment jsdom
// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import type { BillingStatus } from "@rakazo/contracts";
import { MODEL_CREDITS_EXHAUSTED_ERROR } from "@rakazo/core";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerError } from "./composer-error";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
}));
vi.mock("@rakazo/i18n/run-error", () => ({ translateRunError: (text: string) => text }));

let billing: BillingStatus | null = null;
vi.mock("../../../components/billing/SubscriptionGate", () => ({
  useBilling: () => ({ status: billing, showPlans: () => undefined }),
}));

const onOpenBilling = vi.fn();
const onOpenConnections = vi.fn();

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  onOpenBilling.mockClear();
  onOpenConnections.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function showOutOfCredits(status: Partial<BillingStatus>) {
  billing = status as BillingStatus;
  await act(async () =>
    root.render(
      <ComposerError
        sendError={null}
        runError={MODEL_CREDITS_EXHAUSTED_ERROR}
        runErrorId="run-1"
        onRunErrorPresented={() => undefined}
        onOpenModels={() => undefined}
        onOpenConnections={onOpenConnections}
        onOpenBilling={onOpenBilling}
        onDismissError={() => undefined}
        textareaRef={createRef()}
      />,
    ),
  );
}

const action = (name: string) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent === name);

it("sends an owner who can buy credits to top up when credits run out", async () => {
  await showOutOfCredits({ canManage: true, creditPurchasesEnabled: true });
  await act(async () => action("Top up to continue")?.click());
  expect(onOpenBilling).toHaveBeenCalledTimes(1);
  expect(action("Connect a model")).toBeUndefined();
});

it("keeps the model connection for a member who cannot buy credits", async () => {
  await showOutOfCredits({ canManage: false, creditPurchasesEnabled: true });
  expect(action("Top up to continue")).toBeUndefined();
  await act(async () => action("Connect a model")?.click());
  expect(onOpenConnections).toHaveBeenCalledTimes(1);
});
