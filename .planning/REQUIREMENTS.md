# Requirements

**Project:** Batutynas.lt Chatbot
**Derived from:** PROJECT.md + research SUMMARY.md
**Last updated:** 2026-03-05

---

## Scope

This milestone covers: security remediation, critical bug fixes, reliability improvements, UX polish, accessibility, testing, and Messenger preparation. The goal is to make the existing chatbot production-ready and launch-safe.

Out of scope: new features, architectural refactors, third-channel support, payment processing, analytics dashboard.

---

## Functional Requirements

### FR-1: Security Remediation
- **FR-1.1:** Revoke exposed Chatwoot API token and regenerate a new one
- **FR-1.2:** Purge old token from git history
- **FR-1.3:** Move Chatwoot base URL and API token to n8n workflow variables
- **FR-1.4:** Add bearer token authentication to the chat webhook endpoint
- **FR-1.5:** Document FB Messenger HMAC limitation with explicit risk acceptance

### FR-2: Critical LLM Fixes
- **FR-2.1:** Raise Gemini `maxOutputTokens` from 1024 to 4096 in all chat workflows
- **FR-2.2:** Enable "Retry on Fail" on the Gemini AI Agent node (3 retries, exponential backoff)
- **FR-2.3:** Configure workflow-level error handler that sends alert email on unhandled exceptions

### FR-3: Agent 5 Late Findings
- **FR-3.1:** Fix empty marker leak — if enricher encounters unrecognized marker text like `[MARKER_NAME]`, strip or log it instead of passing through as visible text (H-1)
- **FR-3.2:** Fix BOOKING_CONFIRM validation — add residual marker detection after enrichment; if `[BOOKING_CONFIRM` still present in output, log warning and show fallback confirmation text (H-2)
- **FR-3.3:** Fix formatOutput fallback — ensure Chatwoot enricher returns a valid response even when allMessages is empty (H-4)
- **FR-3.4:** Add birthday→public event CTA — when birthday guest count exceeds equipment capacity, suggest public event flow with `[MAIN_MENU]` (M-4)

### FR-4: Reliability Improvements
- **FR-4.1:** Fix date picker UTC bug in widget enricher — replace `toISOString()` with local date parts (match fix already in Chatwoot enricher)
- **FR-4.2:** Unify TRAMPOLINES catalog data — create canonical source, ensure identical `name`, `min`, `max` values across all 4 enricher files
- **FR-4.3:** Fix progress bar step numbering — add step 2 for location or renumber to 3-step bar
- **FR-4.4:** Improve Chatwoot deduplication — use message ID instead of 5-second time window

### FR-5: Accessibility
- **FR-5.1:** Add `aria-label` to chat toggle button
- **FR-5.2:** Add `role="dialog"` and `aria-modal="true"` to chat panel
- **FR-5.3:** Add `aria-live="polite"` to message container for screen reader announcements
- **FR-5.4:** Fix contrast ratio — darken `--chat-text-light` from `#6b7588` to `#545e6f` or darker (4.5:1 minimum)
- **FR-5.5:** Add keyboard navigation — Tab opens toggle, Enter sends message, Esc closes chat
- **FR-5.6:** Add focus trap inside open dialog
- **FR-5.7:** Add `:focus-visible` styles for all interactive elements

### FR-6: UX Polish
- **FR-6.1:** Add out-of-hours qualifier to booking confirmation message
- **FR-6.2:** Remove `style` from HTML sanitizer `ALLOWED_ATTRS` and migrate inline styles to CSS classes
- **FR-6.3:** Add `@media (prefers-reduced-motion: reduce)` to disable widget animations

### FR-7: Testing & Verification
- **FR-7.1:** Test party equipment flow end-to-end (date → location → guests → party equipment → phone → confirm)
- **FR-7.2:** Test FAQ/safety question handling via RAG
- **FR-7.3:** Test edge cases: multi-marker in single response, flow switching mid-booking, conversation reset
- **FR-7.4:** Test addon upsell flow for all groups (birthday, public event, party)
- **FR-7.5:** Verify all enricher marker handling produces correct output for every marker type

### FR-8: Messenger Preparation
- **FR-8.1:** Audit all Messenger quick reply labels against 20-character limit
- **FR-8.2:** Create short-label map for Lithuanian quick reply titles that exceed 20 chars
- **FR-8.3:** Sync FB Messenger system prompt with latest changes
- **FR-8.4:** Sync all fixed enrichment code to live n8n workflows

---

## Non-Functional Requirements

### NFR-1: Performance
- Chat response latency < 5 seconds (p95) with thinking disabled or tokens raised
- Widget initial load < 20KB minified JS + CSS

### NFR-2: Security
- No secrets in git history or committed code
- Webhook endpoints authenticated with bearer token
- HTML sanitizer blocks CSS data exfiltration via `style` attribute removal

### NFR-3: Reliability
- Gemini API failures retried 3 times before showing error fallback
- n8n workflow errors trigger email notification
- Chatwoot duplicate events deduplicated by message ID

### NFR-4: Accessibility
- WCAG 2.2 Level AA for targeted elements: chat toggle, dialog, messages, interactive buttons
- Color contrast ratio >= 4.5:1 for all text content
- Keyboard-operable without mouse

### NFR-5: Compatibility
- Web widget works on Chrome, Firefox, Safari (latest 2 versions)
- Widget responsive on screens 320px - 1920px wide
- Messenger integration compatible with FB quick reply 20-char limit

---

## Acceptance Criteria

| Requirement | Acceptance Test |
|-------------|-----------------|
| FR-1.1-1.3 | Old token returns 401; new token works from n8n variable |
| FR-1.4 | POST without bearer token returns 401; with token returns 200 |
| FR-2.1 | BOOKING_CONFIRM renders after long response with equipment + addons |
| FR-2.2 | Simulated 429 retries and eventually succeeds |
| FR-2.3 | Intentional error triggers email notification |
| FR-3.1 | Unrecognized `[FAKE_MARKER]` in response does not appear as text |
| FR-3.2 | Malformed BOOKING_CONFIRM shows fallback text, not raw marker |
| FR-4.1 | Date picker at 23:30 Lithuanian time shows correct next Saturday |
| FR-4.2 | Same equipment shown for same guest count on both web and Chatwoot |
| FR-5.1-5.7 | Screen reader can navigate chat, keyboard-only user can complete booking |
| FR-7.1 | Party equipment booking produces correct admin email |
| FR-8.1 | No Messenger quick reply labels exceed 20 characters |

---

*Requirements: 2026-03-05*
