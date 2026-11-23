// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { Trans, useLingui } from "@lingui/react/macro";
import type { CreditAlertLevel } from "@rakazo/contracts";
import { creditAlertLevel, modelCreditsUsd } from "@rakazo/contracts";
import { Button, toast } from "@rakazo/ui-web";
import { useEffect, useRef } from "react";
import { useBilling } from "./SubscriptionGate";

const TOAST_ID = "credit-alert";
/**
 * What was last seen per Space: a mark of the refill it belonged to and the level reached, so a
 * level is announced once per refill, also for someone who was away while credits were added.
 */
export const CREDIT_ALERT_KEY = "rakazo.creditAlert";

type Seen = { refill: string; level: number };

/**
 * A short fingerprint of when credits were last added. It is all the browser keeps to tell one
 * refill from the next: billing data itself is not written to its storage.
 */
function refillMark(addedAt: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < addedAt.length; index++) {
    hash ^= addedAt.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// Storage that cannot be read or written still announces each level once per page load.
const seenThisSession = new Map<string, Seen>();

function lastSeen(key: string): Seen | undefined {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const cut = stored.lastIndexOf("|");
      return { refill: stored.slice(0, cut), level: Number(stored.slice(cut + 1)) || 0 };
    }
  } catch {}
  return seenThisSession.get(key);
}

function remember(key: string, seen: Seen) {
  seenThisSession.set(key, seen);
  try {
    localStorage.setItem(key, `${seen.refill}|${seen.level}`);
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
  // The Space the status was read for: another tab can select a different one at any time.
  const { status, spaceId } = useBilling();
  const level = creditAlertLevel(modelCreditsUsd(status), status?.creditsUsedUsd ?? 0) ?? 0;
  const refill = refillMark(status?.creditsAddedAt ?? "");
  const canAdd = Boolean(status?.canManage && status.creditPurchasesEnabled);
  const addCredits = useRef(onAddCredits);
  addCredits.current = onAddCredits;
  // What the open notice says, so one that stopped being true is taken down.
  const open = useRef<string | null>(null);
  useEffect(() => {
    // No status yet says nothing about the level, so it must not reset what was seen.
    if (!status) return;
    const key = `${CREDIT_ALERT_KEY}.${spaceId ?? ""}`;
    const seen = lastSeen(key);
    // A level seen in an earlier refill says nothing about this one. Within a refill the highest
    // level stays seen: a hold that settles for less can dip under a level without credits
    // having been added, and passing it again is not news.
    const before = seen?.refill === refill ? seen.level : 0;
    if (seen?.refill !== refill || level > before)
      remember(key, { refill, level: Math.max(before, level) });
    const about = `${key}|${refill}|${level}`;
    const announce = level > before;
    // Another Space, a refill, or a level that no longer holds: the open notice is out of date.
    if (open.current !== null && open.current !== about && !announce) {
      toast.dismiss(TOAST_ID);
      open.current = null;
    }
    if (!announce) return;
    open.current = about;
    toast.custom(
      () => (
        <CreditAlert
          level={level as CreditAlertLevel}
          onAddCredits={canAdd ? () => addCredits.current() : undefined}
        />
      ),
      {
        id: TOAST_ID,
        // The default bottom-right corner covers the composer.
        position: "top-right",
        duration: Number.POSITIVE_INFINITY,
        onDismiss: () => {
          if (open.current === about) open.current = null;
        },
      },
    );
  }, [status, spaceId, level, refill, canAdd]);
  // When the app gives way to the paywall (nothing left and no plan), that screen is the notice:
  // an earlier one must not stay on top of it.
  useEffect(
    () => () => {
      if (open.current !== null) toast.dismiss(TOAST_ID);
    },
    [],
  );
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
