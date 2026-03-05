# Coding Conventions

**Analysis Date:** 2026-03-05

## Naming Patterns

**Files:**
- kebab-case for all source files: `chat-widget.js`, `chat-widget.css`, `enrich-chatwoot.js`
- Test/browser wrappers: suffix `-test.js` — e.g., `enrich-chatwoot-test.js`, `enrich-response-code-test.js`
- HTML test harnesses: `test-*.html` or `test-groups.html` at project root or module dir

**Functions:**
- camelCase: `buildTrampolineCards`, `buildGroupBirthdayEquipment`, `buildDatePicker`, `formatItemText`, `buildQuickReplies`
- Verb-noun pattern: `build*`, `format*`, `create*`, `add*`, `init*`, `render*`, `detect*`, `attach*`, `show*`
- Private/internal helpers prefixed with underscore: `_sendToWebhook`, `_delegationAttached`, `_animating`, `_hasUnread`

**Variables:**
- camelCase for local variables: `guestCount`, `agentOutput`, `contextFlags`, `allMessages`
- SCREAMING_SNAKE_CASE for module-level constants: `STORAGE_KEY`, `SESSION_TTL_MS`, `MAX_MESSAGE_LENGTH`, `TRAMPOLINES`, `LANGUAGES`, `QUICK_PROMPTS`
- Boolean state flags: prefixed with `had*` or `is*` — `hadCatalog`, `hadBookingConfirm`, `isMessenger`, `isBookingStep`

**Data Objects:**
- Equipment items use short descriptive keys: `name`, `icon`, `img`, `type`, `capacity`, `bg`, `min`, `max`, `cat`, `popular`, `detail`, `shortDesc`
- Category values use kebab-case strings: `'big-park'`, `'mega-trampoline'`, `'standard-trampoline'`, `'addon'`, `'party-equipment'`

## Code Style

**Formatting:**
- No automated formatter (no `.prettierrc`, `.eslintrc`, or `biome.json` found)
- 2-space indentation used consistently across all `.js` files
- Single quotes for strings in most files; double quotes inside HTML attribute strings

**Language Mix:**
- `chat-widget.js` uses ES5-compatible syntax (`var`, `function` declarations, `.forEach`) wrapped in an IIFE with `'use strict'`
- n8n workflow scripts (`enrich-response-code.js`, `enrich-chatwoot.js`) use ES6+ (`const`, `let`, arrow functions, template literals, `for...of`)
- Test wrappers (`enrich-chatwoot-test.js`, `enrich-response-code-test.js`) use ES6 inside regular functions

**Line Length:**
- No enforced line limit; data arrays (TRAMPOLINES) use very long single-line object literals

## Import Organization

**No module system used.** All code is either:
- Vanilla script tags loaded in HTML: `<script src="chat-widget.js"></script>`
- n8n Code node scripts — no imports; n8n injects `$input`, `$()` globals
- Test wrappers are self-contained functions in standalone `.js` files loaded via `<script>` tags

**Path Aliases:** None — all paths are relative or absolute URLs.

## Error Handling

**Patterns:**
- Guard clauses at function entry: `if (!response || !response.trim()) return [...]`
- Try/catch for JSON parsing: `try { data = JSON.parse(jsonStr); } catch (e) { data = {}; }`
- Try/catch for `localStorage`: silently swallows errors to handle full storage or unavailability
- HTTP errors: thrown as `throw new Error('HTTP ' + res.status)` caught by `.catch()` which adds a retry message
- Missing data guards use object existence checks before accessing fields: `if (data.date) text += ...`
- n8n scripts return fallback arrays for all error paths: `return [{ json: { _skip: true, _error: '...' } }]`

**Example (localStorage guard from `chat-widget/chat-widget.js`):**
```javascript
function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ... }));
  } catch {
    // localStorage full or unavailable
  }
}
```

**Example (n8n fallback from `chatwoot/enrich-chatwoot.js`):**
```javascript
if (!conversationId) {
  return [{ json: { _skip: true, _error: 'No conversationId — cannot send messages' } }];
}
```

## Logging

**Framework:** `console.error` only (no logging library)

**Patterns:**
- Used exclusively for fatal init errors visible to integrators:
  ```javascript
  console.error('[BatutynasChat] webhookUrl is required. Call BatutynasChat.init({ webhookUrl: "..." })');
  ```
- No `console.log` or `console.warn` in production code
- n8n workflow code has no logging; errors surface via n8n's own execution log

## Comments

**When to Comment:**
- Section headers using `// --- Section Name ---` pattern to divide large files into functional blocks
- Bug fix references: `// Fix #1`, `// Fix #2`, inline comments referencing specific issue numbers
- Complex regex: inline explanation before the regex
- Platform-specific behavior: comments explain platform limitations (e.g., Messenger character limits, UTC timezone issues)

**Example (section headers from `chat-widget/chat-widget.js`):**
```javascript
// --- Session Management ---
// --- Language Detection ---
// --- DOM Helpers ---
// --- Rendering ---
// --- Actions ---
// --- Public API ---
```

**JSDoc/TSDoc:** Not used anywhere in the codebase.

## Function Design

**Size:** Functions range from 3 lines (`escapeHtml`) to 200+ lines (`attachDelegation` event delegation block). Large functions are tolerated when they handle related event cases in one place.

**Parameters:** Typically 0–2 positional parameters; `guestCount` passed as optional null-able parameter rather than options object.

**Return Values:**
- n8n scripts: always return `[{ json: { ... } }]` arrays (n8n contract)
- HTML builder functions: return HTML strings
- Widget functions: mutate global `state` object and call `render()`; no return values

## Module Design

**Exports:**
- `chat-widget.js`: exposes single global `window.BatutynasChat = { init, open, close, reset, setUser }`
- n8n scripts: no exports — they execute top-to-bottom as n8n Code nodes, using `return [...]` at the end
- Test wrappers: expose a single global function (e.g., `enrichChatwootResponse(response, isMessenger)`, `enrichResponse(response)`)

**Barrel Files:** Not used.

**State Management:**
- `chat-widget.js` uses a single mutable module-level `state` object and `config` object inside an IIFE
- No reactive state — changes trigger manual `render()` calls
- Session persisted to `localStorage` under key `'batutynas_chat'` with 24-hour TTL

## HTML Generation

**Pattern used throughout:** String concatenation to build HTML strings returned by `build*` functions.

All user-supplied data goes through `escapeHtml()` in production code:
```javascript
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

The widget also has a separate `sanitizeHtml()` allowlist-based sanitizer for AI-returned `{{HTML}}` content in `chat-widget/chat-widget.js`.

## Marker Protocol

The codebase uses a custom text-marker system for triggering interactive UI components. AI responses contain bracketed markers like `[MAIN_MENU]`, `[DATE_PICKER]`, `[MENU_GROUP_BIRTHDAY:10]`, `[BOOKING_CONFIRM:{...}]`. These are processed by enrichment scripts which replace them with HTML (widget) or Chatwoot message objects (Chatwoot). This convention must be maintained across `n8n-workflows/enrich-response-code.js`, `chatwoot/enrich-chatwoot.js`, and corresponding system prompts in `prompts/`.

---

*Convention analysis: 2026-03-05*
