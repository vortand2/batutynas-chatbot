# Testing Patterns

**Analysis Date:** 2026-03-05

## Test Framework

**Runner:**
- Playwright `^1.58.2` installed (`package.json` at project root)
- Config: no `playwright.config.*` found — Playwright is installed but no automated test suite is configured
- No Jest, Vitest, Mocha, or any other unit test runner present

**Assertion Library:**
- None — tests are manual browser-based visual inspection

**Run Commands:**
```bash
# No test scripts defined in package.json
# Manual browser testing only:
# Open test-groups.html in browser for widget enrichment tests
# Open chatwoot/test-chatwoot.html for Chatwoot enrichment tests
# Open demo/index.html for full widget live testing
```

## Test File Organization

**Location:**
- Co-located test wrappers alongside their production counterparts:
  - `n8n-workflows/enrich-response-code-test.js` next to `n8n-workflows/enrich-response-code.js`
  - `chatwoot/enrich-chatwoot-test.js` next to `chatwoot/enrich-chatwoot.js`
- HTML test harnesses at module directory or root:
  - `test-groups.html` (root) — tests widget enrichment flows
  - `chatwoot/test-chatwoot.html` — tests Chatwoot enrichment flows
  - `chatwoot/test-widget.html` — tests Chatwoot widget embed
  - `demo/index.html` — full live widget demo

**Naming:**
- Browser wrapper files: `[module-name]-test.js`
- HTML harnesses: `test-*.html` or `test-groups.html`

**Structure:**
```
batutynas-chatbot/
+-- test-groups.html                     # Widget enrichment test harness
+-- test-on-site.html                    # On-site widget embed test
+-- n8n-workflows/
|   +-- enrich-response-code.js          # Production (n8n Code node)
|   +-- enrich-response-code-test.js     # Browser-testable wrapper
+-- chatwoot/
|   +-- enrich-chatwoot.js               # Production (n8n Code node)
|   +-- enrich-chatwoot-test.js          # Browser-testable wrapper
|   +-- test-chatwoot.html               # Chatwoot enrichment test harness
|   +-- test-widget.html                 # Widget embed test
+-- demo/
    +-- index.html                       # Full live widget demo
```

## Test Structure

**The test approach is manual and browser-based scenario testing.**

Test wrappers wrap production logic in a named function so it can be called from HTML:

Production code (n8n Code node) reads from n8n context:
```javascript
// enrich-response-code.js (top-level n8n script)
const agentOutput = $input.first().json || {};
let response = agentOutput.output || agentOutput.text || '';
// ... processing ...
return [{ json: { enriched } }];
```

Test wrapper exposes same logic as a callable function:
```javascript
// enrich-response-code-test.js
function enrichResponse(response) {
  // Same logic, response passed as argument instead of $input
  // ...
  return enrichedHtml;
}
```

HTML test harness pattern from `test-groups.html` and `chatwoot/test-chatwoot.html`:
```javascript
const SCENARIOS = {
  main_menu: 'Sveiki! [MAIN_MENU]',
  birthday_10: 'Puiku! [MENU_GROUP_BIRTHDAY:10]',
  confirm: 'Jūsų užklausa!\n\n[BOOKING_CONFIRM:{"date":"2026-03-15",...}]',
  info: 'Plain text response without markers'
};

function test(scenario) {
  const result = enrichResponse(SCENARIOS[scenario]);
  document.getElementById('output').innerHTML = result;
}
```

## Mocking

**Framework:** None — no mocking library.

**Patterns:**
- n8n globals (`$input`, `$()`) are replaced by function parameters in test wrappers:
  ```javascript
  // Production: const agentOutput = $input.first().json || {};
  // Test wrapper: function enrichResponse(response) { ... }
  ```
- `isMessenger` boolean is passed as second argument to test wrappers to simulate channel:
  ```javascript
  function enrichChatwootResponse(response, isMessenger) { ... }
  ```
- HTML test harnesses expose a channel toggle button (Web / Messenger) that sets `currentIsMessenger` and re-runs the current test

**What to Mock:**
- n8n execution context globals (`$input`, `$()`) — replaced by wrapper function arguments
- Channel type (`isMessenger`) — toggle in test UI

**What NOT to Mock:**
- TRAMPOLINES data array — same literal is duplicated into test wrappers
- Date calculations — tests use live dates (date picker shows real upcoming Saturdays)
- DOM interactions — tested live in browser

## Fixtures and Factories

**Test Data:**
Predefined scenario strings defined directly in HTML test harnesses:

```javascript
// From test-groups.html — widget enrichment scenarios
const SCENARIOS = {
  birthday_10:  'Puiku! Štai batutai:\n\n[MENU_GROUP_BIRTHDAY:10]',
  birthday_30:  'Didelei šventei:\n\n[MENU_GROUP_BIRTHDAY:30]',
  public_20:    'Viešam renginiui:\n\n[MENU_GROUP_PUBLIC:20]',
  confirm:      '[BOOKING_CONFIRM:{"group_type":"Gimtadienis","date":"2026-03-15",...}]',
  info:         'Plain text with **markdown** formatting.\n\nNo markers.'
};
```

**Location:** Inline in HTML test harness files — not in separate fixture files.

## Coverage

**Requirements:** None enforced — no coverage tooling configured.

**View Coverage:** Not applicable — no automated coverage tooling.

## Test Types

**Unit Tests:**
- Not present as automated tests. Logic tested manually via browser wrappers.
- The test wrappers (`enrich-response-code-test.js`, `enrich-chatwoot-test.js`) serve as manually-invoked unit test equivalents for the enrichment pipeline.

**Integration Tests:**
- `demo/index.html` provides end-to-end manual integration testing with a real webhook URL — tests widget rendering, localStorage persistence, message sending, and AI response enrichment together.
- `chatwoot/test-chatwoot.html` tests enrichment rendering and Chatwoot message format in a simulated split-panel view (chat preview + raw JSON output side by side).

**E2E Tests:**
- Playwright is installed but not configured or used. No `*.spec.ts` or `*.spec.js` files exist in the main project. The `land-search-agent/` sub-project is a separate project with its own structure.

## Common Patterns

**Scenario testing via button clicks:**
```html
<!-- test-groups.html -->
<button class="test-btn" onclick="test('birthday_10')">Birthday (10 guests)</button>
<button class="test-btn" onclick="test('birthday_30')">Birthday (30 guests)</button>
```

**Channel switching (Chatwoot tests):**
```javascript
// Toggle between web and Messenger rendering
function setChannel(isMessenger) {
  currentIsMessenger = isMessenger;
  // Re-render current scenario with updated channel flag
}
```

**Sync comment pattern:**
Test wrapper files include a sync date comment at top so developers know when the wrapper was last updated to match production:
```javascript
// Browser-testable wrapper for enrich-chatwoot.js
// Synced with production on 2026-03-04
```

When updating production enrichment code in `enrich-response-code.js` or `enrich-chatwoot.js`, the corresponding `-test.js` wrapper must be manually updated to match. There is no automated enforcement.

## Critical Test Gap

The TRAMPOLINES data array is duplicated across four files with no shared source:
- `n8n-workflows/enrich-response-code.js`
- `n8n-workflows/enrich-response-code-test.js`
- `chatwoot/enrich-chatwoot.js`
- `chatwoot/enrich-chatwoot-test.js`

Equipment data changes require manual updates to all four files. There is no automated test that verifies the files are in sync.

---

*Testing analysis: 2026-03-05*
