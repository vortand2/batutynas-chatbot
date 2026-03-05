# Architecture Patterns: Marker-Based Chatbot with Multi-Channel Rendering

**Project:** batutynas-chatbot
**Domain:** Chatbot / booking conversion system (brownfield)
**Researched:** 2026-03-05
**Confidence:** HIGH (grounded in actual codebase + verified against industry sources)

---

## Actual System Architecture (Current State)

```
                         CLIENT LAYER
           ┌─────────────────────────────────────────┐
           │  chat-widget.js (vanilla JS, embedded)  │
           │  FB Messenger (Meta platform)           │
           └──────────────┬──────────────────────────┘
                          │ HTTP POST (webhook)
                          ▼
           ┌─────────────────────────────┐
           │        CHATWOOT             │
           │  - Conversation storage     │
           │  - Channel identity         │
           │  - Typing indicators        │
           │  - Message delivery API     │
           └──────────────┬──────────────┘
                          │ n8n webhook trigger
                          ▼
           ┌─────────────────────────────┐
           │          n8n WORKFLOW       │
           │                             │
           │  Filter + Extract           │
           │       |                     │
           │  Gemini 2.5 Flash + RAG     │
           │  (Pinecone vector search)   │
           │       |                     │
           │  Enrichment Code            │
           │  (marker to rich UI)        │
           │       |                     │
           │  POST back to Chatwoot      │
           └─────────────────────────────┘
```

### Two Distinct Enrichment Paths

The system currently maintains two separate enrichment implementations:

| Path | File | Output | Used By |
|------|------|--------|---------|
| Widget (custom webhook) | n8n-workflows/enrich-response-code.js | {{HTML}}... prefixed string | chat-widget.js via sanitizeHtml() |
| Chatwoot/Messenger | chatwoot/enrich-chatwoot.js | Array of Chatwoot message objects | Chatwoot API (cards, forms, input_select) |

Key difference: The widget path produces raw HTML that the client-side sanitizeHtml() scrubs. The Chatwoot path produces structured API objects (content_type: cards, form, input_select, text) that Chatwoot renders natively. The Chatwoot enricher also reads isMessenger to toggle between web-widget-style cards and Messenger-compatible text plus quick-replies.

---

## 1. Message Enrichment and Transformation Patterns

### Current Pattern: Segment-and-Dispatch

The Chatwoot enricher (enrich-chatwoot.js) uses a segment-and-dispatch pattern rather than simple regex replacement:

```
Raw LLM text
    |
allMarkerRegex.exec() -- scan for known markers
    |
segments[] = [{type:'text',...}, {type:'marker',...}, ...]
    |
for each segment:
  - 'text'   -> push text message object
  - 'marker' -> call builder function -> push 1..N message objects
    |
allMessages[] -> formatOutput() -> HTTP calls to Chatwoot
```

This is the correct pattern. It preserves interleaved prose between markers, prevents marker-in-marker ambiguity, and allows a single LLM response to generate multiple Chatwoot messages in sequence (e.g., a text preamble, then a cards message, then a dropdown).

### Pattern: Idempotency Guard

The widget enricher already implements an idempotency guard:

```javascript
// Idempotency: skip if already enriched
if (response.startsWith('{{HTML}}')) {
  return [{ json: { enriched: response } }];
}
```

This prevents double-enrichment if n8n retries or a response loops back through. Extend this pattern to the Chatwoot path as well (check for a processed marker or a flag set on the n8n execution item).

### Recommendation: Marker Contract Versioning

The current marker vocabulary is defined in three places:
1. System prompt (tells the LLM what markers to emit)
2. Enrichment code (parses markers)
3. Widget JS (renders HTML markers)

When you add or rename a marker, all three must be updated atomically. The risk of drift is high. Mitigation: keep a single canonical MARKERS.md file listing every marker, its parameters, and which channel supports it. Treat it as a contract document reviewed before any prompt or enrichment change.

### Recommendation: Regex Safety for JSON Markers

The [BOOKING_CONFIRM:{...}] marker uses a nested-brace regex:

```javascript
/\[BOOKING_CONFIRM:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g
```

This handles one level of nesting. If Gemini ever emits a booking confirm with array values (e.g., "addons":["Dart","Rodeo"]) the regex will fail silently and fall back to an empty data object. The current buildBookingConfirm() already has a JSON.parse try/catch fallback, which is correct. Add an explicit log or alert when JSON.parse fails so you can catch AI formatting regressions in the n8n execution log.

A more robust alternative for future consideration -- emit booking data as a delimited block rather than inline JSON:

```
[BOOKING_CONFIRM]
{"date":"2026-03-15","location":"Taurage",...}
[/BOOKING_CONFIRM]
```

Then use position-based extraction + JSON.parse directly. This is more robust than regex-captured JSON but requires a prompt change, two enricher changes, and full testing.

---

## 2. Conversation State Management

### Current Approach: Chatwoot as Source of Truth

Conversation history lives in Chatwoot. n8n reads the last N messages from the Chatwoot conversation before calling Gemini. This is a sound architecture: state is durable, it survives n8n restarts, and Chatwoot's agent UI gives the business a human-readable audit trail.

### Widget-Side Session State

The widget uses localStorage keyed by batutynas_chat with a 24-hour TTL:

```javascript
{
  sessionId: 'sess_...',
  messages: [...].slice(-50),  // last 50 messages
  language: 'lt',
  timestamp: Date.now()
}
```

This is the correct pattern for an embedded widget. Key observations:
- 50-message cap prevents localStorage overflow on long conversations
- 24-hour TTL is appropriate for a booking-intent conversation
- Session IDs use crypto.getRandomValues() -- correct, not Math.random()

### Gap: Widget and Chatwoot State Can Diverge

If Chatwoot delivers a message via its own widget or if an agent manually responds, the custom widget's localStorage will not reflect it. This is an acceptable trade-off for the current architecture but should be documented as a known limitation. The fix would require polling or SSE from Chatwoot -- significant scope for minimal gain in this use case.

### Gap: Booking Flow Step Tracking is Implicit

The LLM tracks booking step progress implicitly through conversation history. There is no explicit step enum stored in state. This is fragile if:
- Gemini loses track of what step it is on (context window limitation or distraction by off-topic messages)
- A user sends an ambiguous reply that Gemini misinterprets as completing a step

Recommendation: Store the current booking step as a Chatwoot conversation attribute (custom attributes via the Chatwoot API). This makes the step machine-readable and allows n8n to inject step context directly into the Gemini prompt:

```javascript
// n8n: before calling Gemini
// GET /api/v1/accounts/{id}/conversations/{id}
// -> custom_attributes.booking_step = "awaiting_date"

// Inject into prompt:
// "Current booking step: awaiting_date. User just replied: ..."
```

This is a medium-complexity improvement that would eliminate "Gemini forgets where we are" bugs entirely.

---

## 3. Error Recovery and Fallback Patterns

### Current Fallbacks (What Already Works)

| Layer | Failure Mode | Current Fallback |
|-------|-------------|-----------------|
| Widget HTTP fetch | Network error or timeout | Retry button rendered in chat bubble |
| Widget HTTP fetch | Non-2xx response | Same retry path via .catch() |
| n8n enrichment | Empty/null LLM output | Lithuanian error string with phone number |
| n8n enrichment Chatwoot path | Empty allMessages | Hardcoded apology message (H-4 guard) |
| Booking confirm JSON | Malformed JSON | try/catch -> fallback "request received" message |
| Missing contact info | No phone/email in booking | Warning note appended to booking confirm |

### Gap: No n8n Webhook Timeout Handling

n8n webhook responses fail after 100 seconds when running behind a reverse proxy (documented n8n community issue: 524 error). Gemini calls + Pinecone RAG + enrichment can approach this under load. Mitigations ranked by effort:

Option A -- Increase proxy timeout (low effort):
- Set proxy_read_timeout 120s in nginx or Caddy
- Acceptable for a low-traffic single-business chatbot
- Start here

Option B -- Async with polling (medium complexity):
- n8n webhook immediately returns {status: "processing", jobId: "..."}
- Widget polls /status/{jobId} every 2 seconds for up to 30 seconds
- On result available, returns full response

Recommendation: Start with Option A. The widget already shows a typing indicator for the full wait duration, so UX is acceptable up to ~15 seconds. Monitor p95 latency in n8n execution logs. Only invest in Option B if p95 exceeds 60 seconds.

### Gap: No Retry Logic for Chatwoot API Calls

When enrichment sends multiple messages to Chatwoot (one text + one card + one dropdown), these are sequential HTTP calls. If any fails mid-sequence, the conversation shows partial output.

Mitigation: Use n8n's built-in HTTP Request node retry configuration (Retry on Fail: true, Max Tries: 3, Wait Between Tries: 1000ms) for all Chatwoot message sends. This is a workflow configuration change, not a code change.

### Recommended Graceful Degradation Hierarchy

```
LLM response received
    |
Contains valid markers?
  YES -> render rich UI (cards, forms, etc.)
  NO  -> render plain text
             |
         Plain text non-empty?
           YES -> send text message
           NO  -> send hardcoded fallback with phone number
```

The current code already implements this hierarchy implicitly. Document it explicitly in code comments so future developers understand the intentional degradation path.

---

## 4. Multi-Channel Rendering Architecture

### Current Pattern: Unified Enricher with Channel Flag

enrich-chatwoot.js reads isMessenger from the n8n item context and branches at the leaf render functions:

```javascript
var isMessenger = $('Filter & Extract').item.json.isMessenger || false;

// In every builder function:
if (isMessenger) {
  // return text + input_select (Messenger-compatible)
} else {
  // return cards + input_select (Chatwoot web widget)
}
```

This is a pragmatic implementation of the Adapter pattern: one enricher, channel-aware rendering at the leaf functions.

### Textbook Adapter Pattern vs Current Implementation

The textbook adapter pattern separates core logic from channel rendering entirely:

```
Core Decision Layer           Channel Adapter Layer
-------------------           ---------------------
parseMarkers()          ->    WebWidgetAdapter.render()
buildEquipmentData()    ->    MessengerAdapter.render()
                        ->    (future) WhatsAppAdapter.render()
```

Should you refactor to full adapter separation now? No. The current in-function branching is readable and the channel count is 2. Refactoring to adapter classes adds ~200 lines of boilerplate for no functional gain. The trigger to refactor is a third channel (WhatsApp Business, SMS, email digest). At that point, extract channels/web.js, channels/messenger.js, channels/whatsapp.js.

### Channel Capability Matrix

| Feature | Chatwoot Web Widget | Facebook Messenger |
|---------|--------------------|--------------------|
| Image cards with postback buttons | YES (content_type: cards) | NO -- use text + images |
| Structured form (multi-field) | YES (content_type: form) | NO -- use sequential text prompts |
| Dropdown select | YES (content_type: input_select) | YES (20-char title limit) |
| Bold/italic markdown | YES (*bold*) | NO -- renders literal asterisks |
| Typing indicator API | YES (toggle_typing_status) | Handled by Meta platform |
| Custom HTML rendering | YES (via widget sanitizeHtml) | Not applicable |

The 20-character Messenger quick reply title limit is already handled in buildMainMenu() with shorter labels for isMessenger. This is the correct place to handle it.

### Recommendation: Inject Channel Context Into Gemini Prompt

The LLM does not know whether it is talking to a Messenger user vs a web widget user. It emits the same markers regardless. Consider injecting channel context into the Gemini prompt:

```markdown
# Channel Context: Messenger
Constraints for this channel:
- No HTML forms -- ask for information one field at a time conversationally
- No image cards -- describe options as text lists with emoji
- Quick reply button labels are limited to 20 characters
```

This would allow Gemini to naturally avoid multi-field form markers on Messenger and instead ask for email/phone as conversational follow-up questions, rather than requiring the enricher to silently degrade.

---

## 5. Security Patterns for the Embedded Widget

### Current Security Implementation

The widget implements a custom HTML sanitizer (sanitizeHtml()) with an allowlist approach:

```javascript
var ALLOWED_TAGS = ['div', 'span', 'p', 'br', 'strong', 'em', 'b', 'i',
  'a', 'button', 'input', 'textarea', 'ul', 'ol', 'li',
  'h1','h2','h3','h4','h5','h6', 'img', 'label'];

var ALLOWED_ATTRS = ['class', 'data-chat-option', 'data-chat-date',
  'href', 'src', 'alt', 'style', ...];

// href/src protocol validation:
var url = new URL(attrs[j].value, window.location.href);
if (ALLOWED_PROTOCOLS.indexOf(url.protocol) === -1) {
  node.removeAttribute(attrs[j].name);
}
```

This is a sound defense-in-depth approach. The enrichment code generates the HTML server-side (in n8n), so the sanitizer is a client-side backstop against regression or injection. The {{HTML}} prefix convention is the signal to run sanitization -- do not remove this guard even if the enrichment code "seems safe."

### Gap: style Attribute Allowed Without Value Filtering

The style attribute is in ALLOWED_ATTRS. While inline style cannot execute JavaScript in modern browsers, it can be used for clickjacking via position:fixed or data exfiltration via background-image:url().

Options ranked by effort:
1. Remove style from ALLOWED_ATTRS and rely on CSS classes only. Clean fix but high effort -- the enrichment code uses inline styles extensively for background colors and spacing.
2. Add a CSS property allowlist that strips position:fixed, background-image:url(), and similar risky properties.
3. Accept current risk given the narrow attack surface (Lithuanian trampoline rental chatbot).

Recommendation: Option 3 for now. Migrate enrichment code inline styles to CSS classes incrementally over time. This also makes the enriched HTML cleaner and easier to theme.

### Gap: No Webhook Authentication

The widget POSTs to a public n8n webhook URL without any token:

```javascript
fetch(config.webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
```

The webhook URL is visible in the page source. Anyone can POST arbitrary messages to it.

Impact assessment: Acceptable for a customer-facing chatbot. The worst case is API cost from spam or an attacker extracting business info already visible on the website. It is not a data exfiltration risk.

Mitigation if abuse becomes a concern:
- Add an X-Widget-Token header (static HMAC secret configured at embed time)
- Validate the token in n8n before processing
- Rate-limit by session_id using n8n's key-value store node

### CSP Recommendations for the Host Page (batutynas.lt)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  img-src 'self' https://assets.zyrosite.com data:;
  connect-src 'self' https://{n8n-host}.com;
  style-src 'self' 'unsafe-inline';
```

unsafe-inline for styles is required by the current widget (inline style attributes). The image CDN (assets.zyrosite.com) must be explicitly allowed since all trampoline product images are served from there.

---

## 6. Performance Patterns

### Current Baseline Latency

```
User sends message
  -> Widget HTTP POST to n8n webhook         ~5ms
  -> n8n: Chatwoot history fetch             ~100ms
  -> n8n: Pinecone RAG query                 ~200-500ms
  -> n8n: Gemini 2.5 Flash generation        ~1000-3000ms (dominant)
  -> n8n: enrichment code execution          ~10ms
  -> n8n: Chatwoot API message sends         ~100-300ms (1-3 calls)
  -> Chatwoot delivers to widget             ~50ms
Total: ~1.5s - 4s typical, up to 10s under load
```

The dominant cost is Gemini generation. The widget shows a typing indicator for the full duration, which is the correct UX pattern.

### Pattern: Prompt Caching (High Impact, Low Effort)

Gemini 2.5 Flash supports context caching. The system prompt in chat-system-prompt.md is ~3,000 tokens of stable content (product catalog, rules, marker definitions). This is exactly the use case for prompt caching.

How to implement:
1. Use the Gemini API cachedContent endpoint to cache the system prompt
2. Reference the cache ID in subsequent API calls via the n8n HTTP node
3. Set TTL to 1 hour or longer (the system prompt changes at most monthly)

Expected result: 60-85% reduction in input token cost and ~30% reduction in time-to-first-token for the system prompt portion. This is the single highest-ROI optimization available to this project.

### Pattern: Response Truncation Guard

The format code (format-response-code.js) already truncates at 10,000 characters:

```javascript
if (response.length > 10000) {
  response = response.substring(0, 10000) + '...';
}
```

This is a correct safety guard. Gemini 2.5 Flash can produce verbose outputs that would cause UI rendering issues or localStorage overflow in the widget.

### Pattern: Widget Script Loading

Load the widget script with the defer attribute so it does not block page rendering:

```html
<script src="/chat-widget.js" defer></script>
```

For further optimization, initialize the widget only on first user interaction (click/scroll) rather than immediately on DOMContentLoaded. This avoids consuming session storage and rendering budget before the user has expressed intent to chat.

### Pattern: Semantic Caching (Deferred)

For FAQ-type queries ("Kokia kaina?", "Ar pristatote i Kauna?"), responses are essentially deterministic. A semantic cache (embedding-based similarity lookup via Pinecone or Redis) could serve cached responses for near-duplicate queries with sub-50ms latency vs. 1-3s for a full Gemini call.

Given current traffic volume (single business chatbot), this is premature optimization. Revisit if Gemini API costs become significant or if peak-hour queuing causes noticeable delays.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Business Logic Encoded Only in System Prompt

What it is: Keeping the full product catalog (all 25+ trampolines, prices, capacities) exclusively in the system prompt text.

Why bad: Every catalog update requires a prompt edit, re-test, and workflow redeploy. Data that changes is better kept in Pinecone and fetched via RAG.

Current state: The system prompt contains the full catalog. This is an acceptable trade-off for a small, stable catalog. The trigger to move it to Pinecone-only is when catalog updates happen more than once a month.

### Anti-Pattern 2: Rendering AI-Generated HTML Without Sanitization

What it is: Taking LLM output and assigning it to innerHTML directly.

Why bad: LLMs can hallucinate HTML including script tags or javascript: hrefs.

Current state: The widget's sanitizeHtml() function prevents this correctly. The {{HTML}} prefix is the signal to run sanitization. Do not remove the sanitizer even if the enrichment code seems safe -- defense in depth matters.

### Anti-Pattern 3: Storing Authoritative State Only in localStorage

What it is: Relying on the widget's localStorage for conversation continuity without any server-side record.

Why bad: localStorage is cleared by privacy-focused browsers, incognito mode, and manual browser history clearing. A booking inquiry in incognito gets no history.

Current state: Chatwoot is the authoritative state store. localStorage is a client-side display cache only. This is the correct architecture.

### Anti-Pattern 4: Adding Channel Conditions Inside Business Logic

What it is: Writing if (isMessenger) checks inside functions that should be channel-agnostic (e.g., inside the capacity-filtering logic, not just the render logic).

Why bad: Business rules (recommend trampolines for N guests) should not change by channel. Only the presentation format should change.

Current state: The isMessenger checks are correctly confined to rendering functions (buildTrampolineCards, buildMainMenu, etc.). The filtering and selection logic is channel-agnostic. Keep it this way.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| chat-widget.js | UI rendering, session management, user input, HTML sanitization | n8n webhook (HTTP POST), localStorage |
| chat-widget.css | Widget styling, interactive states | -- |
| Chatwoot | Conversation storage, agent UI, channel routing (web/FB/API) | n8n (webhook trigger), Meta (Messenger) |
| n8n chat-main-v2.json | Orchestration for web widget flow | Chatwoot API, Gemini API, Pinecone |
| n8n fb-messenger-main.json | Orchestration for Messenger flow | Chatwoot API, Gemini API, Pinecone |
| enrich-response-code.js | Marker to HTML string (widget path) | Internal to n8n workflow |
| enrich-chatwoot.js | Marker to Chatwoot message objects (Chatwoot/Messenger path) | Internal to n8n workflow |
| chat-system-prompt.md | LLM behavior, marker vocabulary, booking flow definition | Gemini via n8n |
| Pinecone | Semantic product/FAQ retrieval | n8n Langchain vector store node |
| tool-booking-notify.json | Send booking notification to business owner | Email/Slack/WhatsApp |

---

## Phase-Specific Architecture Warnings

| Phase Topic | Likely Architecture Risk | Mitigation |
|-------------|------------------------|------------|
| Adding new markers | Marker contract drift (prompt vs. enricher vs. widget out of sync) | Update all three atomically; create MARKERS.md as canonical reference |
| Adding a third channel (WhatsApp) | Copy-paste drift; if-isMessenger becomes multi-branch spaghetti | Refactor to channel adapter modules before implementing a third channel |
| Improving booking flow reliability | LLM loses track of booking state mid-conversation | Implement Chatwoot custom attribute for booking_step |
| Gemini prompt caching | Cache invalidation on prompt updates | Version the cached prompt; invalidate cache on any prompt change |
| RAG catalog updates | Stale Pinecone vectors vs. updated system prompt = inconsistent answers | Establish a single update process: update Pinecone first, then trim prompt |

---

## Sources

- [Multi-Channel Chatbot Synchronization Patterns -- DEV Community](https://dev.to/faraz_farhan_83ed23a154a2/multi-channel-chatbot-synchronization-when-your-bot-has-multiple-personalities-across-platforms-cle)
- [Building a Scalable Webhook Architecture -- ChatArchitect](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Idempotent Webhook Retries in n8n -- Modexa / Medium](https://medium.com/@Modexa/idempotent-webhook-retries-in-n8n-without-duplicates-8380273a95a2)
- [n8n Chat Trigger: Long Responses Time Out -- n8n Community](https://community.n8n.io/t/long-chat-responses-time-out/75675)
- [Implement Webhook Idempotency -- Hookdeck](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [Optimize LLM Response Costs with Caching -- AWS](https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/)
- [Prompt Caching: 60% Cost Reduction -- Thomson Reuters Labs / Medium](https://medium.com/tr-labs-ml-engineering-blog/prompt-caching-the-secret-to-60-cost-reduction-in-llm-applications-6c792a0ac29b)
- [Defending Against XSS with CSP -- Auth0](https://auth0.com/blog/defending-against-xss-with-csp/)
- [Stored XSS and CSP Bypass in a Chatbot Platform -- Medium](https://medium.com/@melodicbook/how-mass-assignment-led-to-stored-xss-and-a-csp-bypass-in-a-major-chatbot-platform-3c6569d7c9e9)
- [Content Security Policy Implementation -- MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP)
- [Chatwoot API Architecture -- DeepWiki](https://deepwiki.com/chatwoot/chatwoot/2.2-api-architecture)
- [LLM Chatbot Architecture -- Rasa Blog](https://rasa.com/blog/llm-chatbot-architecture)
- [Building Reliable Job Queue Integrations with n8n -- CodeSmith](https://www.codesmith.in/post/n8n-job-queue-webhook-callbacks)
