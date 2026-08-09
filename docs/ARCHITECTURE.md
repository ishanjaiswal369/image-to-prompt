# Architecture

Image-to-Prompt is a Chrome extension (Manifest V3) + a Fastify/TypeScript backend. A user
right-clicks an image (or selects a screen region), the backend calls a vision LLM, and
returns a structured, multi-language prompt. Credits gate usage via an event-sourced ledger.
Payment processing is out of scope for this phase (see the build spec's Non-Goals).

## Components

```
extension (MV3, in-page floating card) --HTTPS--> backend (Fastify) --HTTPS--> Postgres 16
                                                            \--HTTPS--> Gemini (flash-tier model)
```

- **extension/**: background service worker (context menu + screenshot capture),
  a programmatically-injected region-selection toggle pill, and a draggable
  in-page floating card (React) for sign-in/analyze/results/history — see
  "UI surface" below for why this replaced the side panel.
- **backend/**: Fastify + Prisma + Postgres. Google-OAuth-derived JWT auth, an
  event-sourced credit ledger, a pluggable vision-provider adapter, rate limiting,
  and structured JSON logging.

## UI surface: in-page floating card, not the side panel

The spec originally called for `chrome.sidePanel` over a popup, specifically because
a popup closes on focus loss mid-request. The build started that way. At the user's
explicit request, partway through, this was replaced with an in-page floating card
(draggable, collapsible, closable — `content/floatingCard.ts` + `floatingcard/`)
that behaves like the reference competitor product they pointed to, while keeping
the same non-goal the side panel was chosen for: it's DOM state on the page, not a
special Chrome UI surface, so it does **not** close on focus loss either.

Mechanically: `content/floatingCard.ts` is a small, dependency-free content script
(injected via `chrome.scripting.executeScript`'s `func` option, same technique as
the region-select pill) that builds the draggable/collapsible/closable *outer*
chrome, then embeds an `<iframe>` pointing at `floatingcard/index.html` — a real
extension page. Because it's an extension-origin page, it has full `chrome.*` API
access (storage, identity, runtime messaging) exactly like the old side panel did,
so almost none of the React app itself needed to change — it just moved from
`extension/src/sidepanel/` to `extension/src/floatingcard/`. Drag tracking is
handled by the *outer* vanilla-JS chrome, not inside the iframe: mouse events stop
reaching an iframe once the cursor leaves its bounds mid-drag, which would break
dragging on a fast pointer move if handled from inside.

This did add a real, new permission-adjacent surface worth being explicit about:
`manifest.json` now declares `web_accessible_resources` for `floatingcard/index.html`
with `matches: ["<all_urls>"]`. This is **not** `host_permissions` — it doesn't grant
the extension script access to any page — but it does mean any web page (if it knows
this extension's ID, which is discoverable) can request that specific extension page
be loaded in an iframe. The page itself only renders UI gated on the user's own auth
tokens and doesn't expose secrets, so the exposure is low, but this is a real
Chrome Web Store review-relevant declaration and should be flagged as such alongside
the `host_permissions` discussion in any store listing.

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
trust cost) that `<all_urls>` carries under current Chrome Web Store policy. (See
"UI surface" above, though, for the `web_accessible_resources` tradeoff that the
floating card did introduce.)

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
`identity` permission. See `extension/src/floatingcard/api/googleAuth.ts`.

## Vision provider: swappable by config

`backend/src/services/vision/provider.ts` defines the `VisionProvider` interface.
`backend/src/services/vision/gemini.ts` implements it against Gemini via a direct
REST call (not the SDK, to avoid an extra dependency) with
`responseMimeType: "application/json"` and an explicit `responseSchema`, so the
model's output parses directly into `resultsByLanguage`. The specific model is set
by `GEMINI_MODEL` (default `gemini-flash-latest`, Google's floating alias for their
current recommended flash-tier model) — Google periodically retires specific
dated/versioned model names for new API keys (e.g. `gemini-2.5-flash` returned 404
"no longer available to new users" during testing even though it's still visible
in the models list for older projects), so pinning to a specific version here would
rot; the alias avoids that.
`backend/src/services/vision/index.ts` is a two-branch factory keyed on the
`VISION_PROVIDER` env var (`gemini` | `openrouter`) — adding GPT-4o/5.4 or Claude
vision later means adding a new file implementing `VisionProvider` and one more
`case` in that switch, not a rewrite of `/analyze`. Both providers' prompt content
(instructions, per-field descriptions) is shared from `promptSpec.ts` so output
quality can't silently drift between them.

### OpenRouter provider, and why not Nemotron's other models

`backend/src/services/vision/openrouter.ts` implements `VisionProvider` against
OpenRouter's OpenAI-compatible `chat/completions` endpoint, at the user's request
to support free-tier models. Two things worth recording since they weren't obvious
without checking OpenRouter's and NVIDIA's model catalogs directly:

- **NVIDIA's Nemotron line is not a drop-in Gemini/GPT-4o-vision replacement.**
  Most Nemotron models are text-only. The one image-capable Nemotron model
  findable via a plain "nemotron" search on OpenRouter is
  `nemotron-3.5-content-safety` — a moderation/guardrail classifier (safe/unsafe
  labels), not a captioning model. The model actually used here,
  **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`**, only surfaced by
  filtering OpenRouter's catalog for free models with image input + text output —
  it didn't come up in a name search. Confirmed free ($0/M input and output
  tokens) and general-purpose (text/image/video/audio in, text out) as of
  verification during this build.
- **Structured outputs aren't guaranteed on free-tier endpoints.** OpenRouter's
  `response_format: {type: "json_schema", strict: true}` is only honored by
  models/endpoints that declare support for it, and that's less consistent among
  free models. `openrouter.ts` still requests it (free where supported), but
  parsing tolerates a model that ignores it and wraps its JSON in prose or a
  markdown code fence anyway (`extractJsonText`) — unlike the Gemini provider,
  which can rely on `responseSchema` being strictly enforced.
- **No per-request cost accounting for this provider.** `costUsd` is hardcoded to
  `0`, correct for the free model this defaults to; a paid OpenRouter model would
  need real pricing lookups added, which isn't implemented.

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
