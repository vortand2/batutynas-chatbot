# Technology Stack

**Analysis Date:** 2026-03-05

## Languages

**Primary:**
- JavaScript (ES6+) - All runtime code: chat widget, n8n Code nodes, enrichment engines
- HTML/CSS - Widget styling (`chat-widget/chat-widget.css`), demo pages (`demo/index.html`)

**Secondary:**
- JSON - n8n workflow definitions in `n8n-workflows/*.json`
- Markdown - System prompts in `prompts/*.md`, documentation in `docs/`

## Runtime

**Environment:**
- Browser (vanilla JS) - Chat widget runs in end-user browsers, no bundler required
- n8n runtime (Node.js) - All Code nodes in n8n workflows execute in n8n's sandboxed JS environment
- Node.js >=18 - Required for `playwright` local dev dependency only

**Package Manager:**
- npm (no version pinned)
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- None - The chat widget (`chat-widget/chat-widget.js`) is vanilla JS with zero framework dependencies, self-contained as an IIFE
- n8n (self-hosted or cloud) - Workflow automation platform that hosts all backend logic

**Testing:**
- Playwright 1.58.2 - Used for browser automation testing; only dev dependency in `package.json`

**Build/Dev:**
- No build toolchain - Widget is served as raw JS/CSS files
- GitHub Actions - CI/CD for GitHub Pages deployment (`.github/workflows/pages.yml`)
- GitHub Pages - Hosts static demo/test files on master branch push

## Key Dependencies

**Critical:**
- `playwright` ^1.58.2 - Only npm dependency; used for testing chat widget in real browsers

**Infrastructure:**
- n8n nodes (not npm): `n8n-nodes-base.code`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.aiAgent`, `n8n-nodes-base.vectorStorePinecone`, `n8n-nodes-base.embeddingsOpenAi`, `n8n-nodes-base.lmChatGoogleGemini`

## Configuration

**Environment:**
- Credentials are hardcoded directly into n8n workflow JSON nodes as placeholders (not environment variables)
- Placeholder pattern: `PASTE_YOUR_..._HERE` strings replaced manually after workflow import
- Reference file: `docs/config-template.env` documents required values without secrets
- Key config required:
  - Google AI (Gemini) API key
  - Pinecone API key
  - OpenAI API key (embeddings only)
  - SMTP credentials
  - Facebook Page Access Token (Messenger workflow only)
  - Facebook Verify Token (Messenger workflow only)
  - Chatwoot API token + account ID + base URL (Chatwoot workflow only)
  - Booking notification workflow ID (cross-workflow reference)

**Build:**
- No build config files — widget is served directly
- `.gitignore` excludes `.env`, `*.env.local`, `node_modules/`, `.idea/`, `.vscode/`

## Platform Requirements

**Development:**
- Node.js >=18 (for Playwright)
- n8n instance (self-hosted via EasyPanel or n8n cloud) with HTTPS URL

**Production:**
- Static files (widget JS/CSS) hosted on CDN or GitHub Pages
- n8n instance for all AI/workflow logic
- Zyro website (batutynas.lt) embeds the widget via custom code injection

---

*Stack analysis: 2026-03-05*
