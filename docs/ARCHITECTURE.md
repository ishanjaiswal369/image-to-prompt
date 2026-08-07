# Architecture

Image-to-Prompt is a Chrome extension (Manifest V3) + a Fastify/TypeScript backend. A user
right-clicks an image (or selects a screen region), the backend calls a vision LLM, and
returns a structured, multi-language prompt. Credits gate usage via an event-sourced ledger.
Payment processing is out of scope for this phase (see the build spec's Non-Goals).

## Components

```
extension (MV3, React side panel) --HTTPS--> backend (Fastify) --HTTPS--> Postgres 16
                                                        \--HTTPS--> Gemini 2.5 Flash
```

- **extension/**: background service worker (context menu + screenshot capture),
  a programmatically-injected region-selection overlay, and a React side panel UI.
- **backend/**: Fastify + Prisma + Postgres. Google-OAuth-derived JWT auth, an
  event-sourced credit ledger, a pluggable vision-provider adapter, rate limiting,
  and structured JSON logging.

## host_permissions justification (required for the eventual Chrome Web Store listing)

The manifest declares **no `host_permissions` at all** — not even a narrow one, and
certainly not `<all_urls>`:

- The right-click-image flow only needs the clicked image's `srcUrl`, which Chrome
  hands to the `contextMenus.onClicked` listener directly. The backend fetches that
  URL server-side (see `fetchImageAsBuffer` in `backend/src/lib/imageFetch.ts`), so
  the extension itself never needs host access to the page or the image's origin.
- The screen-region-selection flow injects its overlay via
  `chrome.scripting.executeScript` scoped to `activeTab` — a temporary, per-tab
  grant that only applies for the duration of a user-initiated action (clicking the
  toolbar icon). No standing access to any site is ever held.

This satisfies "any image, any site" without the broader review scrutiny (and user
trust cost) that `<all_urls>` carries under current Chrome Web Store policy.

Two permissions were added beyond the spec's original list, because the flows it
describes don't work without them:
- **`identity`** — required by `chrome.identity.*` (both `getAuthToken` and
  `launchWebAuthFlow`).
- **`scripting`** — required by `chrome.scripting.executeScript`, which the
  region-selection flow depends on.

## Auth: chrome.identity.launchWebAuthFlow, not getAuthToken

The spec named `chrome.identity.getAuthToken`, but that call only ever returns an
OAuth **access** token — never an OIDC **ID** token. The spec's backend design
explicitly verifies a Google **ID token** (`google-auth-library`'s audience-checked
`verifyIdToken`), which is the more standard, more secure pattern (it doesn't require
the backend to make an extra round-trip to Google's userinfo endpoint per request).

To get an actual ID token from the same `chrome.identity` namespace, the extension
uses `chrome.identity.launchWebAuthFlow` with `response_type=id_token` against
Google's OAuth endpoint, using the same manifest `oauth2.client_id` and the same
`identity` permission. See `extension/src/sidepanel/api/googleAuth.ts`.

## Vision provider: swappable by config

`backend/src/services/vision/provider.ts` defines the `VisionProvider` interface.
`backend/src/services/vision/gemini.ts` implements it against Gemini 2.5 Flash via a
direct REST call (not the SDK, to avoid an extra dependency) with
`responseMimeType: "application/json"` and an explicit `responseSchema`, so the
model's output parses directly into `resultsByLanguage`.
`backend/src/services/vision/index.ts` is a one-branch factory keyed on the
`VISION_PROVIDER` env var — adding GPT-4o/5.4 or Claude vision later means adding a
new file implementing `VisionProvider` and one more `case` in that switch, not a
rewrite of `/analyze`.

## Credit ledger: correctness details not obvious from the schema

The ledger is event-sourced (`CreditLedgerEntry`, append-only) rather than a mutable
`balance` column — auditable, and a future Stripe "credits purchased" webhook is a
pure insert with no migration.

Deriving balance from `SUM(delta)` is race-vulnerable on its own: two concurrent
`/analyze` calls from the same user could both read the same balance before either
commits, both pass the check, and the balance would go negative. `backend/src/lib/ledger.ts`
takes a Postgres session advisory lock keyed on the user
(`pg_advisory_xact_lock(hashtext(userId))`) as the first statement inside every
debit/refund/grant transaction. It's scoped to that transaction (released automatically
on commit/rollback), so it serializes a single user's debits without locking the whole
ledger table or blocking other users. This is covered by `backend/test/ledger.test.ts`,
including a concurrent-debit test that asserts the balance never goes negative.

`idempotencyKey` is globally unique; a retried `/analyze` call with the same key
either replays the existing succeeded result (no re-debit) or, if the prior attempt
never completed (process died mid-flight while `status = "pending"`), resumes that
same request rather than debiting again.

## Known deferred tradeoffs (consistent with the spec's "payment deferred" posture)

- **Refresh tokens are stateless JWTs**, not a DB-backed table — the spec's Prisma
  schema sketch has no `RefreshToken` model. This means there's no server-side
  revocation yet (a compromised refresh token is valid until it expires). Adding
  revocation later means adding a `RefreshToken` table and is a pure addition, not
  a rewrite of the auth routes.
- **Rate limiting is in-memory** (a per-user token bucket map, plus
  `@fastify/rate-limit` for the global cap) — correct for the single-container
  deployment this phase targets (no Redis/infra beyond Docker per the spec's
  Non-Goals). Swap the per-user bucket for a Redis-backed store if this is ever
  horizontally scaled.
- **No extension icons yet** — the manifest omits `icons` for now; real artwork is
  needed before a Chrome Web Store submission.

## Non-goals reminder

No Stripe/payment processing. `POST /admin/credits/grant` (dev-only, `x-admin-token`
gated) stands in for what will later be a Stripe webhook handler — its
`{userId, amount, reason}` shape mirrors what that handler will eventually call
internally, so wiring up real payments later is additive.
