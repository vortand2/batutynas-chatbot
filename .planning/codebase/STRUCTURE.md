# Codebase Structure

**Analysis Date:** 2026-03-05

## Directory Layout

```
batutynas-chatbot/
├── chat-widget/            # Embeddable web chat widget (JS + CSS)
│   ├── chat-widget.js      # Self-contained IIFE widget (~960 lines)
│   └── chat-widget.css     # Widget styles with CSS custom properties (~1130 lines)
├── chatwoot/               # Chatwoot CRM integration
│   ├── chatwoot-main.json  # n8n workflow: Chatwoot AI agent pipeline
│   ├── enrich-chatwoot.js  # Response enricher for Chatwoot API (standalone file)
│   ├── enrich-chatwoot-test.js  # Test/extended version of enricher
│   ├── SETUP.md            # Chatwoot setup guide
│   ├── test-chatwoot.html  # Browser test page for Chatwoot
│   └── test-widget.html    # Browser test page for widget
├── n8n-workflows/          # n8n automation workflow files
│   ├── chat-main-v2.json   # PRIMARY: web chat workflow (Gemini + Pinecone)
│   ├── chat-main.json      # LEGACY: Claude-based workflow (keep for reference)
│   ├── fb-messenger-main.json  # Facebook Messenger direct workflow
│   ├── tool-booking-notify.json  # Sub-workflow: booking email notifications
│   ├── ingest-website.json # One-time: scrape batutynas.lt into Pinecone
│   ├── enrich-response-code.js   # Response enricher code (extracted from workflow)
│   ├── enrich-response-code-test.js  # Extended/test enricher
│   ├── format-response-code.js   # Simple response formatter helper
│   └── template*.js        # Legacy template iterations (template1.js, template2.js, template3.js)
├── prompts/                # AI system prompts (source of truth)
│   ├── chat-system-prompt.md       # Web widget agent prompt (primary)
│   ├── fb-messenger-system-prompt.md  # FB Messenger agent prompt
│   └── ghl-system-prompt.md        # GoHighLevel prompt (unused/future)
├── demo/
│   └── index.html          # Self-contained demo with mock AI, full UI
├── docs/
│   ├── SETUP.md            # Deployment guide (n8n + Pinecone + credentials)
│   ├── FB-MESSENGER-SETUP.md  # Facebook Messenger setup guide
│   └── config-template.env # Required environment variables template
├── other-examples/         # Reference examples (not production code)
│   └── extracted/
│       ├── batutynas-example/  # Full-stack example (React + Express + Drizzle)
│       └── messenger-example/  # Messenger example
├── land-search-agent/      # Separate sub-project (land search tool, own git repo)
│   ├── backend/            # Node.js/Express backend
│   └── frontend/           # Next.js frontend
├── embed-snippet.html      # One-liner embed code for production site
├── test-groups.html        # Browser test for all 5 conversation groups
├── test-on-site.html       # Test page for on-site widget testing
├── package.json            # Minimal (likely just for tooling; no app server)
├── .github/workflows/      # CI/CD (GitHub Actions)
├── .planning/codebase/     # GSD planning documents (this file lives here)
└── README.md               # Project overview
```

## Directory Purposes

**`chat-widget/`:**
- Purpose: The embeddable chat widget — the only client-facing code artifact
- Contains: One JS file (IIFE module pattern) and one CSS file
- Key files: `chat-widget.js` (widget logic), `chat-widget.css` (all styles)
- Deployed via: GitHub Pages CDN (`vortand2.github.io/batutynas-chatbot/chat-widget/`)

**`n8n-workflows/`:**
- Purpose: n8n automation workflow definitions (imported into n8n instance)
- Contains: JSON workflow exports and extracted JavaScript code from Code nodes
- Key files: `chat-main-v2.json` (primary workflow), `tool-booking-notify.json` (sub-workflow), `ingest-website.json` (RAG ingestion)
- Note: `.js` files are the JavaScript code from n8n Code nodes, extracted for readability and version control — they are NOT standalone executables

**`chatwoot/`:**
- Purpose: Chatwoot CRM integration for managing conversations in a support inbox
- Contains: n8n workflow for Chatwoot channel + Chatwoot-specific response enricher
- Key files: `chatwoot-main.json` (workflow), `enrich-chatwoot.js` (enricher logic)

**`prompts/`:**
- Purpose: AI system prompts that define bot behavior, conversation flows, and marker directives
- Contains: Markdown files with full system prompt text
- Key files: `chat-system-prompt.md` (web widget/Chatwoot), `fb-messenger-system-prompt.md`
- Note: Prompts are embedded directly in n8n workflow node parameters — the `.md` files here are the authoritative editable source

**`demo/`:**
- Purpose: A self-contained browser demo with hardcoded mock responses (no live backend needed)
- Contains: Single `index.html` with demo controls, test scenarios, and the widget
- Key files: `demo/index.html`

**`docs/`:**
- Purpose: Human-readable setup and deployment documentation
- Contains: Setup guides and an env template
- Key files: `docs/SETUP.md`, `docs/config-template.env`

**`other-examples/`:**
- Purpose: Reference/inspiration code — NOT production code, NOT imported
- Contains: A full-stack React+Express example and a Messenger example

**`land-search-agent/`:**
- Purpose: A separate, independent project (land search agent) that lives as a nested git repo — unrelated to the chatbot
- Note: Has its own `.git`, `package.json`, Next.js frontend, Express backend — treat as separate project

## Key File Locations

**Entry Points:**
- `chat-widget/chat-widget.js`: `window.BatutynasChat.init(options)` — widget public API
- `embed-snippet.html`: Copy-paste embed code for production website
- `n8n-workflows/chat-main-v2.json`: Primary n8n workflow (import into n8n)
- `chatwoot/chatwoot-main.json`: Chatwoot channel workflow
- `n8n-workflows/fb-messenger-main.json`: Facebook Messenger workflow

**Configuration:**
- `docs/config-template.env`: Lists all required API keys and credentials
- `n8n-workflows/chat-main-v2.json`: Workflow node `"workflowId": "PASTE_YOUR_WORKFLOW_ID_HERE"` — requires manual credential wiring in n8n UI
- `n8n-workflows/fb-messenger-main.json`: `"PASTE_YOUR_FB_VERIFY_TOKEN_HERE"` — requires token substitution

**Core Logic:**
- `n8n-workflows/enrich-response-code.js`: Response enricher (marker → HTML), equipment TRAMPOLINES data, all HTML builders
- `chatwoot/enrich-chatwoot.js`: Same enrichment logic adapted for Chatwoot API card format
- `prompts/chat-system-prompt.md`: Complete AI agent system prompt including all marker documentation and conversation flow rules

**Testing:**
- `demo/index.html`: Full widget demo with 14+ mock scenarios, no backend required
- `test-groups.html`: Tests all 5 use-case groups with quick buttons
- `chatwoot/test-chatwoot.html`: Simulates Chatwoot webhook payloads
- `test-on-site.html`: Widget mounted on minimal test page

## Naming Conventions

**Files:**
- n8n workflow exports: `kebab-case.json` (e.g. `chat-main-v2.json`, `tool-booking-notify.json`)
- Extracted JS code nodes: `kebab-case.js` (e.g. `enrich-response-code.js`)
- Widget assets: `chat-widget.js`, `chat-widget.css` — descriptive, hyphenated
- Prompts: `kebab-case-system-prompt.md`
- Documentation: `SCREAMING-SNAKE-CASE.md` (e.g. `SETUP.md`, `FB-MESSENGER-SETUP.md`)

**Directories:**
- Feature/integration-named: `chat-widget/`, `chatwoot/`, `n8n-workflows/`, `prompts/`
- Lowercase hyphenated for multi-word: `land-search-agent/`, `other-examples/`

**CSS classes (in widget):**
- Prefix: `woo-chat-*` for all widget elements (e.g. `.woo-chat-window`, `.woo-chat-msg`)
- Interactive HTML from backend: `chat-*` (e.g. `.chat-options`, `.chat-option-btn`, `.chat-trampoline-grid`)

**JavaScript (in widget):**
- Global state: `state` object (module-level `let`)
- Config: `config` object (module-level `let`)
- Private functions: camelCase (e.g. `generateSessionId`, `loadSession`, `createMessageBubble`)
- Public API: `window.BatutynasChat` with methods `init`, `open`, `close`, `reset`, `setUser`

**n8n node IDs:**
- Prefixed by workflow/channel: `chat-`, `fb-`, `booking-`, `ingest-`
- Example: `chat-trigger`, `chat-agent`, `fb-extract`, `booking-email`

## Where to Add New Code

**New interactive UI component (new marker type):**
- Add marker handler to `n8n-workflows/enrich-response-code.js` (`markers` array or standalone `replace()` call)
- Add corresponding CSS classes to `chat-widget/chat-widget.css`
- Add event delegation handler to `attachDelegation()` in `chat-widget/chat-widget.js`
- Document new marker in `prompts/chat-system-prompt.md`
- If Chatwoot channel also needs it: add to `chatwoot/enrich-chatwoot.js` with Chatwoot-native equivalent

**New conversation flow / use-case group:**
- Document the flow and markers in `prompts/chat-system-prompt.md`
- Embed updated prompt in n8n workflow node (copy from `.md` file)
- If new equipment data needed: add to `TRAMPOLINES` array in both enricher files

**New n8n sub-workflow (new tool):**
- Create new workflow JSON in `n8n-workflows/`
- Add `toolWorkflow` node to `chat-main-v2.json` referencing sub-workflow
- Document tool in AI system prompt so agent knows when/how to use it

**New channel integration:**
- Create `<channel-name>-main.json` in `n8n-workflows/` or a new directory like `chatwoot/`
- Create channel-specific enricher `enrich-<channel>.js`
- Create channel-specific system prompt in `prompts/<channel>-system-prompt.md`

**CSS updates:**
- Widget styles: `chat-widget/chat-widget.css` — uses CSS custom properties (`--chat-primary`, `--chat-gradient`, etc.)
- Override primary color at runtime: pass `primaryColor` to `BatutynasChat.init()`

**Utilities / shared helpers:**
- No shared utility layer exists — embed helpers inline in the relevant file
- Equipment data (TRAMPOLINES array) is currently duplicated between enrichers — no shared module

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD architecture/planning documents
- Generated: By `/gsd:map-codebase` agent
- Committed: Yes

**`land-search-agent/`:**
- Purpose: Completely separate sub-project with its own git history
- Generated: No
- Committed: The directory is committed to this repo but has its own `.git` (nested repo)

**`other-examples/`:**
- Purpose: Reference code from prior explorations — not imported or used in production
- Generated: No
- Committed: Yes (but treat as archived reference only)

**`node_modules/`:**
- Purpose: Minimal JS dependencies (root `package.json` has very few deps)
- Generated: Yes
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-03-05*
