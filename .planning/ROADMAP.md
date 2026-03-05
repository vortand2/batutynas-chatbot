# Roadmap

**Project:** Batutynas.lt Chatbot
**Milestone:** M1 — Production Readiness
**Created:** 2026-03-05

---

## Phase Overview

| Phase | Goal | Key Deliverables | Dependencies |
|-------|------|-----------------|-------------|
| 1 | Security + Critical Fixes | Token rotation, webhook auth, maxOutputTokens fix, error workflow | None |
| 2 | Bug Fixes + Reliability | Agent 5 fixes, date picker, catalog unification, progress bar, dedup | Phase 1 (security) |
| 3 | Accessibility + UX Polish | ARIA, contrast, keyboard nav, focus trap, out-of-hours message, sanitizer | Phase 2 (bug fixes) |
| 4 | Testing + Verification | Party flow, FAQ, edge cases, addon upsell, all marker verification | Phase 3 (polish) |
| 5 | Messenger Prep + Sync | Quick reply audit, label map, prompt sync, code sync to live n8n | Phase 4 (testing) |

---

## Phase 1: Security + Critical Fixes

**Goal:** Eliminate security vulnerabilities and fix the most impactful production bugs.

**Requirements covered:** FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-2.1, FR-2.2, FR-2.3

### Tasks

1. Revoke exposed Chatwoot API token, regenerate new one (FR-1.1)
2. Purge old token from git history using BFG Repo Cleaner (FR-1.2)
3. Move Chatwoot base URL and API token to n8n workflow variables (FR-1.3)
4. Add bearer token authentication to chat webhook (FR-1.4)
5. Document FB Messenger HMAC limitation (FR-1.5)
6. Raise Gemini maxOutputTokens from 1024 to 4096 in all workflows (FR-2.1)
7. Enable Retry on Fail on Gemini AI Agent node — 3 retries, exponential backoff (FR-2.2)
8. Create and configure n8n error workflow with email notification (FR-2.3)

### Success Criteria
- Old Chatwoot token returns 401
- Webhook without bearer returns 401
- Long AI responses (equipment + addons + BOOKING_CONFIRM) render fully
- Simulated workflow error sends notification email

### Estimated Complexity
- n8n workflow configuration changes (not code)
- Git history purge requires force-push coordination
- Bearer token requires widget embed snippet update

---

## Phase 2: Bug Fixes + Reliability

**Goal:** Fix known bugs from Agent 5 findings and research-identified reliability issues.

**Requirements covered:** FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-4.1, FR-4.2, FR-4.3, FR-4.4

### Tasks

1. Fix empty marker leak — strip unrecognized markers from enriched output (FR-3.1)
2. Fix BOOKING_CONFIRM validation — add residual marker detection + fallback text (FR-3.2)
3. Fix formatOutput fallback — handle empty allMessages in Chatwoot enricher (FR-3.3)
4. Add birthday→public event CTA when guest count exceeds capacity (FR-3.4)
5. Fix date picker UTC bug — use local date parts in widget enricher (FR-4.1)
6. Unify TRAMPOLINES data — reconcile divergent max values, create canonical source (FR-4.2)
7. Fix progress bar step numbering — add step 2 or renumber (FR-4.3)
8. Improve Chatwoot dedup — use message ID instead of time window (FR-4.4)

### Success Criteria
- No raw marker text visible to users
- Malformed BOOKING_CONFIRM shows fallback confirmation
- Date picker shows correct dates at 23:30 Lithuanian time
- Same guest count → same equipment on all channels
- Progress bar shows continuous 1-2-3-4 steps

### Estimated Complexity
- Enricher code changes in 2-4 files
- Catalog unification requires reconciling divergent values with business owner

---

## Phase 3: Accessibility + UX Polish

**Goal:** Meet targeted WCAG 2.2 AA accessibility requirements and polish remaining UX gaps.

**Requirements covered:** FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-5.5, FR-5.6, FR-5.7, FR-6.1, FR-6.2, FR-6.3

### Tasks

1. Add `aria-label` to chat toggle button (FR-5.1)
2. Add `role="dialog"` and `aria-modal="true"` to chat panel (FR-5.2)
3. Add `aria-live="polite"` to message container (FR-5.3)
4. Fix contrast: darken `--chat-text-light` to >=4.5:1 ratio (FR-5.4)
5. Add keyboard navigation: Tab/Enter/Esc handling (FR-5.5)
6. Implement focus trap inside open dialog (FR-5.6)
7. Add `:focus-visible` styles for interactive elements (FR-5.7)
8. Add out-of-hours qualifier to booking confirmation (FR-6.1)
9. Remove `style` from sanitizer ALLOWED_ATTRS, migrate to CSS classes (FR-6.2)
10. Add `@media (prefers-reduced-motion: reduce)` (FR-6.3)

### Success Criteria
- Screen reader can navigate full chat interaction
- Keyboard-only user can open chat, send message, close chat
- All text passes 4.5:1 contrast check
- No inline `style` attributes in enriched HTML output

### Estimated Complexity
- Widget JS changes (accessibility additions)
- Widget CSS changes (contrast, focus, reduced motion)
- Enricher code changes (inline style → CSS class migration)

---

## Phase 4: Testing + Verification

**Goal:** Verify all booking flows, FAQ handling, and edge cases work correctly after all fixes.

**Requirements covered:** FR-7.1, FR-7.2, FR-7.3, FR-7.4, FR-7.5

### Tasks

1. Test party equipment flow end-to-end (FR-7.1)
2. Test FAQ/safety question handling via RAG (FR-7.2)
3. Test edge cases: multi-marker, flow switching, conversation reset (FR-7.3)
4. Test addon upsell flow for all groups (FR-7.4)
5. Verify all enricher marker handling for every marker type (FR-7.5)
6. Fix any issues found during testing
7. Regression test birthday and public event flows (already validated in Cycles 1-2)

### Success Criteria
- All 5 booking groups complete without errors
- FAQ questions return relevant RAG responses
- Flow switching mid-booking resets cleanly
- Every marker type renders correctly on web widget and Chatwoot

### Estimated Complexity
- Testing agents for parallel verification
- Fix cycles for any issues found

---

## Phase 5: Messenger Prep + Sync

**Goal:** Prepare Messenger channel for activation and sync all code to production n8n workflows.

**Requirements covered:** FR-8.1, FR-8.2, FR-8.3, FR-8.4

### Tasks

1. Audit all Messenger quick reply labels against 20-char limit (FR-8.1)
2. Create short-label map for overlength Lithuanian labels (FR-8.2)
3. Sync FB Messenger system prompt with latest changes (FR-8.3)
4. Sync all fixed enrichment code to live n8n workflows (FR-8.4)
5. Final Messenger channel testing (after sync)
6. Update Obsidian WORKING-CONTEXT.md with completion status

### Success Criteria
- No Messenger quick reply label exceeds 20 characters
- Live n8n workflows contain all bug fixes
- Messenger test conversation completes booking flow
- Project documentation reflects final state

### Estimated Complexity
- Messenger label audit and creation
- n8n workflow JSON sync (careful manual step)
- End-to-end Messenger test

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Git history purge causes collaborator issues | MEDIUM | HIGH | Coordinate timing; document re-clone steps |
| Catalog unification reveals business-logic ambiguity | MEDIUM | MEDIUM | Use Chatwoot enricher values as canonical (newer) |
| Accessibility changes break existing UI | LOW | MEDIUM | Visual regression check after each change |
| n8n workflow sync introduces regression | MEDIUM | HIGH | Test each workflow individually after sync |
| Gemini 429 rate limits during testing | MEDIUM | LOW | Use retry-on-fail; test during off-peak hours |

---

*Roadmap: 2026-03-05*
