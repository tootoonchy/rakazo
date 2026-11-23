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
| `COMPUTER_USAGE_BILLING`     | What pays for computer time. `credits` takes the time of organizations that run on credits from those credits, at the real hourly cost times `COST_MARKUP`. Organizations on their own key keep their plan's allowance. | `allowance`: every plan includes computer time, as upstream |

- **A client can have its own daily cap.** `POST /api/v1/service/credits` with `daily_cap_cents`
  sets it for one Space's organization; `null` returns it to `DAILY_CREDIT_CAP_CENTS`. The change
  is written to the billing audit journal. `GET` on the same path shows the cap in force and what
  the day has taken so far.
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
  project: real cost, credits taken, and credits granted from payments that month. Computer time
  is reported beside the model calls (`computer_cost_usd`, `computer_charged_usd`), and so is
  what paid services took (`services_charged_usd`).
- **Computer time from credits.** With `COMPUTER_USAGE_BILLING=credits`, a run that starts for
  an organization on credits carries its hourly rate (upstream's rates: $0.05, $0.10 or $0.20
  an hour by size, $0.20 for a provider that does not report a size). Its time is taken at each
  idle check and when it ends, each stretch once, through the same ledger as model calls: the
  daily cap counts it and the audit journal records it. A computer in constant use is checked
  when it reaches its running limit (two hours unless `COMPUTER_MAX_ACTIVE_MS` says otherwise),
  so one charge can cover that long. With nothing left, or at the day's cap,
  a computer does not start and a running one is saved and stopped. The stretch that used up
  the last credits is still taken in full, so the balance can end below zero by that much. Time
  that could not be taken at all is written to the journal as `computer_time_unpaid`. A computer
  already running when the setting is turned on is charged from then on, not for before.
- **Paid services follow the markup.** Services a bot pays for are charged at `COST_MARKUP`
  when it is set, instead of their own fixed markup. Connector calls that cost nothing are not
  charged.
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
- **Computer rates are upstream's constants**, not what the computer provider really bills.
  They are the cost that `COST_MARKUP` multiplies, so check them against the provider's invoice.
- **Own-key computer time past the allowance** is refused, not charged: only organizations on
  credits have their computer time taken from credits.
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
