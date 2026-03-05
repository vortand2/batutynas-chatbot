# Project State

**Project:** Batutynas.lt Chatbot
**Milestone:** M1 — Production Readiness
**Last updated:** 2026-03-05

---

## Current Phase

**Phase:** Phase 1 COMPLETE (code changes). Manual steps pending — see `.planning/PHASE1-MANUAL-STEPS.md`
**Next:** Phase 2 — Bug Fixes + Reliability

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Security + Critical Fixes | CODE COMPLETE | Manual steps doc created; operator must execute |
| 2 — Bug Fixes + Reliability | NOT STARTED | Ready to start |
| 3 — Accessibility + UX Polish | NOT STARTED | Depends on Phase 2 |
| 4 — Testing + Verification | NOT STARTED | Depends on Phase 3 |
| 5 — Messenger Prep + Sync | NOT STARTED | Depends on Phase 4 |

## Completed Work (Pre-GSD)

- 2 complete test-fix cycles (Cycles 1-2): 104+ issues found and fixed
- 5-group menu system validated by client
- Birthday, public event, purchase flows operational
- Chatwoot integration with web + Messenger channels
- Widget embedded on demo page

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Raise maxOutputTokens to 4096 (not disable thinking) | Thinking may benefit FAQ quality |
| n8n Header Auth on webhook (not custom code auth) | Built-in 401 handling, simpler, more robust |
| Targeted WCAG 2.2 (not full compliance) | Full scope too large; targeted covers 80% risk |
| Fix BOOKING_CONFIRM regex + residual detection (not sentinel delimiters) | Lower risk change for current milestone |
| Use Chatwoot enricher values as canonical for catalog unification | Chatwoot enricher is newer and has correct values |

## Known Issues

- ~~Chatwoot API token exposed in git history~~ → FIXED: token replaced with $vars reference; git purge documented
- ~~maxOutputTokens 1024 truncates responses~~ → FIXED: raised to 4096 in both workflows
- ~~Open webhook accepts any POST~~ → FIXED: headerAuth added to webhook node
- TRAMPOLINES catalog divergent across 4 files (HIGH — Phase 2)
- Date picker UTC bug in widget enricher (HIGH — Phase 2)
- No ARIA accessibility attributes (HIGH — Phase 3)
- Contrast ratio 3.8:1 on secondary text (MEDIUM — Phase 3)

## User Directives

- "Take decisions on your own" — autonomous operation approved
- "Always go with the recommended option" — no need to ask for small details
- Keep Chatwoot as central hub
- Do NOT connect Messenger to production until project fully complete
- GSD first, Ralph Loop when stuck
- Always update Obsidian WORKING-CONTEXT.md after major changes

## Files Modified This Session

### Phase 1 Code Changes
- `n8n-workflows/chat-main-v2.json` — maxOutputTokens 4096, retryOnFail, headerAuth, CORS Authorization
- `n8n-workflows/fb-messenger-main.json` — maxOutputTokens 4096, retryOnFail
- `chat-widget/chat-widget.js` — authToken config, Authorization header in fetch
- `chatwoot/enrich-chatwoot.js` — chatwootBase uses $vars with fallback
- `chatwoot/chatwoot-main.json` — removed hardcoded API token, uses $vars references
- `.planning/PHASE1-MANUAL-STEPS.md` — operator manual for token rotation, git purge, error workflow
- `.planning/STATE.md` — this file

### GSD Initialization
- `.planning/research/STACK.md` — created by research agent
- `.planning/research/FEATURES.md` — created by research agent
- `.planning/research/ARCHITECTURE.md` — created by research agent
- `.planning/research/PITFALLS.md` — created by research agent
- `.planning/research/SUMMARY.md` — synthesized from 4 research files
- `.planning/REQUIREMENTS.md` — derived from PROJECT.md + research
- `.planning/ROADMAP.md` — 5-phase milestone plan

---

*State: 2026-03-05*
