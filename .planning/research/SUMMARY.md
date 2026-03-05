# Research Summary

**Project:** Batutynas.lt Chatbot
**Research completed:** 2026-03-05
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (1644 lines total)

---

## Critical Findings (Block Launch)

### 1. Gemini 2.5 Flash maxOutputTokens Too Low
- **Source:** STACK.md, PITFALLS.md
- **Issue:** Thinking tokens (enabled by default) consume the 1024-token `maxOutputTokens` budget. Responses truncated or empty. `BOOKING_CONFIRM` marker at response end is first casualty.
- **Fix:** Set `thinkingBudget: 0` OR raise `maxOutputTokens` to 4096+
- **Impact:** CRITICAL — affects every response, especially booking confirmations

### 2. Exposed Chatwoot API Token in Git History
- **Source:** PITFALLS.md
- **Issue:** Agent bot access token committed to git. Even if file updated, token readable in all prior commits.
- **Fix:** Revoke token in Chatwoot, purge git history with BFG, move to n8n workflow variables
- **Impact:** CRITICAL — full access to customer conversations, GDPR exposure

### 3. Open Webhook — No Auth, No Rate Limiting
- **Source:** PITFALLS.md, STACK.md
- **Issue:** `/webhook/batutynas-chat` accepts any POST. Enables cost abuse (Gemini API), fake bookings, admin email spam.
- **Fix:** Add bearer token check OR n8n Header Auth + per-session rate limiting
- **Impact:** CRITICAL — financial risk from API cost runaway

### 4. BOOKING_CONFIRM Regex Fragility
- **Source:** PITFALLS.md, ARCHITECTURE.md
- **Issue:** Regex handles only one level of JSON nesting. If LLM generates deeper nesting, confirmation card silently fails while admin email still sends.
- **Fix:** Add residual marker detection + fallback, or switch to sentinel delimiters
- **Impact:** HIGH — booking confirmation is the primary business outcome

### 5. No n8n Error Workflow
- **Source:** STACK.md
- **Issue:** Workflow crashes produce no notification. Failures visible only in n8n execution logs (unmonitored).
- **Fix:** Configure workflow-level error handler that sends alert email
- **Impact:** HIGH — silent failures go undetected

---

## Architecture Validation

### What's Correct (Keep As-Is)
- **Marker-based enrichment pattern** — decouples AI from rendering, enables multi-channel
- **Dual enrichment pipelines** — widget HTML vs Chatwoot API objects are fundamentally different; separate rendering is correct
- **`isMessenger` channel flag** — correctly confines channel branching to rendering functions only
- **Chatwoot as central hub** — single dashboard, conversation storage, channel routing
- **Phone callback booking model** — correct for Lithuanian SMB market
- **Progressive disclosure flow** — one question at a time, correct for mobile-first UX
- **`sanitizeHtml()` allowlist approach** — correct defense-in-depth for `{{HTML}}` content

### What Needs Fixing (Architecture-Level)
- **Catalog data duplicated in 4 files with divergent values** — max capacities differ between web and Chatwoot channels
- **No error workflow configured** — crashes are silent
- **No Gemini retry-on-fail** — transient 429 errors cause total failure
- **`style` attribute in sanitizer allowlist** — CSS data exfiltration vector (low priority)
- **Widget full DOM re-render** — acceptable now, consider incremental append post-launch

---

## Feature Gaps (Ranked by Impact)

### High Priority
1. **Accessibility** — No ARIA attributes, contrast failure (`#6b7588` on `#fafbfc` = 3.8:1, needs 4.5:1), no keyboard trap, no `aria-live` for new messages. European Accessibility Act risk.
2. **Out-of-hours SLA message** — Booking submitted after 21:00 gets "2 working hours" promise that can't be met until next day
3. **Agent 5 late findings** — Empty marker leak (H-1), BOOKING_CONFIRM validation (H-2), formatOutput fallback (H-4), birthday→public CTA (M-4)
4. **Date picker UTC bug** — Widget enricher uses `toISOString()` (UTC), shows wrong dates late evening in Lithuania. Fix already in Chatwoot enricher.

### Medium Priority
5. **Session resume on widget reopen** — If user has partial booking in localStorage, ask "Continue previous inquiry?"
6. **Quick reply label length** — Lithuanian labels near/exceed Messenger's 20-char limit
7. **Addon upsell context** — Show addons relevant to selected trampoline, not full generic list
8. **Progress bar skips step 2** — Jumps from step 1 (date) to step 3 (guests)
9. **Test wrapper sync** — Manual copy-paste from production; no automated verification

### Lower Priority
10. **Prompt caching** — Gemini context caching could cut 60-85% input token cost
11. **Booking step tracking** — Store step as Chatwoot custom attribute to prevent LLM "forgetting" position
12. **Responsive CSS for narrow screens** — 390px fixed width overflows on budget Android phones
13. **`prefers-reduced-motion`** — Disable widget animations for accessibility

---

## Security Remediation Priority

| # | Issue | Severity | Fix Effort |
|---|-------|----------|-----------|
| 1 | Revoke + rotate Chatwoot token | CRITICAL | 30 min |
| 2 | Purge git history | CRITICAL | 1 hour |
| 3 | Add webhook bearer token | HIGH | 30 min |
| 4 | Remove `style` from sanitizer | MEDIUM | 2 hours (CSS class migration) |
| 5 | Document FB HMAC limitation | LOW | 15 min |

---

## Phase Recommendations

### Phase 1: Security + Critical Fixes
- Revoke Chatwoot token, purge git history
- Fix maxOutputTokens (1024 → 4096)
- Add webhook auth
- Configure n8n error workflow
- Enable Gemini retry-on-fail
- Fix Agent 5 late findings (H-1, H-2, H-4, M-4)

### Phase 2: Reliability + UX Polish
- Fix date picker UTC bug in widget enricher
- Unify TRAMPOLINES catalog data (canonical source)
- Accessibility: ARIA labels, contrast fix, keyboard navigation
- Out-of-hours SLA message
- Progress bar step numbering
- Chatwoot dedup improvement (message ID based)

### Phase 3: Testing + Messenger Prep
- End-to-end party equipment flow test
- FAQ/safety question handling verification
- Edge case resilience: multi-marker, flow switching, conversation reset
- Messenger quick reply label audit (20-char limit)
- Sync all code to live n8n workflows

### Phase 4: Final Polish + Launch Prep
- Session resume prompt on widget reopen
- Addon upsell context (parameterized by selected trampoline)
- Responsive CSS for narrow screens
- Final Messenger channel testing
- Update Obsidian project documentation

---

## Open Questions (Resolved by Decision)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Gemini thinking: disable or raise tokens? | Raise to 4096 | Thinking may benefit FAQ quality; 4096 is safe margin |
| Webhook auth: bearer token or n8n Header Auth? | Bearer token in Code node | More flexible, can add rate limiting in same node |
| Catalog unification: shared JSON or build script? | Build script injecting into Code nodes | n8n Code nodes can't import; build script is pragmatic |
| Booking confirm: sentinel delimiters or fix regex? | Fix regex + add residual detection | Lower risk change; sentinel is a future improvement |
| Accessibility scope: full WCAG 2.2 or targeted? | Targeted (toggle, dialog, live region, contrast) | Full WCAG is too large; targeted fixes cover 80% of risk |

---

*Synthesis: 2026-03-05*
