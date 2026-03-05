# Technology Stack Research

**Project:** Batutynas.lt Chatbot (Brownfield)
**Researched:** 2026-03-05
**Mode:** Ecosystem / Best-Practices audit of existing stack

---

## Current Stack (as deployed)

| Layer | Technology | Version/Detail | Role |
|-------|-----------|----------------|------|
| Orchestration | n8n | v2.8.3, self-hosted on Easypanel | Webhook receiver, AI agent runner, booking notify tool |
| LLM | Gemini 2.5 Flash | `models/gemini-2.5-flash`, temp 0.3, maxOutputTokens 1024 | Conversational AI, marker generation, function calling |
| Memory | n8n Window Buffer Memory | contextWindowLength: 16 exchanges | Short-term conversation context |
| RAG | Pinecone | (index TBD from workflow) | FAQ / product knowledge retrieval |
| Customer hub | Chatwoot | Self-hosted on Easypanel | CRM dashboard, Messenger bridge, interactive message delivery |
| Web widget | Vanilla JS/CSS | `chat-widget.js` / `chat-widget.css` | Embedded chat on batutynas.lt |
| Messenger | Facebook Messenger via Chatwoot | `fb-messenger-main.json` workflow | Second channel |
| Notifications | SMTP email | Via n8n `emailSend` node | Admin alerts for booking inquiries |
| Hosting | Easypanel | Both n8n and Chatwoot | Container orchestration |

---

## 1. n8n Workflow Best Practices

### 1.1 Timeout Landscape — CRITICAL for this project

**Confirmed findings (MEDIUM-HIGH confidence):**

- n8n webhook nodes expect a response within **~100 seconds** before returning a 524 error to the caller. Chat responses that take longer are silently dropped by the hosted chat trigger.
- The current workflow uses `responseMode: "lastNode"` on the Chat Webhook node, meaning the entire chain (Extract → AI Agent → Enrich → Format) must complete within that window.
- Gemini 2.5 Flash **with thinking enabled** (now on by default) can consume most of the `maxOutputTokens: 1024` budget on thinking tokens alone, causing **empty or truncated responses**. This is a breaking change introduced when Google enabled thinking by default in 2.5 Flash. See [GitHub issue #609](https://github.com/valentinfrlch/ha-llmvision/issues/609) and [Google Developer Forum thread](https://discuss.ai.google.dev/t/max-output-tokens-isnt-respected-when-using-gemini-2-5-flash-model/106708).

**Recommendation — Immediate action required:**
Add `thinkingConfig: { thinkingBudget: 0 }` to the Gemini node configuration to disable thinking mode, OR raise `maxOutputTokens` to at least **4096** to ensure output is not crowded out by thinking tokens. The current value of 1024 is dangerously low for Gemini 2.5 Flash.

### 1.2 Error Handling Patterns

**Current state (from code review):**
- `enrich-response-code.js` has a fallback: if `response` is empty, returns a Lithuanian error message with phone/email. Good.
- `chatwoot/enrich-chatwoot.js` has a 4-message fallback at the bottom (`H-4` guard). Good.
- `tool-booking-notify.json` has no explicit error handler — if SMTP fails, the AI Agent receives an error, which it is supposed to detect and tell the user to call directly (per system prompt instruction).

**Recommended patterns for n8n chatbot workflows:**

1. **Enable "Retry on Fail"** on the Gemini LLM node (2–3 retries, 1s delay). Transient API errors (rate limits, 5xx) are the most common failure mode.
2. **Set a workflow-level error workflow** in Workflow Settings pointing to a notification flow. Currently if the entire workflow crashes, nothing notifies the team.
3. **Use `Continue on Fail`** on the Pinecone retrieval sub-node so a RAG miss does not abort the entire agent run.
4. **Validate webhook payload early** — the current `Extract Chat Input` node does this well (sanitizes, length-limits, language validation). Do not remove this guard.

Source: [n8n Error Handling Docs](https://docs.n8n.io/flow-logic/error-handling/), [Advanced Error Strategies](https://www.wednesday.is/writing-articles/advanced-n8n-error-handling-and-recovery-strategies)

### 1.3 Webhook Reliability

- The current webhook uses `Access-Control-Allow-Origin: *`. This is intentionally open to allow embedding on any site. Acceptable for a chat widget but note: any domain can POST to this endpoint. The widget payload is already sanitized server-side (2000 char limit, control char stripping), which is the correct mitigation.
- Webhook IDs are deterministic (`"webhookId": "batutynas-chat"`). This means the production URL is predictable. Rate-limiting (via n8n Cloud limits or a reverse proxy) is strongly recommended to prevent abuse.
- n8n's default execution timeout is 3600s globally; the practical limit for synchronous webhook-triggered workflows is ~100s before callers give up.

### 1.4 n8n Code Node JavaScript Runtime

**Confirmed (MEDIUM confidence):**
- The Code node runs in a sandboxed Node.js environment. Both `var` and `const`/`let` work — the "use `var` only" constraint in the project is a conservative local convention, not an n8n requirement.
- n8n Code node typeVersion 2 (used in this project) supports modern JS including `const`, `let`, arrow functions, template literals, and `Array.from`. The existing mix of `const` (in `enrich-response-code.js`) and `var` (in `enrich-chatwoot.js`) is inconsistent but both work.
- The `$input`, `$()`, `$json` built-ins are available. `fetch` is available in Code nodes for HTTP calls (though not recommended inside tight latency paths).
- **Known quirk:** First execution of a Code node with a large object definition can be 1500ms slower than subsequent runs (JIT warm-up). This affects cold-start latency on rarely-triggered workflows.

Source: [n8n Code Node Docs](https://docs.n8n.io/code/code-node/), [Code Node Best Practices](https://logicworkflow.com/nodes/code-node/)

---

## 2. Chatwoot API Capabilities and Limitations

### 2.1 Interactive Message Types — Channel Matrix

**Confirmed findings (HIGH confidence, verified against GitHub issues):**

| `content_type` | Web Widget | Facebook Messenger |
|---------------|-----------|-------------------|
| `text` | Yes | Yes |
| `input_select` | Yes | Yes (titles capped at 20 chars) |
| `cards` | Yes | No — silently degrades to text |
| `form` | Yes | No — silently degrades to text |

**Key implication for this project:** The current `enrich-chatwoot.js` correctly handles this via the `isMessenger` flag — it avoids `cards` and `form` for Messenger and uses `input_select` + text fallback instead. This channel-aware split is the right architecture. Do not collapse the two code paths.

Source: [GitHub issue #8007](https://github.com/chatwoot/chatwoot/issues/8007), [GitHub issue #12572](https://github.com/chatwoot/chatwoot/issues/12572)

### 2.2 Typing Indicator API

The `toggle_typing_status` endpoint (`POST /api/v1/accounts/{id}/conversations/{conv_id}/toggle_typing_status`) is used in `enrich-chatwoot.js` to simulate bot thinking. This is the correct approach and matches Chatwoot's documented API. The implementation correctly wraps heavy content (cards, forms) with typing on/off.

**Limitation:** The typing indicator does not persist if the Chatwoot WebSocket connection drops. It's a UX enhancement, not a reliability requirement.

### 2.3 Chatwoot HMAC / Contact Verification

When `HMAC` identity validation is enabled, the SDK requires a server-generated `identifier_hash`. The current widget bypasses this entirely — it does not use the Chatwoot SDK at all. The custom widget POSTs directly to the n8n webhook, and Chatwoot is reached only from the n8n server side. This means HMAC is irrelevant for the web widget path. The Messenger path flows through Chatwoot's own inbox, which handles identity natively.

### 2.4 Chatwoot API Rate Limits

Chatwoot self-hosted instances do not enforce API rate limits by default. On the cloud version, limits apply. Since this is self-hosted on Easypanel, API calls from n8n to Chatwoot should not hit rate limits under normal chat volume. Monitor if concurrent users increase significantly.

### 2.5 Message Ordering Guarantee

Chatwoot delivers messages in the order they arrive at the API. The current workflow sends messages sequentially in a `for` loop inside `formatOutput()`. This is correct — do not parallelize message sends or ordering will break.

Source: [Chatwoot API Reference](https://developers.chatwoot.com/api-reference/messages/create-new-message), [Chatwoot Interactive Messages Guide](https://www.chatwoot.com/hc/user-guide/articles/1677689344-how-to-use-interactive-messages)

---

## 3. Gemini 2.5 Flash — Capabilities and Known Issues

### 3.1 Thinking Mode — CRITICAL Known Issue

**HIGH confidence (multiple official sources + community reports):**

Gemini 2.5 Flash has **thinking enabled by default**. Thinking tokens count against `maxOutputTokens`. With `maxOutputTokens: 1024` (current setting), the model can exhaust the budget entirely on internal reasoning and return an empty or truncated response. The `finish_reason` in this case is `MAX_TOKENS`.

**This is the most likely cause of any "empty response" bugs seen in production.**

Fix options (in order of preference):
1. Set `thinkingConfig: { thinkingBudget: 0 }` to disable thinking for simple Q&A/booking flows. Thinking adds latency and cost without benefit for deterministic conversational flows following a system prompt.
2. Raise `maxOutputTokens` to 4096 minimum. At temperature 0.3, responses for this use case are typically 100–400 tokens of actual text.

Source: [GitHub ha-llmvision #609](https://github.com/valentinfrlch/ha-llmvision/issues/609), [Google AI Forum thread](https://discuss.ai.google.dev/t/max-output-tokens-isnt-respected-when-using-gemini-2-5-flash-model/106708), [Vertex AI Gemini 2.5 Flash Docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash)

### 3.2 Context Window

Gemini 2.5 Flash supports **1 million token context window**. For this chatbot, context is bounded by:
- n8n Window Buffer Memory: 16 exchanges (well within limits)
- System prompt: ~5,000–7,000 tokens (full equipment catalog embedded)
- RAG context: top-k results from Pinecone (typically 500–2000 tokens)

No context window overflow risk for this use case.

### 3.3 Lithuanian Language Support

**HIGH confidence (verified against official Google docs):**

Lithuanian (`lt`) is an explicitly supported language in Gemini 2.5 Flash. The model handles diacritics (ą, č, ę, ė, į, š, ų, ū, ž) correctly. The existing system prompt is written entirely in Lithuanian, and the model responds in Lithuanian by default — this is working as designed.

**Caveat:** Idiomatic Lithuanian business language may occasionally feel slightly off. The current system prompt tone guidance ("šiltas, profesionalus") and explicit fallback phrases are the correct mitigation for edge cases.

Source: [Google AI Models Page](https://ai.google.dev/gemini-api/docs/models), [Vertex AI Gemini 2.5 Flash](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash)

### 3.4 Function Calling (booking_notify tool)

Gemini 2.5 Flash supports function calling natively. The `booking_notify` tool is configured as an n8n Execute Workflow sub-node, which the AI Agent node wraps as a tool call. This is the correct n8n pattern.

**Known risk:** With thinking enabled (3.1 above), function calling may consume extra thinking tokens before deciding to call the tool, increasing latency and token cost.

### 3.5 Temperature Setting

Current: `temperature: 0.3`. This is appropriate for a structured booking flow where consistent marker output is required. Higher temperature risks the model deviating from exact marker syntax (e.g., outputting `` `[DATE_PICKER]` `` instead of `[DATE_PICKER]`).

**Do not increase temperature** for the booking flow. For the FAQ/DUK group, slightly higher temperature (0.5–0.6) could produce more natural answers, but a single temperature across all groups is simpler and acceptably safe.

---

## 4. Pinecone RAG Best Practices

### 4.1 Current Usage Pattern

The Pinecone node is used as a retrieval tool available to the AI Agent. The system prompt instructs the agent: "Always use the Pinecone knowledge base tool when the customer asks about products, trampolines, prices, delivery, safety, FAQ..." The agent decides when to invoke retrieval.

This is the **agent-decides-retrieval** pattern (vs. always-retrieve). It works but has a known failure mode: the agent may skip RAG retrieval for questions it thinks it can answer from the system prompt alone.

### 4.2 Chunk Size Recommendation

For FAQ / product description content: **200–500 tokens per chunk** with 50-token overlap. This preserves semantic context for trampoline specs (dimensions, capacity, age range) without over-splitting.

### 4.3 Namespace Strategy

Pinecone namespaces allow logical separation of content types (e.g., `faq`, `products`, `policies`). **Confirmed n8n limitation:** Combining namespace + metadata filter in n8n's Pinecone Vector Store node produces an error: `"cannot provide both filter and this.filter"`. Use one or the other, not both.

Recommendation: Use a single namespace (e.g., `batutynas`) and rely on top-k similarity without metadata filtering for this use case. The knowledge base is small enough that namespace separation is unnecessary.

Source: [n8n Community - Pinecone namespace + filter error](https://community.n8n.io/t/pinecone-error-when-using-namespace-and-metadata-filter/72037)

### 4.4 Embedding Model Alignment

The embedding model used at **ingestion time** (in `ingest-website.json`) must be **identical** to the model used at **retrieval time** (in the main chat workflow). Mismatched embedding models produce low-quality retrieval (wrong vector space). Verify both workflows use the same model and dimensionality.

### 4.5 RAG vs. System Prompt for Catalog Data

**Observation from code review:** The equipment catalog (all trampoline names, specs, capacities) is already hardcoded in two places:
1. The system prompt (`chat-system-prompt.md`)
2. The enrichment engine JavaScript (`TRAMPOLINES` array in both `enrich-response-code.js` and `enrich-chatwoot.js`)

This means RAG retrieval for product details is largely redundant — the LLM already has the full catalog in context. RAG is most valuable for:
- Detailed FAQ answers not in the system prompt
- Delivery zone edge cases
- Policies (weather, cancellation)
- Content that changes frequently (pricing, promotions)

**Recommendation:** Keep RAG for FAQ/policy content. Do not duplicate product cards data in Pinecone — it creates a synchronization problem (two sources of truth that diverge over time).

---

## 5. Web Widget Embedding Best Practices

### 5.1 CSP Headers for Host Site

The chat widget embeds on `batutynas.lt` (Zyro/Hostinger-hosted). CSP headers on the host site may block the widget if not configured.

Required CSP allowances for the widget to function:
- `connect-src`: the n8n webhook domain (Easypanel URL)
- `script-src`: the domain serving `chat-widget.js`
- `img-src`: `https://assets.zyrosite.com` (product card images), `data:` (for base64 inline images if used)
- `style-src 'unsafe-inline'`: the widget uses inline styles for dynamic color theming

Hostinger/Zyro typically does not set restrictive CSP headers by default, so this is a monitoring concern rather than an immediate blocker. If the widget is ever embedded on a more restrictive site (e.g., a corporate intranet), these directives will be required.

Source: [MDN CSP Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy), [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

### 5.2 Current Security Model (from code review)

The widget has a solid HTML sanitizer (`sanitizeHtml()`) with:
- Allowlist of safe HTML tags (no `script`, `iframe`, `object`)
- Allowlist of safe attributes
- Protocol validation on `href` / `src` (http/https/mailto only)

This is correct and sufficient for the `{{HTML}}` content rendered in message bubbles.

**Remaining concerns:**
- `Access-Control-Allow-Origin: *` on the n8n webhook is intentional (multi-site embed) but means anyone can POST to the webhook. The 2000-char message limit and control-char sanitization in the Extract node are the right defenses.
- No rate limiting at the widget/webhook level. A user could spam the webhook with rapid messages. The `state.sending` flag in the widget prevents client-side double-sends, but server-side rate limiting (nginx/Caddy `limit_req`) would add defense-in-depth.

### 5.3 localStorage Session Persistence

The widget stores session state in `localStorage` with a 24-hour TTL. This is appropriate for a booking inquiry flow. Key behaviors:
- Session ID is crypto-random (`crypto.getRandomValues`) — correct
- Messages are capped at last 50 (`slice(-50)`) — prevents localStorage bloat
- Graceful fallback when localStorage is unavailable (try/catch)

### 5.4 Mobile Keyboard Handling

The widget uses `window.visualViewport` to resize the chat window when the mobile keyboard appears. This is the current best-practice approach (vs. older `window.resize` + `innerHeight` heuristics). The implementation correctly handles cleanup via `_cleanupViewport` on re-render.

### 5.5 Performance Considerations

- The widget is a single ~960-line vanilla JS file. No framework, no dependencies. Load cost is minimal (~15–20 KB minified).
- The 6-second proactive greeting timeout (`setTimeout 6000`) fires after DOM initialization regardless of whether the user is actually engaged. This is acceptable for the traffic volumes of a small business site.
- Product card images load from `assets.zyrosite.com` CDN with `format=auto,w=300,h=200,fit=crop` parameters. This is already optimized (server-side resizing + WebP delivery).

---

## 6. Alternatives Considered (not recommended for this brownfield project)

| Category | Current | Alternative | Why Not |
|----------|---------|-------------|---------|
| LLM | Gemini 2.5 Flash | GPT-4o Mini | No advantage; Gemini already integrated; Lithuanian support confirmed |
| Memory | n8n Window Buffer | Redis / Postgres | Overkill for current volume; volatile memory is acceptable for 24h TTL widget sessions |
| RAG | Pinecone | Supabase pgvector | Migration cost; Pinecone is working |
| Widget | Vanilla JS | React/Vue widget | No benefit; adds build complexity, breaks current embeddability |
| Chatwoot | Self-hosted | Chatwoot Cloud | Higher cost; current self-hosted setup works |

---

## 7. Critical Action Items (Ranked by Risk)

1. **[CRITICAL] Fix Gemini 2.5 Flash `maxOutputTokens`:** Either disable thinking (`thinkingBudget: 0`) or raise `maxOutputTokens` to 4096. Current value of 1024 causes empty/truncated responses due to thinking token consumption. This is the highest-probability active bug.

2. **[HIGH] Add n8n error workflow:** Configure a workflow-level error handler in Workflow Settings that sends an email/notification when the main chat workflow crashes. Currently failures are silent.

3. **[HIGH] Enable "Retry on Fail"** on the Gemini LLM node (2–3 retries). Transient API errors cause complete failures that surface as blank responses to users.

4. **[MEDIUM] Add server-side rate limiting** to the n8n webhook endpoint (via Easypanel/Caddy/nginx `limit_req`). Current widget-side `state.sending` guard only prevents the honest user from spamming.

5. **[MEDIUM] Verify embedding model consistency** between `ingest-website.json` and the chat workflow Pinecone retrieval node. A mismatch silently degrades retrieval quality.

6. **[LOW] Standardize Code node JS style:** `enrich-response-code.js` uses `const/let`; `enrich-chatwoot.js` uses `var`. Both work in n8n v2.8.3. Standardize to `var` (current convention) or `const/let` (modern) — mixed style increases cognitive overhead.

7. **[LOW] Document CSP requirements** for any future site that embeds the widget. The `connect-src` allowance for the n8n Easypanel URL is required.

---

## Sources

- [n8n Error Handling Docs](https://docs.n8n.io/flow-logic/error-handling/)
- [n8n Workflow Settings / Timeout Config](https://docs.n8n.io/hosting/configuration/configuration-examples/execution-timeout/)
- [n8n Code Node Documentation](https://docs.n8n.io/code/code-node/)
- [n8n Memory — Window Buffer](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow/)
- [n8n Webhook timeout community discussion](https://community.n8n.io/t/long-chat-responses-time-out/75675)
- [n8n Advanced Error Handling](https://www.wednesday.is/writing-articles/advanced-n8n-error-handling-and-recovery-strategies)
- [Chatwoot API Reference — Create Message](https://developers.chatwoot.com/api-reference/messages/create-new-message)
- [Chatwoot Interactive Messages Guide](https://www.chatwoot.com/hc/user-guide/articles/1677689344-how-to-use-interactive-messages)
- [Chatwoot cards on WhatsApp GitHub issue #8007](https://github.com/chatwoot/chatwoot/issues/8007)
- [Chatwoot API cards on WhatsApp issue #12572](https://github.com/chatwoot/chatwoot/issues/12572)
- [Gemini 2.5 Flash — Official Google AI Models](https://ai.google.dev/gemini-api/docs/models)
- [Vertex AI Gemini 2.5 Flash Docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash)
- [Gemini 2.5 Flash thinking tokens / maxOutputTokens bug (ha-llmvision #609)](https://github.com/valentinfrlch/ha-llmvision/issues/609)
- [Gemini max_output_tokens not respected (Google AI Forum)](https://discuss.ai.google.dev/t/max-output-tokens-isnt-respected-when-using-gemini-2-5-flash-model/106708)
- [Pinecone RAG Chatbot Guide](https://docs.pinecone.io/guides/get-started/build-a-rag-chatbot)
- [n8n + Pinecone namespace + filter error](https://community.n8n.io/t/pinecone-error-when-using-namespace-and-metadata-filter/72037)
- [MDN Content-Security-Policy Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
