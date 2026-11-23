# Proposal: the operator board inside the project page

Status: proposal only. Nothing in this document is built.

## What is wanted

A project's owner works in two places today. The project page on the hub (the site that owns the
projects) has the plan, the decisions and an Operator tab. The operator (this server) has the
Space where the bots work: the ticket board, the chats, the approvals. The Operator tab lists the
tickets the hub sent and offers "Open operator workspace", which signs the person in with a
one-time link and opens the Space in the same tab.

The wish is to see and use the operator's board without leaving the project page.

## Why it is not a one-line frame

Putting the operator in an `<iframe>` on the project page runs into three things at once:

1. **The session cookie is a third-party cookie there.** The hub and the operator are on
   different sites. Browsers block or partition third-party cookies by default (Safari and
   Firefox always, Chrome for a growing share of people), so the frame loads signed out even
   right after a successful sign-in.
2. **The operator refuses to be framed.** Like most apps it should send
   `Content-Security-Policy: frame-ancestors 'none'` (or the older `X-Frame-Options`), which is
   what stops another site from drawing it under a fake button. Allowing a frame means naming
   exactly which origin may do it.
3. **Sign-in inside a frame cannot use the top-level redirect** the one-time link relies on, so
   the single sign-on step needs its own path.

Each option below is a different answer to those three.

## Options

### A. Draw the board on the hub from the service API

The hub already talks to the operator server to server (`/api/v1/service/*`, bearer secret) and
already receives signed ticket events. Add one read, "list the Space's tickets with status,
assignee and last comments", and draw a board on the project page with the hub's own components.
Actions that are safe to proxy (comment, approve, move) can be added one at a time as service
calls made on the owner's behalf.

- **Auth:** none in the browser. The hub's server calls the operator with the service secret,
  after its own check that the person owns the project. No cookie crosses sites.
- **For:** works in every browser; no framing, so no clickjacking surface; the page keeps one
  look; realtime already exists (ticket events).
- **Against:** it is a second board to maintain; anything not proxied (chat with a bot, the
  bot's computer, files) still needs the full workspace; each new action is a new service call.
- **Size:** small for read-only (one endpoint, one component). Medium with comment and approve.

### B. Frame the operator with an embed pass

Add an embed mode to the operator: a route that accepts a short-lived signed pass from the hub
(like the existing one-time sign-in pass), opens a session that works inside a frame, and
renders only the board. Allow framing from the hub's exact origin.

- **Auth:** two ways to hold the session in a frame. (1) A partitioned cookie
  (`SameSite=None; Secure; Partitioned`), which browsers keep per top-level site. Support
  differs between browsers and must be checked on current Safari and Firefox before relying on
  it. (2) No cookie at all: the frame keeps a bearer token in memory and sends it as a header;
  every reload asks the hub for a fresh pass. The second is more work in the web client but does
  not depend on cookie rules.
- **Must also do:** `frame-ancestors` set to the hub's origin only, never a wildcard; the pass
  bound to one Space and one person, single use, about a minute; state-changing requests in
  embed mode checked against the embedding origin; a visible "open in full" link.
- **For:** the real board, with everything on it, and no duplicate UI.
- **Against:** the largest change to upstream code (auth, routing, a layout without the shell),
  so the most to carry through every upstream sync; a framed app that can approve actions is
  exactly what clickjacking targets, so mistakes here are costly.
- **Size:** large.

### C. Put both under one site, then frame

If the operator is served from a subdomain of the hub's own domain, the two are the same *site*
as far as cookies go. A normal `SameSite=Lax` session cookie is then sent inside the frame, and
the existing one-time sign-in works unchanged.

- **Auth:** the existing session. The one-time link signs the person in at the top level once;
  the frame then has the cookie.
- **Must also do:** `frame-ancestors` for the hub's origin; decide whether the frame shows the
  whole app or a board-only view (a small route and layout change).
- **For:** the least code; the real board; no special cookie handling.
- **Against:** needs a DNS record and a custom domain on the operator, which is an owner
  decision and outside this work; ties the two deployments to one registrable domain.
- **Size:** small once the domain exists.

### D. Proxy the operator under a path on the hub

Serve the operator through the hub's own origin (`/operator/...`).

- **Against:** the hub's hosting would have to pass through long-lived streams and file
  transfers, every absolute path in the operator's web app would need a base path, and the
  operator's cookies would live on the hub's origin. Not recommended.

### E. Keep the link, make it better

Stay with "Open operator workspace", but open it in a new tab, and land on the board with the
project's tickets filtered.

- **For:** nothing new to secure. **Against:** it is still two places.
- **Size:** very small.

## Comparison

| | Works in all browsers | New auth surface | Duplicate UI | Upstream changes to carry | Needs DNS |
| --- | --- | --- | --- | --- | --- |
| A. Board from the service API | Yes | None | Yes (a board) | One endpoint | No |
| B. Frame with an embed pass | Depends on the session choice | Large | No | Many | No |
| C. One site, then frame | Yes | Small | No | Few | Yes |
| D. Proxy under a path | Yes | Medium | No | Many | No |
| E. Better link | Yes | None | No | None | No |

## Recommendation

1. **Now: A, read-only**, plus E. The owner sees the whole board on the project page and opens
   the workspace when they need to act. It adds no way into the operator that does not exist
   today.
2. **When the operator gets its final address: C**, if that address can be a subdomain of the
   hub's domain. It gives the real board for little code.
3. **B only if** the two can never share a domain and a read-only board proves not enough.

## Open questions

- Will the operator's final address be under the hub's domain? That decides between C and B.
- Which actions does an owner need without leaving the page: comment, approve, move, or only
  read?
- Should admins of the hub see a client's board there too, and with what rights?
