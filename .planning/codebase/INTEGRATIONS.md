# External Integrations

**Analysis Date:** 2026-03-05

## APIs & External Services

**AI / LLM:**
- Google Gemini 2.5 Flash - Primary AI agent for all chat workflows
  - SDK/Client: n8n built-in `lmChatGoogleGemini` node
  - Auth: Google AI (PaLM/Gemini) credential in n8n
  - Used in: `n8n-workflows/chat-main-v2.json`, `n8n-workflows/fb-messenger-main.json`, `chatwoot/chatwoot-main.json`
  - Note: Previous v1 workflow used Claude Sonnet 4 (kept in `n8n-workflows/chat-main.json` as legacy reference)

- OpenAI (text-embedding-3-small) - Vector embeddings only, not for chat
  - SDK/Client: n8n built-in `embeddingsOpenAi` node
  - Auth: OpenAI API credential in n8n
  - Used in: `n8n-workflows/ingest-website.json` (ingestion), `n8n-workflows/chat-main-v2.json` (query embeddings)
  - Cost: ~$0.02/1M tokens

**Vector Database:**
- Pinecone - RAG knowledge base storing batutynas.lt website content
  - SDK/Client: n8n built-in `vectorStorePinecone` node
  - Auth: Pinecone API credential in n8n
  - Index: `batutynas`, dimensions: 1536, metric: cosine, serverless on AWS us-east-1
  - Namespace: `batutynas-lt`
  - Approximate vectors: 100-160 (indexed from ~55 website pages)
  - Used in: `n8n-workflows/ingest-website.json` (write), `n8n-workflows/chat-main-v2.json` (read)

**Facebook / Meta:**
- Facebook Messenger Platform - Inbound messages via webhook, outbound via Graph API
  - Auth: Facebook Page Access Token (hardcoded in `fb-messenger-main.json` Send to Messenger code node as `PASTE_YOUR_FB_PAGE_ACCESS_TOKEN_HERE`)
  - Webhook verify token: Custom string set in `fb-messenger-main.json` Extract & Route code node
  - Graph API endpoint: `https://graph.facebook.com/v21.0/me/messages`
  - Subscriptions: `messages`, `messaging_postbacks`
  - Workflow: `n8n-workflows/fb-messenger-main.json`

**Chatwoot:**
- Chatwoot (self-hosted on EasyPanel) - Central customer messaging hub; handles both website widget and Facebook Messenger from one inbox
  - Base URL (hardcoded): `https://batutynas-chatwoot-chatwoot.0uvai5.easypanel.host`
  - Account ID: `1`
  - Auth: Agent Bot access token (hardcoded in `chatwoot/enrich-chatwoot.js` Send to Chatwoot node)
  - API used: `/api/v1/accounts/{id}/conversations/{id}/messages`, `/api/v1/accounts/{id}/conversations/{id}/toggle_typing_status`
  - Agent Bot webhook receives events from Chatwoot, posts responses back via REST
  - Workflow: `chatwoot/chatwoot-main.json`

## Data Storage

**Databases:**
- No persistent database in main chatbot stack
- All conversation memory: n8n Window Buffer Memory (16-message in-memory window per session)
- Client-side session persistence: `localStorage` (key: `batutynas_chat`) with 24-hour TTL
  - Implemented in: `chat-widget/chat-widget.js` (`loadSession`, `saveSession` functions)

**Vector Storage:**
- Pinecone (see APIs section above)

**File Storage:**
- Product images: Zyrosite CDN (`https://assets.zyrosite.com/cdn-cgi/image/...`)
  - Images are referenced by URL in `n8n-workflows/enrich-response-code.js` and `chatwoot/enrich-chatwoot.js` TRAMPOLINES data arrays
  - Not managed by this codebase — hosted externally on Zyrosite

**Caching:**
- None (n8n Window Buffer Memory is in-process, not Redis/Memcached)

## Authentication & Identity

**Auth Provider:**
- None — the chat widget is public-facing, no user authentication
- Optional: `BatutynasChat.setUser(email, name)` API in `chat-widget/chat-widget.js` allows passing pre-authenticated user info to webhook payload

## Email / Notifications

**SMTP (booking notifications):**
- Provider: Configurable SMTP (any provider; `info@batutynas.lt` / `noreply@batutynas.lt` configured)
  - Auth: SMTP credential in n8n
  - Used in: `n8n-workflows/tool-booking-notify.json`
  - Trigger: Called as a sub-workflow from `chat-main-v2.json` and `fb-messenger-main.json` when a booking is submitted
  - Admin recipient: `info@batutynas.lt`

## Website Embedding

**Zyro/Hostinger Website (batutynas.lt):**
- The chat widget is embedded via custom code injection in Zyro site editor
- JS: `chat-widget/chat-widget.js` + CSS: `chat-widget/chat-widget.css`
- Init call: `BatutynasChat.init({ webhookUrl: '...', storeName: 'Batutynas.lt', primaryColor: '#6C3CE1' })`
- Reference: `embed-snippet.html`, `docs/SETUP.md` Step 8

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, Datadog, or similar

**Logs:**
- n8n execution logs (built-in to n8n) — only logging mechanism
- Widget errors: `console.error` in `chat-widget/chat-widget.js` init validation

## CI/CD & Deployment

**Hosting (static files / demo):**
- GitHub Pages — auto-deploys entire repo root on push to `master`
  - Config: `.github/workflows/pages.yml`
  - Serves demo at GitHub Pages URL (full repo published)

**Hosting (n8n):**
- Self-hosted n8n on EasyPanel (referenced in `chatwoot/enrich-chatwoot.js` base URL pattern)
- n8n Cloud also supported (any HTTPS n8n instance works)

**CI Pipeline:**
- GitHub Actions for GitHub Pages deployment only
- No test automation in CI

## Webhooks & Callbacks

**Incoming (n8n receives):**
- Chat widget → n8n: `POST /webhook/batutynas-chat` — JSON payload with `{message, session_id, language, email, name}`
- Facebook → n8n: `GET /webhook/batutynas-fb-messenger` (verification) + `POST /webhook/batutynas-fb-messenger` (messages)
- Chatwoot → n8n: `POST /webhook/batutynas-chatwoot` — Chatwoot agent bot events

**Outgoing (n8n sends):**
- n8n → Facebook Graph API: `POST https://graph.facebook.com/v21.0/me/messages` to deliver Messenger replies
- n8n → Chatwoot API: `POST /api/v1/accounts/1/conversations/{id}/messages` to deliver chat responses
- n8n → SMTP server: Booking notification emails to admin

## Environment Configuration

**Required env vars / credentials (set in n8n, not as OS env vars):**
- `Google AI (PaLM/Gemini)` credential — Gemini 2.5 Flash API key
- `Pinecone` credential — Pinecone API key
- `OpenAI` credential — OpenAI API key (embeddings only)
- `SMTP` credential — email server credentials
- Hardcoded placeholders replaced post-import:
  - `PASTE_YOUR_FB_PAGE_ACCESS_TOKEN_HERE` in `fb-messenger-main.json`
  - `PASTE_YOUR_FB_VERIFY_TOKEN_HERE` in `fb-messenger-main.json`
  - `PASTE_YOUR_BOOKING_WORKFLOW_ID_HERE` in `chat-main-v2.json`, `fb-messenger-main.json`, `chatwoot-main.json`
  - `API_TOKEN`, `ACCOUNT_ID`, `CHATWOOT_URL` in Chatwoot send node

**Secrets location:**
- All secrets live inside n8n's encrypted credential store
- No `.env` files committed (`.gitignore` excludes `.env`)
- `docs/config-template.env` documents required keys without values

---

*Integration audit: 2026-03-05*
