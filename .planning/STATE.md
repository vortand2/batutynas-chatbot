# Project State

**Project:** Batutynas.lt Chatbot
**Milestone:** M1 — Production Readiness
**Last updated:** 2026-03-05

---

## Current Phase

**Phase:** Phase 5 COMPLETE — Messenger Prep + Sync.
**Next:** M1 MILESTONE COMPLETE — All 5 phases done. Ready for production deployment.

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Security + Critical Fixes | CODE COMPLETE | Manual steps doc created; operator must execute |
| 2 — Bug Fixes + Reliability | COMPLETE | All 8 tasks (FR-3.1–FR-4.4) done |
| 3 — Accessibility + UX Polish | COMPLETE | All 10 tasks (FR-5.1–FR-6.3) done |
| 4 — Testing + Verification | COMPLETE | All 7 tasks (FR-7.1–FR-7.5 + regressions + test parity) done |
| 5 — Messenger Prep + Sync | COMPLETE | All 6 tasks (FR-8.1–FR-8.4 + FB enricher fixes + docs) done |

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
| Extract FB Messenger enricher to standalone source file | Was embedded in JSON with no source; enables proper maintenance and testing |
| Use isMessenger conditional labels (not separate functions) | Minimal code change; labels differ by only a few chars |

## Known Issues

- ~~Chatwoot API token exposed in git history~~ → FIXED: token replaced with $vars reference; git purge documented
- ~~maxOutputTokens 1024 truncates responses~~ → FIXED: raised to 4096 in both workflows
- ~~Open webhook accepts any POST~~ → FIXED: headerAuth added to webhook node
- ~~TRAMPOLINES catalog divergent across 4 files~~ → FIXED: unified to canonical Chatwoot values across all 7 files
- ~~Date picker UTC bug in widget enricher~~ → FIXED: localIso() helper avoids UTC rollover
- ~~Empty markers leak to users~~ → FIXED: catch-all regex strips unrecognized markers
- ~~BOOKING_CONFIRM malformed JSON crashes~~ → FIXED: residual detection + generic fallback
- ~~Progress bar shows 4 steps with gap~~ → FIXED: renumbered to 3 steps (Date→Guests→Equipment)
- ~~Chatwoot dedup uses only time window~~ → FIXED: two-layer dedup (message ID + content key)
- ~~No ARIA accessibility attributes~~ → FIXED: role="dialog", aria-modal, aria-live, focus trap, :focus-visible
- ~~Contrast ratio 3.8:1 on secondary text~~ → FIXED: --chat-text-light darkened to #596578 (4.5:1+)
- ~~Inline styles in enricher HTML bypass sanitizer~~ → FIXED: all style= migrated to CSS classes, 'style' removed from ALLOWED_ATTRS
- ~~Chatwoot test file duplicated (853 lines, 2 copies)~~ → FIXED: rewritten clean (~470 lines) + 8 parity gaps fixed
- ~~Widget test file 5 parity gaps~~ → FIXED: isOutOfHours, CSS class migration, progress bar, max values synced
- ~~Messenger quick reply labels exceed 20-char limit~~ → FIXED: 5 overlength labels shortened with isMessenger conditionals
- ~~FB Messenger enricher missing Phase 2-4 fixes~~ → FIXED: extracted to source file, added FR-3.1/3.2/4.1/6.1/8.2
- ~~FB Messenger enricher missing GUEST_COUNT_PUBLIC + ADDON_UPSELL handlers~~ → FIXED: added both marker handlers
- ~~FB Messenger enricher date picker UTC bug~~ → FIXED: pad2() + local date parts (same fix as widget enricher)
- ~~FB Messenger enricher no catch-all marker stripping~~ → FIXED: regex strips unrecognized markers in pushText()

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

### Phase 2 Code Changes
- `n8n-workflows/enrich-response-code.js` — FR-3.1 catch-all strip, FR-3.2 residual BOOKING_CONFIRM, FR-3.3 empty fallback, FR-3.4 birthday→public CTA, FR-4.1 UTC fix, FR-4.2 max values, FR-4.3 progress bar renumbered
- `chatwoot/enrich-chatwoot.js` — FR-3.1 catch-all strip (2 paths), FR-3.2 residual BOOKING_CONFIRM, FR-3.4 CTA threshold 40→15
- `n8n-workflows/enrich-response-code-test.js` — FR-4.2 max values, FR-4.3 progress bar renumbered
- `chatwoot/enrich-chatwoot-test.js` — FR-4.2 max values
- `n8n-workflows/chat-main-v2.json` — FR-4.2 max values, FR-4.3 progress bar, removed LOCATION_OPTIONS
- `n8n-workflows/fb-messenger-main.json` — FR-4.2 max values
- `chatwoot/chatwoot-main.json` — FR-4.2 max values, FR-4.4 two-layer dedup

### Phase 3 Code Changes
- `chat-widget/chat-widget.js` — FR-5.2 aria-modal="true", FR-5.6 focus trap (Tab cycles inside dialog), FR-6.2 removed 'style' from ALLOWED_ATTRS
- `chat-widget/chat-widget.css` — FR-5.4 contrast (#596578), FR-5.7 :focus-visible styles, FR-6.1 .booking-confirm-hours, FR-6.2 15+ CSS classes replacing inline styles, FR-6.3 prefers-reduced-motion, category bg classes (.t-bg-*)
- `n8n-workflows/enrich-response-code.js` — FR-6.1 isOutOfHours() + booking confirm qualifier, FR-6.2 all inline styles→CSS classes
- `n8n-workflows/enrich-response-code-test.js` — FR-6.1 isOutOfHours() + booking confirm qualifier, FR-6.2 all inline styles→CSS classes (synced with main enricher)
- `chatwoot/enrich-chatwoot.js` — FR-6.1 out-of-hours qualifier in buildBookingConfirm

### Phase 4 Code Changes
- `n8n-workflows/enrich-response-code-test.js` — 5 parity fixes: isOutOfHours(), CSS class migration, progress bar steps, max trampoline values synced
- `chatwoot/enrich-chatwoot-test.js` — Full rewrite: removed duplication (853→~470 lines), 8 parity fixes (pad2/localIso, buildGuestCountOptionsPublic, buildBookingConfirm null+OOH, GUEST_COUNT_PUBLIC, FR-3.1/3.2/3.3, quick replies, H-4 fallback)
- `n8n-workflows/test-markers.js` — DELETED (one-time test script)
- `chatwoot/test-markers.js` — DELETED (one-time test script)

### UX Redesign (Post-Phase 4)
- `chat-widget/chat-widget.css` — Major CSS overhaul: full-width cards, 140px images, compact grid, zoom overlay, auto-details, section styling
- `chat-widget/chat-widget.js` — Image zoom handler, data-chat-zoom in sanitizer
- `n8n-workflows/enrich-response-code.js` — compact param, data-chat-zoom, CDN URLs w=600,h=400
- `n8n-workflows/enrich-response-code-test.js` — Synced: compact param, data-chat-zoom, CDN URLs
- `chatwoot/enrich-chatwoot.js` — CDN URLs w=600,h=400
- `chatwoot/enrich-chatwoot-test.js` — CDN URLs w=600,h=400
- `chatwoot/chatwoot-main.json` — CDN URLs w=600,h=400
- `n8n-workflows/chat-main-v2.json` — CDN URLs w=600,h=400
- `preview-ux.html` — NEW: local UX preview page
- `.claude/launch.json` — NEW: local dev server config

### Phase 5 Code Changes
- `chatwoot/enrich-chatwoot.js` — FR-8.2 Messenger-specific short labels: messengerName field, buildTrampolineSelectItems, buildPurchaseSubmenu, post-booking quick replies (5 edits)
- `chatwoot/enrich-chatwoot-test.js` — FR-8.2 synced: messengerName, buildTrampolineSelectItems, buildPurchaseSubmenu, post-booking quick replies
- `n8n-workflows/fb-messenger-enricher.js` — NEW: extracted from workflow JSON + all Phase 2-4 fixes (FR-3.1 catch-all strip, FR-3.2 residual BOOKING_CONFIRM, FR-4.1 UTC fix, FR-6.1 out-of-hours, FR-8.2 short labels) + new handlers (GUEST_COUNT_PUBLIC, ADDON_UPSELL, post-booking quick replies)
- `n8n-workflows/chat-main-v2.json` — FR-8.4 jsCode synced from enrich-response-code.js (22,993→28,414 chars)
- `chatwoot/chatwoot-main.json` — FR-8.4 jsCode synced from enrich-chatwoot.js (28,809→35,799 chars)
- `n8n-workflows/fb-messenger-main.json` — FR-8.4 jsCode synced from fb-messenger-enricher.js (16,281→19,244 chars)

### GSD Initialization
- `.planning/research/STACK.md` — created by research agent
- `.planning/research/FEATURES.md` — created by research agent
- `.planning/research/ARCHITECTURE.md` — created by research agent
- `.planning/research/PITFALLS.md` — created by research agent
- `.planning/research/SUMMARY.md` — synthesized from 4 research files
- `.planning/REQUIREMENTS.md` — derived from PROJECT.md + research
- `.planning/ROADMAP.md` — 5-phase milestone plan

---

*State: 2026-03-05 (M1 Milestone COMPLETE — all 5 phases done)*
