// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { Trans, useLingui } from "@lingui/react/macro";
import type { CreditAlertLevel } from "@rakazo/contracts";
import { creditAlertLevel, modelCreditsUsd } from "@rakazo/contracts";
import { Button, toast } from "@rakazo/ui-web";
import { useEffect, useRef } from "react";
import { selectedSpaceId } from "../../lib/query/rpc";
import { useBilling } from "./SubscriptionGate";

const TOAST_ID = "credit-alert";
/** The level last seen per Space, so a level is announced once and again only after a refill. */
export const CREDIT_ALERT_KEY = "rakazo.creditAlert";

// Storage that cannot be read or written still announces each level once per page load.
const seenThisSession = new Map<string, number>();

function lastSeen(key: string): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return Number(stored) || 0;
  } catch {}
  return seenThisSession.get(key) ?? 0;
}

function remember(key: string, level: number) {
  seenThisSession.set(key, level);
  try {
    localStorage.setItem(key, String(level));
  } catch {}
}

export function resetCreditAlertSessionForTests() {
  seenThisSession.clear();
}

/**
 * Tells the member once when their organization has used half, most, or all of its credits.
 * `onAddCredits` opens the place to buy more; only someone who can buy is offered it.
 */
export function useCreditAlert(onAddCredits: () => void) {
  const { status } = useBilling();
  const level = creditAlertLevel(modelCreditsUsd(status), status?.creditsUsedUsd ?? 0);
  const canAdd = Boolean(status?.canManage && status.creditPurchasesEnabled);
  const addCredits = useRef(onAddCredits);
  addCredits.current = onAddCredits;
  useEffect(() => {
    // No status yet says nothing about the level, so it must not reset what was seen.
    if (!status) return;
    const key = `${CREDIT_ALERT_KEY}.${selectedSpaceId() ?? ""}`;
    const seen = lastSeen(key);
    if ((level ?? 0) === seen) return;
    remember(key, level ?? 0);
    if (level === null || level < seen) return;
    toast.custom(
      () => (
        <CreditAlert level={level} onAddCredits={canAdd ? () => addCredits.current() : undefined} />
      ),
      // The default bottom-right corner covers the composer.
      { id: TOAST_ID, position: "top-right", duration: Number.POSITIVE_INFINITY },
    );
  }, [status, level, canAdd]);
}

function CreditAlert({
  level,
  onAddCredits,
}: {
  level: CreditAlertLevel;
  onAddCredits?: () => void;
}) {
  const { t } = useLingui();
  const close = () => toast.dismiss(TOAST_ID);
  return (
    <aside
      aria-label={t`Credits`}
      data-testid="credit-alert"
      className="w-full rounded-xl border border-warning bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <p className="text-body font-medium">
        {level === 100 ? (
          <Trans>Your credits are used up.</Trans>
        ) : (
          <Trans>{level}% of your credits are used.</Trans>
        )}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          <Trans>Dismiss</Trans>
        </Button>
        {onAddCredits ? (
          <Button
            onClick={() => {
              close();
              onAddCredits();
            }}
          >
            <Trans>Add credits</Trans>
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
