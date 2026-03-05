# Feature Landscape: Conversational Booking Chatbot Best Practices

**Domain:** Conversational booking chatbot for event rental business (trampoline park equipment)
**Researched:** 2026-03-05
**Confidence:** MEDIUM-HIGH (web research verified across multiple sources; Lithuanian-specific data is LOW confidence due to sparse ecosystem)

---

## Context: What This Document Is For

This document captures current best practices for the Batutynas.lt brownfield chatbot project. The system is largely built. Research here targets the **polishing layer**: what gaps exist between the current implementation and industry best practice, and which improvements will have the highest impact on conversion, UX quality, and reliability.

The existing system already does many things right: progressive disclosure (one question at a time), marker-driven UI components, phone-callback model, multi-channel support (web widget + Messenger), and Lithuanian-first language. The findings below focus on gaps and refinements.

---

## 1. Conversation Flow UX Patterns

### 1.1 Progressive Disclosure — Current vs Best Practice

**Current state:** The system collects fields one at a time in a fixed sequence (date → location → guests → equipment → addons → phone). This is correct.

**Best practice gaps to address:**

**Smart field skipping is implemented but needs validation.** The prompt says "praleisk žingsnius, jei klientas jau pateikė informaciją" (skip steps if info already provided). Industry evidence confirms this is the right pattern (reducing steps increases completion rates). However, partial information handling — "birželio šventė Šilalėje" where the date is ambiguous — should be explicitly tested. A user who provides a month but not a day should always see the date picker, not have the bot guess.

**After-first-step escape hatch is good, but placement matters.** The prompt says to mention "parašykite meniu" after the first step. Research confirms users who feel trapped abandon at high rates. The current placement (after step 1) is appropriate. Consider: if a user explicitly changes their mind mid-flow (e.g., switches from birthday to public event), the system should detect this and offer the main menu proactively, not wait for the user to know the "meniu" keyword.

**Confirmation step before submission is correctly implemented.** The BOOKING_CONFIRM marker generates a summary card before the booking_notify tool fires. This matches industry best practice for booking flows: show a brief summary for review before committing. Do not remove this step.

**Recommended pattern — flow escape detection:**
If the user writes something that clearly indicates intent to switch (e.g., "actually, I meant a public event"), the system should respond:
> "Žinoma! Pradėkime iš naujo." + [MAIN_MENU]
...rather than continuing the current flow and requiring the user to know the magic word.

### 1.2 Error Recovery

**Current state:** The prompt covers escalation conditions (2+ failed attempts, user frustration, complex requests). It handles booking_notify failures with a phone fallback message.

**What is missing — mid-flow error recovery:**

| Failure scenario | Current handling | Best practice |
|------------------|------------------|---------------|
| User provides out-of-range date (past, too far future) | Not explicitly defined | Acknowledge, explain constraint, re-show picker |
| User provides location outside delivery zone | Handled — redirect to public event or phone | Good |
| User provides guest count outside any equipment capacity (e.g., 2 guests) | Partially handled (Pilis mažiesiems) | Ensure Pilis mažiesiems is always surfaced for <5 guests |
| booking_notify API failure | Handled — phone fallback | Good |
| User sends completely off-topic message mid-flow | Handled — brief answer + redirect | Good |

**Blame-free error language (HIGH confidence):** Research from allgpts.co confirms the critical pattern: never phrase errors as user fault. Current prompt uses warm Lithuanian language ("Atsiprašau, kilo techninė klaida") — this is correct. Extend this principle consistently to all validation messages.

**Retry limit before escalation:** After 2 consecutive misunderstood messages on the same question, proactively offer phone contact. Current prompt triggers escalation "after 2+ attempts of user frustration" — this is the correct threshold.

### 1.3 Flow Switching Mid-Conversation

**Current state:** The prompt explicitly handles the case where a user wants to switch from one booking type to another (birthday → public event). The instruction is to show [MAIN_MENU] and start a new booking.

**Gap:** There is no explicit handling for a user who wants to go back one step (not restart entirely). Example: user selected a trampoline but then says "wait, can I change the date?" Industry pattern is to accept the correction and continue from that point without restarting.

**Recommendation:** The existing prompt partially handles this ("jei klientas nori pakeisti anksčiau pateiktą informaciją — priimk pakeitimą ir tęsk nuo tos vietos"). This is correct. Ensure this is tested for all 6 steps, not just recent ones. Specifically: can a user change their chosen trampoline after seeing the addon upsell? This case should be tested explicitly.

---

## 2. Equipment Catalog Recommendation Patterns

### 2.1 Guest-Count Filtering — Current State is Strong

**Current implementation:** The system uses `[MENU_GROUP_BIRTHDAY:N]` with the guest count embedded in the marker. The JS/n8n layer filters the 20-item catalog by capacity. This follows industry best practice for contextual product recommendation in rental chatbots.

**The recommendation logic in the prompt is correct:**
- Up to 6 guests → Pilis mažiesiems or compact trampolines
- 6-12 → Compact trampolines
- 10-15 → Mega trampolines
- 15+ → Mega + Mega ruožas

**Gap — overlap zone (10-12 guests):** Both compact and mega trampolines are valid for 10-12 guests. The prompt recommends mega trampolines for 10-15 guests, but compact trampolines support up to 12. Users in this range might benefit from the bot explicitly naming the tradeoff: "For 10-12 guests, compact trampolines are a great fit, but the Mega series gives more space and extra features — here's both."

**Gap — toddler events (christenings):** The prompt has specific handling for christenings (krikštynos), recommending Pilis mažiesiems for toddlers and adult entertainment addons. This is correct. Research on party rental chatbots shows that age-group filtering is the most-requested feature by rental business owners. The current implementation covers this.

### 2.2 Upselling Addons — Framework is Correct, Execution Needs Refinement

**Current state:** The [ADDON_UPSELL] marker appears as an optional step 5 in the birthday flow. The prompt frames it positively: "su kiekvienu batutu gausite 1 nemokamą dovaną pasirinkimui" (with every trampoline you get 1 free gift of your choice).

**The free gift anchor is a strong conversion tactic.** Research from quidget.ai confirms that bundle/package framing significantly increases addon uptake compared to presenting addons as additional costs. The free gift mention before showing paid addons is the correct sequence.

**Timing is correct:** Addon upsell happens after equipment selection, not before. Research confirms recommendations work best when contextual (user has already committed to a base product).

**Gap — addon specificity:** The [ADDON_UPSELL] marker shows a generic addon menu. Best practice from rental upselling research suggests showing 2-3 addons most relevant to the already-selected trampoline and guest count, rather than a full list. For example:
- User selects Mega Waikiki for 15 kids → prominently feature Milžiniškas Dart (high throughput, tournament format), Rodeo bulius (adult-friendly)
- User selects Pilis mažiesiems for 5 toddlers → prominently feature Burbulų mašina, Instax fotoaparatas (gentle, photo-friendly)

This requires either prompt-layer logic (mention relevant addons before showing the marker) or a parameterized [ADDON_UPSELL:trampoline_id] marker at the widget/n8n layer. Either approach is viable.

**Gap — second free gift prompt:** The prompt offers 1 free gift but does not mention paid addons until the addon upsell step. Consider: if a user selects their free gift and closes the addon menu, the bot could add one soft mention: "Rodeo bulius ir Disco paviljonas populiariausi su tokio dydžio šventėmis — norėtumėte pridėti?" This is one additional touchpoint, not pushy, and aligns with "adding value first" research findings.

### 2.3 Anti-Pattern: Over-Cataloging

**Avoid showing the full 20-item catalog unfiltered.** The current system always filters by guest count when a number is known. This is correct. Do not add a "browse all" path that bypasses filtering unless the user explicitly requests it (e.g., "show me everything you have").

---

## 3. Phone Callback Booking Model

### 3.1 The Model is Appropriate for This Business

Industry research confirms the phone callback model (chatbot collects lead → business calls back) is the standard approach for:
- SMB service businesses where pricing is negotiated
- High-consideration purchases (party planning involves discussion)
- Markets where customers expect personal contact (Lithuanian market strongly favors direct communication)

The current framing in the prompt is correct: "tai yra užklausa, o ne patvirtintas užsakymas. Mūsų komanda peržiūrės prašymą ir susisieks per 2 darbo valandas." (This is a request, not a confirmed booking. Our team will review and contact you within 2 working hours.)

**Do not switch to instant online booking without a business conversation about pricing, availability, and deposit handling first.** The current model avoids all of these complexities.

### 3.2 Contact Capture Timing — Currently Optimal

**Current placement:** Phone number is collected as the last step (step 6), after the user has invested effort selecting date, location, guests, and equipment.

**Research validation:** Lead capture best practice is "earn the right to ask for contact information" — users who have made equipment selections are pre-qualified and committed enough to provide a phone number. Asking for phone at step 1 would cause abandonment. Current placement is correct.

**The "vardas ir telefono numeris vienu klausimu" (name and phone in one question) exception** from the "one step at a time" rule is pragmatic and justified. Research shows that when users are in "confirmation mode" (they've selected everything), a single combined contact request is not experienced as friction.

### 3.3 Gap: Response Time Expectation Setting

**Current state:** The prompt says "susisieks per 2 darbo valandas" (will contact within 2 working hours).

**Gap:** No handling of out-of-hours submissions. If a user submits at 22:00, the 2-hour promise cannot be met until the next business day. This creates a trust gap.

**Recommendation:** Add time-aware logic or a simple qualifier:
> "Jūsų užklausa pateikta! Susisieksime per 2 darbo valandas. Jei pateikėte po darbo valandų (8:00-21:00) — susisieksime kitą darbo dieną."

This sets correct expectations without disappointing users. It can be static text in the confirmation step.

### 3.4 Gap: Booking Abandonment Recovery

**Current state:** No explicit handling of incomplete flows (user drops off mid-booking).

**Research finding:** Recovery campaigns targeting users who reached a late step (equipment selected but no phone number) have 10-30% completion rates when re-engaged. For a single-owner business, this is lower priority but worth noting. A simple "session persistence" mechanism already exists (localStorage, 24-hour TTL). The gap is: if a user reopens the widget within the TTL window, should the bot ask "Tęsti ankstesnį užsakymą?" (Continue previous booking?) rather than showing the welcome screen again.

**Recommendation (medium priority):** On widget reopen, if a session has a partially complete booking (has date but not phone), show: "Grįžote! Norite tęsti ankstesnę užklausą?" with a Yes/No quick reply. This is achievable in the current architecture by checking state.messages on init.

---

## 4. Multi-Channel UX Differences

### 4.1 Web Widget vs Messenger — Current Handling is Correct

The two channels have separate system prompts, which is correct architecture. Key differences:

| Aspect | Web Widget | Facebook Messenger | Current handling |
|--------|------------|-------------------|------------------|
| Markdown | Supported (bold, bullets) | Not supported | Correctly separated — Messenger prompt explicitly forbids ** and # |
| Message length | 1-3 paragraphs acceptable | 1-2 paragraphs max | Correctly shorter in Messenger prompt |
| Emoji | Brand decision | Appropriate and common | Messenger prompt allows emoji, web prompt does not |
| Rich UI | Full cards, carousels, forms | Quick replies + button templates | Both use same marker system (marker rendering differs per channel) |
| Persistence | localStorage session | Messenger thread (Meta handles persistence) | Not applicable at prompt layer |

**Gap — Messenger button limits.** Facebook Messenger's generic template supports up to 3 buttons per card. Quick replies support up to 13 items. If any marker renders more than 3 action buttons per card in Messenger, users on mobile will see truncated options. This requires validation at the widget/n8n rendering layer, not the prompt layer.

**Gap — Messenger character limits.** Text messages in Messenger are limited to 2000 characters per bubble. The web widget prompt has no such limit but the CSS/JS widget renders long messages gracefully. Ensure the Messenger n8n workflow enforces message splitting for any response that might exceed 2000 characters.

### 4.2 Mobile-First Design for Web Widget

**Current state:** CSS uses `--chat-width: 390px` and `--chat-height: 560px`. The toggle button is 60x60px. These dimensions are appropriate for desktop but need validation on mobile.

**Research finding (HIGH confidence, NN/G):** Minimum touch target size is 44x44px (Apple HIG) or 48x48dp (Google Material). The current 60px toggle button meets this requirement comfortably.

**Gap — chat window on small screens:** A fixed 390px width widget will overflow on screens narrower than ~430px (common on older budget Android phones, which are prevalent in the Lithuanian market). Check if the CSS has a responsive breakpoint for widths below 400px. If not, add `max-width: calc(100vw - 24px)` or similar.

**Gap — keyboard viewport overlap on mobile:** When the virtual keyboard opens on mobile, it can cover the chat input field. This is a known chatbot widget issue. Test with iOS Safari and Chrome Android specifically. If the input is obscured, add `scroll-padding-bottom` or use `visualViewport` API to adjust widget position when keyboard is open.

**One-handed use:** The current bottom-right toggle position is optimal for right-handed one-handed use (the most common mobile pattern). Do not move it to bottom-left or center. The input field at the bottom of the chat panel is also thumb-accessible. This is correct.

### 4.3 Consistent Cross-Channel Experience

**What must be identical:** Core information (prices policy, delivery zones, equipment catalog, safety rules), booking flow steps, and brand voice.

**What should differ:** Message length, formatting, emoji use, and the degree of visual richness.

**Drift risk:** The two system prompts are currently maintained separately. If one is updated (e.g., new equipment added), the other must also be updated. This is the primary cross-channel consistency risk. The Džiumandži parkas availability date (nuo 2026 m. pavasario) appears in both prompts — good. But maintaining parity manually is error-prone.

**Recommendation:** Add a comment block at the top of each prompt file: `# Sync check: last updated YYYY-MM-DD. Mirror changes to [other prompt file].` This is a process control, not a technical one.

---

## 5. Accessibility Patterns

### 5.1 WCAG 2.2 Level AA — Current State Unknown

The chat-widget.js and chat-widget.css were reviewed. No explicit ARIA attributes are visible in the first 100 lines of the JS. The CSS does not define `:focus-visible` styles beyond the browser default.

**Required accessibility features (HIGH confidence, WCAG 2.2):**

| Requirement | Standard | Current state | Priority |
|-------------|----------|---------------|----------|
| Chat toggle button has `aria-label` | WCAG 4.1.2 | Not verified in JS snippet | HIGH |
| Chat panel has `role="dialog"` and `aria-modal="true"` | WCAG 4.1.2 | Not verified | HIGH |
| New bot messages announced via `aria-live="polite"` | WCAG 1.3.1 | Not verified | HIGH |
| All interactive buttons have visible `:focus-visible` style | WCAG 2.4.11 (2.2 new) | Not verified | MEDIUM |
| Color contrast ≥ 4.5:1 for all text | WCAG 1.4.3 | Purple (#6C3CE1) on white passes; light grey (#6b7588) on white (#fafbfc) may be marginal | MEDIUM |
| Keyboard: Tab opens toggle, Enter sends message, Esc closes | WCAG 2.1.1 | Not verified | HIGH |
| Focus trapped inside open dialog (not behind page) | WCAG 2.1.2 | Not verified | HIGH |

**WCAG 2.2 adds new criteria (2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8):** The most relevant new criterion for chatbots is **2.5.8 Target Size (Minimum)** — interactive targets must be at least 24x24px (CSS). All current button sizes appear to exceed this based on the CSS review.

**Color contrast check for `--chat-text-light: #6b7588` on `--chat-messages-bg: #fafbfc`:**
The contrast ratio is approximately 3.8:1 — this fails WCAG AA (requires 4.5:1 for normal text). This is used for timestamps and secondary text. Either darken the text color or ensure it is only applied to decorative/non-essential text (which would be exempt).

### 5.2 Screen Reader Specific Requirements

**Chat message flow:** Each new bot message must trigger an `aria-live` announcement so screen reader users know a response arrived. Without this, the user types into a form and hears nothing.

**Interactive cards (equipment cards with buttons):** Each card must have a meaningful accessible name. A button labeled "Pasirinkti" (Select) is ambiguous — screen readers need "Pasirinkti Mega Rocket" or an `aria-describedby` pointing to the card title.

**Date picker:** If [DATE_PICKER] renders as a custom component (not a native `<input type="date">`), it requires full keyboard operability and ARIA calendar widget roles (`role="grid"`, `role="gridcell"`, `aria-selected`).

### 5.3 Mobile Accessibility

**Touch targets:** 60px toggle button passes. Quick reply buttons should be minimum 44px tall (verify in CSS). If they are rendered as inline chips, ensure adequate height and spacing.

**Pinch-zoom:** The widget must not disable pinch-zoom. Avoid `user-scalable=no` in the host page's viewport meta tag. The widget itself should not interfere with page zoom.

**Reduce Motion:** If the widget uses CSS animations (transitions are present in the CSS), add `@media (prefers-reduced-motion: reduce)` to disable or reduce animations for users who have enabled this OS-level setting.

---

## 6. Lithuanian Market and Language-Specific UX

### 6.1 Lithuanian Language Characteristics Affecting Chatbot UX

**Confidence: MEDIUM** — Based on linguistic knowledge and Tilde.ai research, cross-referenced with UX localization best practices.

**Lithuanian is a highly inflected language.** This has direct UX implications:

1. **Place names change form (declension).** "Tauragė" (nominative) becomes "Tauragėje" (locative, "in Tauragė"). The current prompts correctly use locative case when referring to location ("vyks Tauragėje"). This is correct but must be maintained consistently in any new responses or UI strings.

2. **Names are inflected.** A user named "Jonas" would be addressed as "Jonai" (vocative) in formal greeting. The current system collects names but uses them in booking confirmation JSON, not for direct address. This is safe — no inflection errors are possible when names are displayed in confirmation cards rather than embedded in sentences.

3. **Gender-specific adjectives.** "Puiku!" (Great!) is gender-neutral — correct choice. Avoid phrases that require gender agreement when the user's gender is unknown (most adjectives in Lithuanian agree with gender).

4. **Informal vs. formal register.** Lithuanian has two registers for "you": "tu" (informal) and "jūs" (formal/plural). The current prompts use "jūs" throughout, which is appropriate for a service business communicating with parents. Do not switch to "tu" unless the business owner requests it.

### 6.2 Lithuanian Market Context

**Confidence: MEDIUM** — Based on Tilde.ai case study and general Baltic market knowledge.

**Trust signals matter more in the Lithuanian market than in Western European markets.** The business was founded in 2015, holds EN14960 certification, and has a local phone number (+370). These should remain visible and prominent. The "no upfront payment" policy ("jokių išankstinių mokėjimų") is a strong trust signal and should continue to be mentioned proactively.

**Phone preference:** Lithuanian SMB customers strongly prefer to resolve uncertainty by phone. The chatbot's escalation path (providing the phone number +370 648 803 88 prominently) is correct. Do not hide or de-emphasize the phone number to force digital completion.

**Facebook dominance:** Facebook/Messenger remains the primary social channel in Lithuania for businesses of this type. The Messenger integration is strategically correct and should remain a first-class channel.

**Working hours expectation:** The business operates 8:00-21:00 every day. Lithuanian parents planning birthday parties often research and inquire in the evenings (21:00+) and on weekends. The chatbot's 24/7 availability is a genuine competitive advantage for this market. The booking request model (not requiring live staff) is well-suited to evening inquiry patterns.

### 6.3 Language Switching

**Current state:** The widget auto-detects browser language, defaults to Lithuanian, and falls back to Lithuanian if browser language is not in the LANGUAGES object (lt, en). The AI prompt handles responses in the language the user writes in.

**Gap:** The Messenger channel has no language switching — it relies on the AI detecting the input language. This is correct for Messenger (no UI for language switching). However, if a user starts in Lithuanian on Messenger and switches to English mid-conversation, the AI should follow. Current Messenger prompt says "Visada atsakyk ta kalba, kuria klientas rašo" (Always reply in the language the customer writes in) — this is correct.

**Consider:** Should the web widget offer an explicit English button for the ~5-10% of inquiries that might come in English (Russian-speaking minority community in Lithuania, foreign residents)? Current implementation supports this via language toggle. Ensure this feature is working correctly and visible.

### 6.4 Date Formatting

**Lithuanian date format:** DD/MM/YYYY or "YYYY m. MMMM D d." (e.g., "2026 m. kovo 15 d."). The [DATE_PICKER] component and BOOKING_CONFIRM JSON use ISO format (YYYY-MM-DD) internally, which is correct for machine processing. Ensure that when dates are displayed to users in confirmation cards, they are formatted in the Lithuanian convention, not ISO.

---

## 7. Table Stakes vs Differentiators

### Table Stakes — Features users expect; missing = product feels incomplete

| Feature | Why Expected | Current State | Gap |
|---------|--------------|---------------|-----|
| One-question-at-a-time flow | Reduces cognitive load; industry standard for booking | Implemented | None |
| Equipment visual cards with photos | Rental decision requires seeing the product | Implemented via markers | Verify images load on Messenger |
| Guest count filtering | Users want relevant options only | Implemented | Test overlap zone (10-12) |
| Clear no-upfront-payment policy | Reduces booking anxiety | Implemented in prompts | Make visible earlier in flow |
| Human escalation path | Users need escape hatch | Implemented | None |
| Booking confirmation summary | Trust signal before submission | Implemented (BOOKING_CONFIRM) | None |
| Session persistence (24h) | Users interrupted mid-booking | Implemented (localStorage) | Add resume prompt on reopen |
| Multi-language support (LT/EN) | Lithuanian market has English speakers | Implemented | Test English path end-to-end |

### Differentiators — Features that set product apart

| Feature | Value Proposition | Current State | Gap |
|---------|-------------------|---------------|-----|
| Free gift anchor at addon upsell | Softens perceived cost of addons; unique framing | Implemented | Could be more prominent |
| Smart location delivery check | Instant answer to "do you deliver to my city" | Implemented | None |
| Age-specific equipment recommendations | Christening toddler vs teenage party are different | Implemented | Test christening flow specifically |
| Phone callback within 2h SLA | Personal service vs generic online booking | Implemented | Add out-of-hours caveat |
| Interactive date picker with upcoming Saturdays | Most birthday parties are Saturdays; saves user effort | Implemented | Verify Saturday pre-selection logic |

### Anti-Features — Explicitly do NOT build these

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Online payment / deposit collection | Business model is phone callback; adding payment creates legal, UX, and integration complexity disproportionate to benefit | Keep phone callback model |
| Real-time availability calendar | Would require backend inventory management system the business does not have | State "subject to availability, team confirms by phone" |
| Price display in chat | Business explicitly hides prices for negotiation; showing them would undermine the callback model | Continue "pagal užklausą" (by request) pattern |
| Fully automated booking confirmation (no human step) | Equipment is physically delivered; date conflicts, route planning, and setup logistics require human review | Phone callback is correct for this scale |
| WhatsApp integration | Low priority for Lithuanian market vs Messenger; adds maintenance burden without proportional reach | Focus on web + Messenger |

---

## 8. Phase-Specific Improvement Recommendations

### High Priority (Polish Phase)

1. **Accessibility audit of chat-widget.js** — Add `aria-label` to toggle button, `role="dialog"` to panel, `aria-live="polite"` to message container, keyboard trap in open dialog, `:focus-visible` styles. This is a critical gap with direct legal implications in EU markets (European Accessibility Act enforcement begins June 2025 for new services).

2. **Color contrast fix** — `--chat-text-light: #6b7588` fails WCAG AA. Darken to approximately `#5a6375` or limit use to decorative-only text.

3. **Mobile keyboard overlap** — Add `visualViewport` listener or `scroll-padding-bottom` to ensure input field stays visible when virtual keyboard opens on iOS Safari.

4. **Out-of-hours confirmation message** — Add time-aware qualifier to the post-booking message so users submitted after 21:00 understand the next contact will be next business day.

5. **Parameterized addon upsell** — Pass selected trampoline ID to [ADDON_UPSELL] so the n8n/widget layer can rank addons by relevance to the selected equipment and guest count.

### Medium Priority (Next Milestone)

6. **Session resume prompt** — On widget reopen with an incomplete session (has messages but no BOOKING_CONFIRM), ask: "Grįžote! Norite tęsti ankstesnę užklausą?" This recovers a portion of abandons.

7. **Explicit flow switch detection** — Add pattern recognition in the prompt for clear intent-change phrases (e.g., "ne, norėjau...") to trigger [MAIN_MENU] proactively without requiring user to know the "meniu" keyword.

8. **Responsive breakpoint for narrow screens** — Add CSS media query for screen widths below 400px to prevent the 390px fixed-width widget from overflowing viewport on budget Android phones.

9. **Date format localization in BOOKING_CONFIRM** — Ensure the confirmation card renders dates in Lithuanian format ("kovo 15 d.") rather than ISO format ("2026-03-15") when displaying to users.

### Lower Priority (Maintenance)

10. **Prompt sync process** — Add a sync note to both prompt files and establish a checklist when catalog or policy changes are made to ensure both channels stay in parity.

11. **Messenger card button limit validation** — Audit each marker's Messenger rendering to confirm no card exceeds 3 buttons (Messenger generic template limit). Reduce or split if needed.

12. **`prefers-reduced-motion` CSS** — Add `@media (prefers-reduced-motion: reduce)` to disable widget open/close animations for users who have this OS setting enabled.

---

## Sources

- [Chatbot UX Design: Parallelhq](https://www.parallelhq.com/blog/chatbot-ux-design) — Progressive disclosure, flow management, error recovery (MEDIUM confidence)
- [10 Chatbot Error Handling Strategies: Allgpts.co](https://allgpts.co/blog/10-chatbot-error-handling-and-recovery-strategies/) — Error recovery patterns (MEDIUM confidence)
- [7 Chatbot Techniques for Upselling: Quidget.ai](https://quidget.ai/blog/ai-automation/7-chatbot-techniques-for-upselling-and-cross-selling/) — Addon recommendation patterns (MEDIUM confidence)
- [Multichannel Chatbot Design: Khoros](https://khoros.com/blog/multichannel-design-how-to-create-1-chatbot-whatsapp-facebook-messenger-web) — Web vs Messenger differences (MEDIUM confidence)
- [Chatbot Accessibility: Make Things Accessible](https://www.makethingsaccessible.com/guides/chatbots-and-web-accessibility-addressing-usability-issues-and-embracing-inclusive-design/) — WCAG requirements (HIGH confidence)
- [Webchat Accessibility WCAG: Cognigy](https://www.cognigy.com/product-updates/webchat-accessibility-wcag-best-practices) — WCAG 2.2 AA baseline (HIGH confidence)
- [Touch Target Size: NN/G](https://www.nngroup.com/articles/touch-target-size/) — Mobile touch target minimums (HIGH confidence)
- [Lithuanian Language Technology: Tilde.ai](https://tilde.ai/case-study/language-technology-developer-we-are-lithuanians-so-technology-has-to-speak-to-us-in-lithuanian/) — Lithuanian market context (MEDIUM confidence)
- [Lead Generation Chatbot 2025: Vendasta](https://www.vendasta.com/blog/ai-chatbot-for-lead-capture/) — Phone callback lead capture model (MEDIUM confidence)
- [Booking Abandonment Recovery: Quickchat AI](https://quickchat.ai/post/chatbot-cart-abandonment) — Session resume patterns (MEDIUM confidence)
- [Party Rental AI Chatbots: Bitcot](https://www.bitcot.com/how-to-use-ai-on-a-party-rental-website-to-automate-business-workflows/) — Party rental specific patterns (LOW confidence — single source)
