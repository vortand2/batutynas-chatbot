# Project State

**Project:** Batutynas.lt Chatbot
**Milestone:** M1 — Production Readiness
**Last updated:** 2026-03-05

---

## Current Phase

**Phase:** Not started (GSD initialization complete, ready for `/gsd:plan-phase 1`)

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Security + Critical Fixes | NOT STARTED | Ready to plan |
| 2 — Bug Fixes + Reliability | NOT STARTED | Depends on Phase 1 |
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
| Bearer token auth on webhook (not n8n Header Auth) | More flexible for rate limiting |
| Targeted WCAG 2.2 (not full compliance) | Full scope too large; targeted covers 80% risk |
| Fix BOOKING_CONFIRM regex + residual detection (not sentinel delimiters) | Lower risk change for current milestone |
| Use Chatwoot enricher values as canonical for catalog unification | Chatwoot enricher is newer and has correct values |

## Known Issues

- Chatwoot API token exposed in git history (CRITICAL — Phase 1)
- maxOutputTokens 1024 truncates responses (CRITICAL — Phase 1)
- Open webhook accepts any POST (CRITICAL — Phase 1)
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

- `.planning/research/STACK.md` — created by research agent
- `.planning/research/FEATURES.md` — created by research agent
- `.planning/research/ARCHITECTURE.md` — created by research agent
- `.planning/research/PITFALLS.md` — created by research agent
- `.planning/research/SUMMARY.md` — synthesized from 4 research files
- `.planning/REQUIREMENTS.md` — derived from PROJECT.md + research
- `.planning/ROADMAP.md` — 5-phase milestone plan
- `.planning/STATE.md` — this file

---

*State: 2026-03-05*
