# Deploying the Agental white-label

One deployment serves every client. A client's project is an organization with its own Space;
nothing is deployed per client.

## Shape

| Piece | What it is |
|---|---|
| App service | The repository's Railway image (`railway.json`, `infra/railway/Dockerfile`): API, worker and web in one container, migrating the database when it starts. |
| Postgres | A database service of its own in the same Railway project, used by nothing else. |
| Bot computers | A hosted sandbox provider, chosen with `SANDBOX_PROVIDER` and that provider's own variables (see `docs/self-host-sandbox-providers.md`). |
| Project hub | The system that owns the projects. It calls the service API here, and ticket changes are reported back to it. |

The API and the worker can be split into services of their own later (same image, different
start command) when one container is no longer enough; `RAILWAY_SERVICES` in the deploy workflow
lists the services to deploy. The single-service layout is the one upstream ships and tests, so
it is the starting point.

## Environments

Two Railway environments, `staging` and `production`, each with its own database. The deploy
workflow ([`agental-deploy.yml`](../.github/workflows/agental-deploy.yml)) deploys `staging` on
every push to `agental-whitelabel`. `production` runs only when started by hand, and the
`production` environment in this repository's settings must require a reviewer.

Per GitHub environment: the secret `RAILWAY_TOKEN` (a Railway project token scoped to that
Railway environment) and, optionally, the variable `RAILWAY_SERVICES` (a JSON list, default
`["app"]`).

## Variables (names only)

Set on the Railway service. Values are never committed.

| Name | For |
|---|---|
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | The runtime login and the owner login (see `docs/self-host-configuration.md#database-roles`) |
| `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` | Sessions and stored secrets. Keep both stable. |
| `BETTER_AUTH_URL`, `WEB_ORIGIN`, `API_URL` | The public address |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | The operator's own account, created on first start |
| `SIGNUPS_ENABLED` | Leave closed: clients arrive only through provisioning |
| `TICKET_BOARD_ENABLED` | `true`, so every Space has its board |
| `SERVICE_API_SECRET` | The service API (provisioning, sign-in links, tickets, notes) |
| `PROJECT_HUB_URL`, `PROJECT_HUB_SECRET` | Where ticket changes are reported, and the signing secret |
| `SANDBOX_PROVIDER` and the provider's variables | Bot computers |
| The model provider's key | The deployment's default model connection |
| The integration provider's variables | Clients connecting their own apps (see `docs/self-host-integrations.md`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing (see `docs/self-host-billing.md`) |

`RAKAZO_BRAND` is left unset: unset is the white-label.

## The service API

Server to server, every call with `Authorization: Bearer <SERVICE_API_SECRET>`. Each call is
safe to repeat. Without the secret the routes do not exist.

| Call | Does |
|---|---|
| `POST /api/v1/service/spaces` | `{ external_project_id, project_type, email, name?, project_name, plan? }`. Makes the organization and Space, the Operator, Leads and Content bots (asking before they act), the board, and the project type's starter routines, paused. Answers `{ space_id, user_id, created, bots, sign_in_url }`. |
| `POST /api/v1/service/sign-in-links` | `{ space_id, email }` for a member of the Space. Answers a link that signs that person in and opens the Space. It works once and for one minute. |
| `POST /api/v1/service/tickets` | `{ space_id, external_id, title, description?, assignee? }`. Puts a ticket on the board for a bot (`operator`, `leads` or `content`), which is woken as for any ticket. |
| `GET /api/v1/service/tickets` | `?space_id=&external_id=`: where the ticket stands. |
| `POST /api/v1/service/memory` | `{ space_id, path, content }`: a note every bot in the Space can read, for decisions made in the hub. |

## Ticket changes

When a ticket the hub created changes, the hub is sent `{ type: "ticket.updated", space_id,
external_id, ref, title, status, assignee, updated_at, completed_at, comments }` with the header
`X-Agental-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`. Delivery is
tried a few times and never holds up the ticket change; the hub can always read the current
state with `GET /api/v1/service/tickets`.

## Not done here

- Nothing has been deployed with this document: the workflow and the variables above have not
  been run against Railway.
- Splitting the API and the worker into separate services is described, not set up.
