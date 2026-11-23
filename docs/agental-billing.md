# Billing for the Agental white-label

Upstream sells credits at cost: a dollar paid is a dollar of credits, and a model call takes
exactly what the provider charged. A hosted deployment that must never sell below cost needs
three things more. This page says which are built, how they are set, and what is still missing.

## Built

| Setting                      | Effect                                                                                                                                                                                                                                                   | Unset                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `COST_MARKUP`                | Credits taken per dollar of real cost, on the deployment's own key. `2` takes two dollars of credits for each dollar the provider reports. Applied when credits are held before a call and when the call is settled, so a hold always covers the charge. | `1`: at cost, as upstream  |
| `MONTHLY_PLATFORM_FEE_CENTS` | The part of each monthly plan payment that is the deployment's fee, not credits. `5000` turns a $200 monthly payment into $150 of credits. A one-time top-up carries no fee.                                                                             | `0`: every cent is credits |
| `DAILY_CREDIT_CAP_CENTS`     | The most credits one organization's work may take in a UTC day, whatever its balance. `2000` stops new work after $20 of credits in a day. Open holds count, so work in flight cannot overshoot it.                                                      | No daily cap, as upstream  |

- **A client can have its own daily cap.** `POST /api/v1/service/credits` with `daily_cap_cents`
  sets it for one Space's organization; `null` returns it to `DAILY_CREDIT_CAP_CENTS`. The change
  is written to the billing audit journal. `GET` on the same path shows the cap in force and what
  the day has taken so far.
- **Usage alerts, in the app only.** A member is told once when their organization has used
  50%, 80% and all of its credits: what work took since credits were last added, measured
  against that plus what is left. Adding credits starts the count again, also for someone who
  was away when they were added. The app reads the balance again whenever the server signals
  that runs changed, so a level reached while the app stays open is announced then. An owner is offered
  the billing settings from the alert. The service API reports the same level as `alert_level`
  on `GET /api/v1/service/credits`. No email is sent.
- **Real cost stays recorded.** `usage_records.costUsd` is still what the provider charged (for
  the hosted model provider, the cost it reports per generation). What was taken is in
  `model_credit_entries`. The two can be compared per organization.
- **Fail closed.** This is upstream behavior and the markup does not weaken it: credits are held
  before each model call, and a call whose hold the balance cannot cover does not start. At zero
  nothing starts. A call already admitted finishes, so a balance can end slightly below zero by
  the difference between a call's estimate and its real cost.
- **A person's own key is never charged credits.** Calls on a key the person connected are not
  metered against credits at all (upstream behavior).
- **Report.** `GET /api/v1/service/usage?month=YYYY-MM` on the service API gives, per provisioned
  project: real cost, credits taken, and credits granted from payments that month.
- **A bad value stops work.** A `COST_MARKUP` that is not a number from 1 to 10 raises an error
  instead of quietly charging at cost.

Do not combine `COST_MARKUP` with `MODEL_CREDIT_OFFERINGS` tariffs: a tariff already replaces the
recorded cost with a customer price, and the markup would be applied on top of it.

## The two plans, and how far configuration gets

| Plan                   | Wanted                                                                         | Today                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator, $200 a month | $50 fee and 15,000 credits (1 credit = $0.01, so $150) on the deployment's key | The $200 monthly credit plan with `MONTHLY_PLATFORM_FEE_CENTS=5000` grants $150 of credits, spent at `COST_MARKUP`. The balance is shown in dollars, not in credits. |
| Own key, $99 a month   | The person's own key; only computer minutes metered                            | The existing $99 own-key tier. Calls on the person's key are not charged.                                                                                            |
| Yearly                 | 10 times the monthly price                                                     | Own-key tiers have a yearly price, set in code at a 20% saving. Credit plans are monthly only.                                                                       |

## Not built yet

- **Plan names and prices are code**, in `packages/contracts/src/billing/billing.ts`. Offering
  exactly the two plans above, with yearly at 10 times monthly for both, needs those constants
  and the plan screens changed, and a yearly credit plan added.
- **Computer time is an allowance, not metered.** Each plan includes a fixed dollar amount of
  computer time at fixed hourly rates; nothing is taken from credits and nothing is charged past
  the allowance. Metering computer minutes at the markup is new work.
- **Connector fees** are not metered. Paid services bots buy already carry their own fixed
  markup.
- **No alerts.** Warnings at 50, 80 and 100 percent of a client's credits do not exist.
- **Top-up prompt.** Running out of credits sends the person to model connections, not to a
  top-up screen.
- **Cheap models by default, premium by opt-in.** The deployment's default model is a setting,
  but there is no per-plan restriction on which models a client may pick.
- **Copy.** The plan screens still say credits go to model usage at provider cost, which is not
  true once a markup or a fee is set. That copy must change before either is switched on for
  customers.

## Tested

A database test (`model-credits.postgres.test.ts`) funds an account with $10, sets a 2x markup,
and checks: a call that may cost $3 holds $6; settling it at a real cost of $2 takes $4; the
remaining $6 covers $3 of real cost and not $3.01; and at a zero balance a one-cent call is
refused. Unit tests cover the markup arithmetic, the paid-services exception, bad values, and the
platform fee on monthly payments and top-ups.
