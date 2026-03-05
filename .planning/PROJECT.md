# Batutynas Chatbot

## What This Is

A complete chatbot system for batutynas.lt (Lithuanian trampoline park rental business) that handles booking inquiries, equipment selection, and customer support across two channels — a custom web widget embedded on the website and Facebook Messenger — both managed through a single Chatwoot dashboard. The chatbot guides customers through 5 use-case flows (birthday parties, public events, parties, trampoline purchases, and FAQ/safety) with interactive UI elements that adapt per channel.

## Core Value

A busy parent (middle-aged mom with a child in hand) can complete an entire equipment booking inquiry with one hand, in under 2 minutes, without confusion — and the business owner receives a structured lead with all necessary details to call back.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Cycles 1-2 verified these. -->

- ✓ 5-group menu system organized by use case (not equipment type) — existing
- ✓ Birthday/Christening flow: date → location → guests → catalog (standard + mega only) → addons → phone → confirm — existing
- ✓ Public Event flow: date → location → guests (public buckets) → catalog (big parks first) → addons → phone → confirm — existing
- ✓ Party flow: date → location → guests → party equipment (disco, foam show, banquet tables) → phone → confirm — existing
- ✓ Purchase flow: catalog by email OR custom manufacturing form — existing
- ✓ Safety/FAQ/Contacts: RAG knowledge base answers — existing
- ✓ Chatwoot as central hub with web + Messenger channels — existing
- ✓ Marker system: AI outputs markers, enrichment code renders interactive UI (cards, forms, selects) — existing
- ✓ Channel-aware rendering: web gets rich cards/forms, Messenger gets text + quick reply buttons — existing
- ✓ Guest count filtering: recommends equipment by guest count with fallback — existing
- ✓ Free gift mention during addon upsell — existing
- ✓ Booking confirmation with structured JSON for business owner — existing
- ✓ n8n workflow backend with Gemini 2.5 Flash + Pinecone RAG — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Fix Agent 5 late findings: empty marker leak, BOOKING_CONFIRM validation, formatOutput fallback, birthday→public CTA
- [ ] Party equipment flow end-to-end testing and polish
- [ ] FAQ/safety question handling verification
- [ ] Edge case resilience: multi-marker handling, flow switching, conversation reset
- [ ] Addon upsell flow polish (all groups)
- [ ] Address/location input UX improvement
- [ ] Widget accessibility: focus trap, aria-modal, keyboard navigation
- [ ] Widget fetch timeout and error recovery
- [ ] Sync all fixed enrichment code to live n8n workflow
- [ ] Sync FB Messenger prompt to live n8n workflow
- [ ] Security: revoke exposed Chatwoot API token, purge from git history
- [ ] Security: move webhook URLs and API keys to environment variables
- [ ] Final Messenger channel testing (after all code synced)
- [ ] n8n maxOutputTokens review (1024 may truncate long responses)

### Out of Scope

<!-- Explicit boundaries. -->

- Final Messenger production connection — wait until project fully complete per user directive
- Inline image cards in Messenger — requires Meta template message approval
- Mobile app — web widget + Messenger covers all channels
- Payment processing — business model is phone callback, not online checkout
- Multi-language support — Lithuanian only for now
- Analytics dashboard — defer to post-launch
- Automated follow-up messages — business owner handles callbacks manually

## Context

- **Business**: Batutynas.lt rents trampolines and event equipment for private/public events across Lithuania
- **Client feedback** (2026-03-04): Validated 5-group menu, confirmed equipment filtering rules (no big parks for birthdays — too large + insufficient electrical power), confirmed party equipment catalog
- **Equipment catalog**: 20 items total — 13 trampolines (3 big parks, 4 mega, 6 standard) + 7 other equipment (disco pavilion, foam show, banquet tables/chairs, dart, cotton candy, popcorn)
- **Customer profile**: Busy Lithuanian parents booking kids' birthday parties (primary), event organizers (secondary), trampoline buyers (tertiary)
- **UX directive**: "Simple enough for a middle aged mom with a child in her hand" — every interaction must be tappable, no typing required where possible, clear visual hierarchy
- **Prior work**: 2 complete test-fix cycles (Cycles 1-2), 104+ issues found and fixed across all 4 production files
- **Codebase map**: `.planning/codebase/` — 7 documents covering stack, architecture, conventions, integrations, concerns

## Constraints

- **Tech stack**: n8n workflows (v2.8.3) + Chatwoot + Gemini 2.5 Flash + Pinecone — locked, no migration
- **n8n sandbox**: Uses `var` (not const/let), limited JS runtime
- **Messenger limits**: 20-character quick reply titles, no markdown, no rich cards
- **Chatwoot content types**: text, cards, input_select, form — no custom types
- **Widget**: Vanilla JS/CSS, no framework — must stay lightweight for embed
- **Language**: All user-facing text in Lithuanian
- **Delivery**: Kaunas, Vilnius, Klaipeda, Siauliai, Panevezys, Silute — no expansion planned

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chatwoot as central hub | Unified dashboard for web + Messenger, business owner uses one tool | ✓ Good |
| 5-group menu by use case | Client feedback: customers think in "what event" not "what equipment" | ✓ Good |
| Marker system for UI rendering | Decouples AI response from UI — AI writes markers, code renders per channel | ✓ Good |
| No big parks in birthday flow | Client: too large for private events + insufficient electrical power | ✓ Good |
| Phone callback model | Business prefers to call customers back rather than online booking | ✓ Good |
| GSD + Obsidian + Ralph Loop | GSD for dev phases, Obsidian for persistent memory, Ralph Loop for iteration | — Pending |
| One fix agent per file | Prevents merge conflicts during parallel fix cycles | ✓ Good |
| Gemini 2.5 Flash over GPT-4 | Cost-effective for Lithuanian language, fast response times | ✓ Good |

---
*Last updated: 2026-03-05 after GSD initialization*
