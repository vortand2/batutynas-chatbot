# Architecture

**Analysis Date:** 2026-03-05

## Pattern Overview

**Overall:** Multi-channel chatbot with marker-based response enrichment

**Key Characteristics:**
- No traditional backend server — n8n workflow automation acts as the backend
- Two separate channel pipelines (web widget and Chatwoot) sharing the same AI agent pattern
- LLM outputs lightweight text markers (e.g. `[DATE_PICKER]`) which are post-processed by a JavaScript enrichment layer into rich interactive HTML
- Chat widget is a fully self-contained IIFE (vanilla JS, zero dependencies) embedded on the client site via `<script>` tag
- RAG (Retrieval-Augmented Generation) using Pinecone vector store + OpenAI embeddings provides product/business knowledge to the AI agent

## Channels

There are three distinct channel pipelines:

**Web Widget (primary channel):**
- Entry: `chat-widget/chat-widget.js` — `BatutynasChat.init({ webhookUrl })`
- Webhook: n8n `chat-main-v2.json` on path `batutynas-chat`
- Response: returns JSON `{ response, session_id }` synchronously

**Chatwoot Integration (CRM channel):**
- Entry: Chatwoot webhook POST → n8n `chatwoot/chatwoot-main.json` on path `batutynas-chatwoot`
- Response: n8n calls Chatwoot REST API to post messages back (async, not webhook response)
- Enrichment: `chatwoot/enrich-chatwoot.js` converts markers to Chatwoot `content_type` objects (cards, forms, quick replies)

**Facebook Messenger (via Chatwoot):**
- Entry: Facebook POST → Chatwoot → relayed as Chatwoot webhook event
- Shares the Chatwoot pipeline; `isMessenger` flag detected from channel name
- FB Messenger also has its own direct n8n workflow: `n8n-workflows/fb-messenger-main.json` on path `batutynas-fb-messenger`

## Layers

**Frontend / Chat Widget Layer:**
- Purpose: Renders chat UI, manages session state, sends messages to webhook, handles interactive HTML responses
- Location: `chat-widget/chat-widget.js`, `chat-widget/chat-widget.css`
- Contains: IIFE with session management, DOM rendering, event delegation for interactive elements
- Depends on: Nothing (vanilla JS). Config-injected `webhookUrl`
- Used by: Embedded on batutynas.lt via `embed-snippet.html`

**n8n Workflow Layer (Backend):**
- Purpose: Receives webhook, sanitizes input, invokes AI agent, post-processes output, returns response
- Location: `n8n-workflows/chat-main-v2.json` (web), `chatwoot/chatwoot-main.json` (Chatwoot), `n8n-workflows/fb-messenger-main.json` (Messenger)
- Contains: Webhook trigger → input extraction → AI agent → enrichment → response format
- Depends on: Gemini 2.5 Flash LLM, Pinecone vector store, OpenAI embeddings, booking sub-workflow

**AI Agent Layer:**
- Purpose: Receives sanitized user message + system prompt, queries RAG knowledge base, outputs text with marker directives
- Location: Embedded in n8n workflow as LangChain AI Agent node using `Gemini 2.5 Flash`
- Contains: LLM inference, Pinecone RAG tool (`batutynas_knowledge_base`), session memory (`Window Buffer Memory`, 16-message context window), `booking_notify` tool
- Depends on: System prompt in `prompts/chat-system-prompt.md` (baked into workflow nodes), Pinecone index `batutynas` namespace `batutynas-lt`

**Response Enrichment Layer:**
- Purpose: Translates LLM text markers into interactive UI components (HTML for widget, Chatwoot API objects for CRM)
- Location: `n8n-workflows/enrich-response-code.js` (web widget enricher), `chatwoot/enrich-chatwoot.js` (Chatwoot enricher)
- Contains: TRAMPOLINES equipment data array, HTML/card builders for each marker type, contextual quick replies appended to every response
- Depends on: LLM agent output text

**Booking Sub-Workflow Layer:**
- Purpose: Parses booking data, formats email, sends notification to admin
- Location: `n8n-workflows/tool-booking-notify.json`
- Contains: Input sanitization, phone number formatter, three email template branches (rental booking / catalog request / custom manufacturing)
- Depends on: SMTP credentials, called as n8n Tool from the AI agent

**RAG Knowledge Ingestion (one-time pipeline):**
- Purpose: Scrapes batutynas.lt pages and stores embeddings in Pinecone
- Location: `n8n-workflows/ingest-website.json`
- Contains: URL list, HTTP fetcher, chunker, OpenAI embeddings, Pinecone upsert

## Data Flow

**Web Widget — Standard Message:**

1. User types message in `chat-widget/chat-widget.js`
2. `_sendToWebhook(text)` POSTs `{ message, session_id, language, email, name }` to n8n webhook
3. n8n `Extract Chat Input` node sanitizes input, validates language (`lt`/`en` only), enforces 2000-char limit
4. n8n `AI Agent` (Gemini 2.5 Flash) queries Pinecone RAG tool and generates text response with optional markers (e.g. `[DATE_PICKER]`, `[MENU_GROUP_BIRTHDAY:10]`)
5. n8n `Enrich Response` node replaces markers with rendered HTML strings, prepends `{{HTML}}` prefix
6. n8n `Format Response` returns `{ response, session_id }` via webhook
7. Widget receives JSON, calls `addMessage('agent', response)` which detects `{{HTML}}` and calls `sanitizeHtml()` before rendering

**Booking Inquiry Flow:**

1. User completes multi-step flow (date → address → guests → trampoline selection → phone)
2. AI agent determines all required fields are collected and calls `booking_notify` tool
3. Tool sub-workflow sends email to `info@batutynas.lt` via SMTP
4. Sub-workflow returns confirmation string to agent
5. Agent includes `[BOOKING_CONFIRM:{json}]` marker in response
6. Enricher renders booking confirmation card

**Chatwoot Channel:**

1. Chatwoot sends POST to n8n `batutynas-chatwoot` webhook on `message_created` or `message_updated` events
2. n8n `Filter & Extract` node deduplicates within 5-second window, extracts `conversationId`, detects `isMessenger` flag
3. n8n responds `200 ok` immediately (async pattern)
4. AI Agent runs same flow but uses Chatwoot-specific system prompt (no `[LOCATION_OPTIONS]` marker; uses iterative addon selection)
5. `enrich-chatwoot.js` converts markers into Chatwoot API message objects (content_type: cards, form, etc.)
6. n8n POSTs messages back to Chatwoot REST API at `batutynas-chatwoot-chatwoot.0uvai5.easypanel.host`

**State Management:**
- Web widget session persisted in `localStorage` (key: `batutynas_chat`, TTL: 24h, last 50 messages)
- n8n agent memory: `Window Buffer Memory` keyed by `sessionId`, 16-message context window (in-memory, lost on n8n restart)
- No persistent server-side conversation storage

## Key Abstractions

**Marker System:**
- Purpose: Decouples LLM output from UI rendering. LLM writes text directives; enrichment layer renders them.
- Markers: `[MAIN_MENU]`, `[DATE_PICKER]`, `[LOCATION_OPTIONS]`, `[GUEST_COUNT]`, `[MENU_GROUP_BIRTHDAY:N]`, `[MENU_GROUP_PUBLIC:N]`, `[MENU_GROUP_PARTY]`, `[ADDON_UPSELL]`, `[PURCHASE_SUBMENU]`, `[PURCHASE_EMAIL_INPUT]`, `[PURCHASE_CUSTOM_FORM]`, `[BOOKING_CONFIRM:{json}]`
- Web enricher: `n8n-workflows/enrich-response-code.js` (large inline Code node, also extracted as file)
- Chatwoot enricher: `chatwoot/enrich-chatwoot.js`

**TRAMPOLINES Data Array:**
- Purpose: Single source of truth for equipment catalog, shared across enrichers
- Categories: `big-park`, `mega-trampoline`, `standard-trampoline`, `addon`, `party-equipment`
- Duplicated in both `n8n-workflows/enrich-response-code.js` and `chatwoot/enrich-chatwoot.js` — not shared

**Interactive HTML Protocol:**
- Purpose: Enables the web widget to render rich UI (buttons, date pickers, forms) returned from the backend
- Prefix: Responses starting with `{{HTML}}` are treated as HTML and passed through `sanitizeHtml()` (allowlist-based)
- Data attributes for interaction: `data-chat-option`, `data-chat-date`, `data-chat-date-confirm`, `data-chat-email`, `data-chat-email-confirm`, `data-chat-address`, `data-chat-addon`, `data-chat-addon-continue`, `data-chat-custom-submit`, `data-chat-detail-toggle`, `data-chat-retry`
- All interactions are handled via a single delegated click/keydown/change/input listener in `chat-widget.js`

**Session Identity:**
- Format: `sess_{timestamp_base36}_{random_12chars}` (web widget) or `cw-{conversationId}` (Chatwoot) or `fb_{senderId}` (Messenger)
- Passed in every request; used as memory key in n8n Window Buffer Memory

## Entry Points

**Web Widget Initialization:**
- Location: `chat-widget/chat-widget.js` — `window.BatutynasChat.init(options)`
- Triggers: Script include + `BatutynasChat.init({ webhookUrl, ... })` call on host page
- Responsibilities: Loads/creates session, attaches event delegation, renders initial UI, schedules proactive greeting (6s delay for new sessions)

**n8n Chat Webhook:**
- Location: `n8n-workflows/chat-main-v2.json` — node "Chat Webhook", path `batutynas-chat`
- Triggers: HTTP POST from chat widget `_sendToWebhook()`
- Responsibilities: Input sanitization, AI agent invocation, response enrichment, return JSON

**n8n Chatwoot Webhook:**
- Location: `chatwoot/chatwoot-main.json` — node "Chatwoot Webhook", path `batutynas-chatwoot`
- Triggers: HTTP POST from Chatwoot on new messages
- Responsibilities: Deduplication, AI agent, async Chatwoot API message posting

**n8n FB Messenger Webhook:**
- Location: `n8n-workflows/fb-messenger-main.json` — node "FB Webhook", path `batutynas-fb-messenger`
- Triggers: GET (verification) or POST (messages) from Facebook
- Responsibilities: Verification handshake, message routing (postback/quick_reply/message), AI agent, Messenger API responses

**Ingestion Pipeline:**
- Location: `n8n-workflows/ingest-website.json` — Manual Trigger
- Triggers: Manual run in n8n
- Responsibilities: Fetch 50+ batutynas.lt URLs, chunk, embed with OpenAI, upsert to Pinecone

## Error Handling

**Strategy:** Graceful degradation with Lithuanian fallback messages

**Patterns:**
- Empty LLM response → enricher returns hardcoded error with contact info (`+370 648 803 88`)
- Widget HTTP error → displays retry button via `{{HTML}}` system message with `data-chat-retry` attribute
- Retry logic: `data-chat-retry` click re-sends `state._lastSentText` and removes the error bubble from state
- Chatwoot: missing `conversationId` returns `{ _skip: true }` to abort pipeline without sending message
- FB Messenger: unsupported message types (images, stickers) return `routeType: 'unsupported'` and are filtered
- Session load errors (corrupt localStorage): silently fall back to new session

## Cross-Cutting Concerns

**Logging:** None — no structured logging. Errors surface only via n8n execution logs.

**Validation:**
- Widget: `MAX_MESSAGE_LENGTH = 2000`, stripped via `substring`. HTML output sanitized via allowlist (`sanitizeHtml()`).
- n8n extract nodes: strip control characters `\x00-\x08\x0B\x0C\x0E-\x1F`, enforce 2000-char limit, validate language to `['lt', 'en']`
- Booking tool: `sanitize()` strips newlines to prevent email header injection, validates email format, requires 8+ phone digits

**Authentication:** None on webhook endpoints (open). FB Messenger webhook uses verify token challenge (GET), but HMAC signature verification is disabled (noted in code comment).

**Internationalization:** Lithuanian (`lt`) is default. English (`en`) supported in widget via `LANGUAGES` map and language auto-detection from `navigator.language`. Chatwoot/Messenger prompts are Lithuanian-only by default.

---

*Architecture analysis: 2026-03-05*
