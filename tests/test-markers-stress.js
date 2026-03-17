'use strict';

// ============================================================
// Stress-test: enrich-chatwoot.js — Marker System & Edge Cases
// ============================================================
// Mimics the n8n execution context so the enricher can be
// evaluated in a controlled way.
// Run:  node tests/test-markers-stress.js
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- Enricher source ----------------------------------------

const ENRICHER_PATH = path.join(__dirname, '..', 'chatwoot', 'enrich-chatwoot.js');
const ENRICHER_SRC = fs.readFileSync(ENRICHER_PATH, 'utf8');

// ---- Run enricher in a sandboxed vm.Script context ----------
// We use Node's built-in `vm` module which is designed precisely for
// running untrusted code in an isolated context — no dynamic Function
// construction needed.

function runEnricher(responseText, opts) {
  // Use explicit undefined check so that passing `null` as conversationId
  // is preserved (not coerced to 'conv-123' by the falsy || operator).
  const conversationId = (opts && opts.conversationId !== undefined) ? opts.conversationId : 'conv-123';
  const isMessenger   = (opts && opts.isMessenger)    || false;
  const contactName   = (opts && opts.contactName)    || '';

  // Build the sandbox that mimics the n8n global environment
  const sandbox = {
    // n8n $input
    $input: {
      first: function() {
        return { json: { output: responseText } };
      }
    },
    // n8n workflow variables
    $vars: {
      CHATWOOT_BASE_URL: 'https://mock.chatwoot.example/api/v1/accounts/1'
    },
    // n8n node accessor
    $: function(nodeName) {
      if (nodeName === 'Filter & Extract') {
        return {
          item: {
            json: {
              conversationId: conversationId,
              isMessenger: isMessenger,
              contactName: contactName
            }
          }
        };
      }
      throw new Error('Unknown node: ' + nodeName);
    },
    // Result capture — the enricher ends with `return formatOutput(...)`.
    // vm.Script does not support top-level `return`, so we wrap the source
    // in an IIFE inside the script and capture to __result.
    __result: undefined,
    // Standard globals the script might use
    JSON: JSON,
    Date: Date,
    Array: Array,
    Object: Object,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    console: console
  };

  // Wrap enricher source so that its top-level `return` statements
  // assign to __result instead of causing a SyntaxError.
  const wrappedSrc = `
    __result = (function() {
      ${ENRICHER_SRC}
    })();
  `;

  const context = vm.createContext(sandbox);
  vm.runInContext(wrappedSrc, context);
  return sandbox.__result;
}

// ---- Test runner --------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + name);
    passed++;
  } else {
    console.log('  FAIL  ' + name);
    if (detail !== undefined) {
      console.log('        Detail: ' + JSON.stringify(detail, null, 2));
    }
    failures.push({ name: name, detail: detail });
    failed++;
  }
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  console.log('  SECTION: ' + title);
  console.log('='.repeat(70));
}

// ---- Output helpers -----------------------------------------

function getItems(result) {
  return result.map(function(r) { return r.json; });
}

function getMessageItems(result) {
  return getItems(result).filter(function(i) {
    return i._url && i._url.indexOf('/messages') !== -1;
  });
}

function getTypingItems(result) {
  return getItems(result).filter(function(i) {
    return i._url && i._url.indexOf('/toggle_typing') !== -1;
  });
}

function parsedBodies(result) {
  return getMessageItems(result).map(function(i) { return JSON.parse(i._body); });
}

function hasTypingOn(result) {
  return getTypingItems(result).some(function(i) {
    return JSON.parse(i._body).typing_status === 'on';
  });
}

function hasTypingOff(result) {
  return getTypingItems(result).some(function(i) {
    return JSON.parse(i._body).typing_status === 'off';
  });
}

function allContents(result) {
  return parsedBodies(result).map(function(b) { return b.content; });
}

function lastIndexOf(arr, predFn) {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (predFn(arr[i])) return i;
  }
  return -1;
}

// ============================================================
// SECTION 1 — Basic structure invariants
// ============================================================
section('Basic structure invariants');

(function() {
  var r = runEnricher('[MAIN_MENU]');
  var items = getItems(r);

  assert('Result is an array', Array.isArray(r));
  assert('Every item has a json property',
    items.every(function(i) { return typeof i === 'object' && i !== null; }));
  assert('Every message item has _url',
    getMessageItems(r).every(function(i) { return typeof i._url === 'string'; }));
  assert('Every message item has _body string',
    getMessageItems(r).every(function(i) { return typeof i._body === 'string'; }));
  assert('_body is valid JSON',
    getMessageItems(r).every(function(i) {
      try { JSON.parse(i._body); return true; } catch (e) { return false; }
    }));

  var bodies = parsedBodies(r);
  assert('Every message body has content_type',
    bodies.every(function(b) { return typeof b.content_type === 'string'; }));
  assert('Every message body has message_type',
    bodies.every(function(b) { return typeof b.message_type === 'string'; }));
  assert('Every message body has content field',
    bodies.every(function(b) { return 'content' in b; }));
  assert('Every message body has content_attributes',
    bodies.every(function(b) { return 'content_attributes' in b; }));
})();

// ============================================================
// SECTION 2 — No conversationId guard
// ============================================================
section('No conversationId guard');

(function() {
  var r = runEnricher('[MAIN_MENU]', { conversationId: null });
  var items = getItems(r);
  assert('Returns array with one skip item when no conversationId',
    items.length === 1 && items[0]._skip === true);
  assert('Skip item has _error field',
    typeof items[0]._error === 'string');
})();

// ============================================================
// SECTION 3 — Empty / missing response
// ============================================================
section('Empty / missing response fallback');

(function() {
  var r1 = runEnricher('');
  var b1 = parsedBodies(r1);
  assert('Empty string: returns text message', b1.length >= 1 && b1[0].content_type === 'text');
  assert('Empty string: fallback text includes phone number', b1[0].content.indexOf('+370') !== -1);

  var r2 = runEnricher('   ');
  var b2 = parsedBodies(r2);
  assert('Whitespace-only string: fallback text', b2.length >= 1 && b2[0].content_type === 'text');
})();

// ============================================================
// SECTION 4 — Individual marker recognition
// ============================================================
section('Individual marker recognition');

// 4.1 [MAIN_MENU]
(function() {
  var r = runEnricher('[MAIN_MENU]');
  var bodies = parsedBodies(r);
  assert('[MAIN_MENU] produces at least one message', bodies.length >= 1);
  assert('[MAIN_MENU] produces input_select',
    bodies.some(function(b) { return b.content_type === 'input_select'; }));
  assert('[MAIN_MENU] items are non-empty',
    bodies.some(function(b) {
      return b.content_type === 'input_select' && b.content_attributes.items.length > 0;
    }));
})();

// 4.2 [DATE_PICKER]
(function() {
  var r = runEnricher('[DATE_PICKER]');
  var bodies = parsedBodies(r);
  assert('[DATE_PICKER] produces input_select',
    bodies.some(function(b) { return b.content_type === 'input_select'; }));
  var sel = bodies.find(function(b) { return b.content_type === 'input_select'; });
  assert('[DATE_PICKER] items have ISO date values',
    sel && sel.content_attributes.items.every(function(i) {
      return /^\d{4}-\d{2}-\d{2}$/.test(i.value);
    }));
  assert('[DATE_PICKER] produces 4 date options',
    sel && sel.content_attributes.items.length === 4);
})();

// 4.3 [EQUIPMENT_CARDS] — not a recognised marker in the enricher
(function() {
  var r = runEnricher('Text before [EQUIPMENT_CARDS] text after');
  assert('[EQUIPMENT_CARDS] (unknown) stripped — no raw marker in output',
    !allContents(r).some(function(c) { return c && c.indexOf('[EQUIPMENT_CARDS]') !== -1; }));
  assert('[EQUIPMENT_CARDS] (unknown) surrounding text still present',
    allContents(r).some(function(c) {
      return c && (c.indexOf('Text before') !== -1 || c.indexOf('text after') !== -1);
    }));
})();

// 4.4 [ADDON_CARDS] — not recognised (enricher uses [ADDON_UPSELL])
(function() {
  var r = runEnricher('[ADDON_CARDS]');
  assert('[ADDON_CARDS] (unknown) stripped',
    !allContents(r).some(function(c) { return c && c.indexOf('[ADDON_CARDS]') !== -1; }));
})();

// 4.5 [LOCATION_CARDS] — unknown
(function() {
  var r = runEnricher('[LOCATION_CARDS]');
  assert('[LOCATION_CARDS] (unknown) stripped',
    !allContents(r).some(function(c) { return c && c.indexOf('[LOCATION_CARDS]') !== -1; }));
})();

// 4.6 [FAQ_CARDS] — unknown
(function() {
  var r = runEnricher('[FAQ_CARDS]');
  assert('[FAQ_CARDS] (unknown) stripped',
    !allContents(r).some(function(c) { return c && c.indexOf('[FAQ_CARDS]') !== -1; }));
})();

// 4.7 [HUMAN_HANDOFF]
(function() {
  var r = runEnricher('[HUMAN_HANDOFF]');
  var bodies = parsedBodies(r);
  var items = getItems(r);
  assert('[HUMAN_HANDOFF] produces at least one message', bodies.length >= 1);
  assert('[HUMAN_HANDOFF] customer message includes phone number',
    bodies.some(function(b) { return b.content && b.content.indexOf('+370') !== -1; }));
  assert('[HUMAN_HANDOFF] appends Telegram notification item',
    items.some(function(i) { return i._url && i._url.indexOf('api.telegram.org') !== -1; }));
})();

// 4.8 [ADDON_UPSELL] (the real addon marker)
(function() {
  var r = runEnricher('[ADDON_UPSELL]');
  var bodies = parsedBodies(r);
  assert('[ADDON_UPSELL] produces cards',
    bodies.some(function(b) { return b.content_type === 'cards'; }));
  assert('[ADDON_UPSELL] has typing on (heavy content)', hasTypingOn(r));
  assert('[ADDON_UPSELL] has typing off', hasTypingOff(r));
})();

// 4.9 [MENU_GROUP_BIRTHDAY]
(function() {
  var r = runEnricher('[MENU_GROUP_BIRTHDAY]');
  var bodies = parsedBodies(r);
  assert('[MENU_GROUP_BIRTHDAY] produces at least one message', bodies.length >= 1);
})();

// 4.10 [MENU_GROUP_PUBLIC]
(function() {
  var r = runEnricher('[MENU_GROUP_PUBLIC]');
  var bodies = parsedBodies(r);
  assert('[MENU_GROUP_PUBLIC] produces at least one message', bodies.length >= 1);
})();

// 4.11 [MENU_GROUP_PARTY]
(function() {
  var r = runEnricher('[MENU_GROUP_PARTY]');
  var bodies = parsedBodies(r);
  assert('[MENU_GROUP_PARTY] produces cards',
    bodies.some(function(b) { return b.content_type === 'cards'; }));
})();

// ============================================================
// SECTION 5 — BOOKING_CONFIRM pipe-separated (unsupported → fallback)
// ============================================================
section('BOOKING_CONFIRM parsing — pipe-separated (unsupported format → fallback)');

(function() {
  var full = '[BOOKING_CONFIRM:Jonas|+37061234567|2026-04-15|Candy Pop|Disco paviljonas, Rodeo|Vilnius|14:00|Vaikų gimtadienis]';
  var r1 = runEnricher(full);
  var b1 = parsedBodies(r1);
  assert('BOOKING_CONFIRM pipe-full: returns at least one message', b1.length >= 1);
  assert('BOOKING_CONFIRM pipe-full: content_type is text', b1[0].content_type === 'text');
  // Pipe format: allMarkerRegex expects BOOKING_CONFIRM:{JSON} so this does NOT match.
  // The pipe string is stripped as an unrecognised marker, allMessages ends empty,
  // and H-4 fires — producing the generic "kažkas nutiko" error message.
  assert('BOOKING_CONFIRM pipe-full: H-4 generic error fires (empty allMessages after strip)',
    b1[0].content.indexOf('nutiko') !== -1 || b1[0].content.indexOf('skambinkite') !== -1);
})();

// ============================================================
// SECTION 6 — BOOKING_CONFIRM with JSON data (real format)
// ============================================================
section('BOOKING_CONFIRM parsing — JSON format (real supported format)');

// 6.1 Full data
(function() {
  var json = JSON.stringify({
    contact_name: 'Jonas',
    contact_phone: '+37061234567',
    date: '2026-04-15',
    trampoline: 'Candy Pop',
    addons: 'Disco paviljonas, Rodeo',
    location: 'Vilnius',
    time: '14:00',
    notes: 'Vaikų gimtadienis'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM JSON-full: returns messages', b.length >= 1);
  assert('BOOKING_CONFIRM JSON-full: first is text', b[0].content_type === 'text');
  assert('BOOKING_CONFIRM JSON-full: contains name', b[0].content.indexOf('Jonas') !== -1);
  assert('BOOKING_CONFIRM JSON-full: contains phone', b[0].content.indexOf('+37061234567') !== -1);
  assert('BOOKING_CONFIRM JSON-full: contains date', b[0].content.indexOf('2026-04-15') !== -1);
  assert('BOOKING_CONFIRM JSON-full: contains trampoline', b[0].content.indexOf('Candy Pop') !== -1);
  assert('BOOKING_CONFIRM JSON-full: post-booking nav buttons appended',
    b.some(function(bb) { return bb.content_type === 'input_select'; }));
})();

// 6.2 Minimal data
(function() {
  var json = JSON.stringify({
    contact_name: 'Jonas',
    contact_phone: '+37061234567',
    date: '2026-04-15',
    trampoline: 'Candy Pop'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM JSON-minimal: returns messages', b.length >= 1);
  assert('BOOKING_CONFIRM JSON-minimal: text type', b[0].content_type === 'text');
  assert('BOOKING_CONFIRM JSON-minimal: name present', b[0].content.indexOf('Jonas') !== -1);
})();

// 6.3 Empty JSON object {}
(function() {
  var r = runEnricher('[BOOKING_CONFIRM:{}]');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM empty {}: returns fallback message', b.length >= 1);
  assert('BOOKING_CONFIRM empty {}: fallback text includes contact info',
    b[0].content.indexOf('+370') !== -1 || b[0].content.indexOf('Užklausa') !== -1 || b[0].content.indexOf('susisieks') !== -1);
})();

// 6.4 Missing contact info → _missingContact warning
(function() {
  var json = JSON.stringify({ date: '2026-04-15', trampoline: 'Candy Pop' });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM no contact: shows missing-contact warning',
    b[0].content.indexOf('vardą') !== -1 || b[0].content.indexOf('telefono') !== -1);
})();

// 6.5 Extra fields (should not crash)
(function() {
  var json = JSON.stringify({
    contact_name: 'Test',
    contact_phone: '+37011111111',
    date: '2026-06-01',
    trampoline: 'Monstrai',
    extra1: 'foo', extra2: 'bar', extra3: 'baz'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM extra fields: does not crash', b.length >= 1);
  assert('BOOKING_CONFIRM extra fields: correct content_type', b[0].content_type === 'text');
})();

// 6.6 Unicode in name
(function() {
  var json = JSON.stringify({
    contact_name: 'Jönás Ąžuolas',
    contact_phone: '+37061234567',
    date: '2026-04-15',
    trampoline: 'Candy Pop'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM unicode name: does not crash', b.length >= 1);
  assert('BOOKING_CONFIRM unicode name: name appears in output',
    b[0].content.indexOf('Jönás') !== -1);
})();

// 6.7 Special chars / XSS attempt in notes
(function() {
  var json = JSON.stringify({
    contact_name: "O'Brien",
    contact_phone: '+37061234567',
    date: '2026-04-15',
    trampoline: 'Candy Pop & Šokių',
    addons: '"Disco"',
    location: 'Vilnius',
    time: '14:00',
    notes: '<script>alert(1)</script>'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM special chars: does not crash', b.length >= 1);
  assert('BOOKING_CONFIRM special chars: content_type text', b[0].content_type === 'text');
  // Enricher does NOT sanitise — raw content preserved; sanitisation is Chatwoot's responsibility
  assert('BOOKING_CONFIRM special chars: raw content preserved (no enricher-side sanitisation)',
    b[0].content.indexOf('<script>') !== -1 || b[0].content.indexOf("O'Brien") !== -1);
})();

// 6.8 Nested JSON (addons as nested object — balanced-brace regex)
(function() {
  var json = '{"contact_name":"Test","contact_phone":"+370","date":"2026-05-01","trampoline":"Mega Waikiki","addons":{"items":["Dart","Rodeo"]}}';
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('BOOKING_CONFIRM nested JSON: does not crash', b.length >= 1);
})();

// ============================================================
// SECTION 7 — Marker combination tests
// ============================================================
section('Marker combination tests');

// 7.1 Two markers back-to-back
(function() {
  var r = runEnricher('[MAIN_MENU][DATE_PICKER]');
  var bodies = parsedBodies(r);
  assert('Back-to-back [MAIN_MENU][DATE_PICKER]: produces multiple messages', bodies.length >= 2);
  assert('Back-to-back: contains input_select',
    bodies.some(function(b) { return b.content_type === 'input_select'; }));
})();

// 7.2 Text between two markers
(function() {
  var r = runEnricher('Pasirinkite batutą: [MENU_GROUP_BIRTHDAY] O dabar priedus: [ADDON_UPSELL]');
  var bodies = parsedBodies(r);
  assert('Text+marker+text+marker: text before first marker preserved',
    bodies.some(function(b) { return b.content && b.content.indexOf('Pasirinkite') !== -1; }));
  assert('Text+marker+text+marker: text before second marker preserved',
    bodies.some(function(b) { return b.content && b.content.indexOf('O dabar') !== -1; }));
  assert('Text+marker+text+marker: produces 3+ messages', bodies.length >= 3);
})();

// 7.3 All known markers in one response (stress test)
(function() {
  var bigResponse = '[MAIN_MENU][DATE_PICKER][ADDON_UPSELL][MENU_GROUP_PARTY][MENU_GROUP_BIRTHDAY][MENU_GROUP_PUBLIC][HUMAN_HANDOFF]';
  var r, err;
  try { r = runEnricher(bigResponse); } catch (e) { err = e; }
  assert('All markers combined: does not throw', !err, err && err.message);
  if (r) {
    assert('All markers combined: returns non-empty array', Array.isArray(r) && r.length > 0);
  }
})();

// 7.4 Same marker repeated 3 times
(function() {
  var r = runEnricher('[MAIN_MENU][MAIN_MENU][MAIN_MENU]');
  var bodies = parsedBodies(r);
  var menuItems = bodies.filter(function(b) {
    return b.content_type === 'input_select' &&
      b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
  });
  assert('[MAIN_MENU] x3: produces 3 menu instances', menuItems.length === 3);
})();

// 7.5 Marker inside a sentence
(function() {
  var r = runEnricher('Štai meniu [MAIN_MENU] pasirinkite');
  var bodies = parsedBodies(r);
  assert('Marker in sentence: text before marker included',
    bodies.some(function(b) { return b.content && b.content.indexOf('Štai') !== -1; }));
  assert('Marker in sentence: menu produced',
    bodies.some(function(b) { return b.content_type === 'input_select'; }));
  assert('Marker in sentence: text after marker included',
    bodies.some(function(b) { return b.content && b.content.indexOf('pasirinkite') !== -1; }));
})();

// ============================================================
// SECTION 8 — Typing indicator tests
// ============================================================
section('Typing indicator tests');

(function() {
  // Text-only — no typing indicators expected
  var r1 = runEnricher('Labas rytas!');
  assert('Plain text: NO typing_on indicator', !hasTypingOn(r1));
  assert('Plain text: NO typing_off indicator', !hasTypingOff(r1));

  // Cards → should have typing indicators
  var r2 = runEnricher('[ADDON_UPSELL]');
  assert('Cards response: has typing_on', hasTypingOn(r2));
  assert('Cards response: has typing_off', hasTypingOff(r2));

  // Form → should have typing indicators
  var r3 = runEnricher('[PURCHASE_CUSTOM_FORM]');
  assert('Form response: has typing_on', hasTypingOn(r3));
  assert('Form response: has typing_off', hasTypingOff(r3));

  // typing_on comes BEFORE first message in result array
  var r4 = runEnricher('[ADDON_UPSELL]');
  var items4 = getItems(r4);
  var typingOnIdx = -1;
  var firstMsgIdx = -1;
  for (var ia = 0; ia < items4.length; ia++) {
    if (items4[ia]._url && items4[ia]._url.indexOf('toggle_typing') !== -1 && JSON.parse(items4[ia]._body).typing_status === 'on') {
      typingOnIdx = ia; break;
    }
  }
  for (var ib = 0; ib < items4.length; ib++) {
    if (items4[ib]._url && items4[ib]._url.indexOf('/messages') !== -1) {
      firstMsgIdx = ib; break;
    }
  }
  assert('typing_on comes BEFORE first message', typingOnIdx !== -1 && firstMsgIdx !== -1 && typingOnIdx < firstMsgIdx);

  // typing_off comes AFTER last message
  var typingOffIdx = lastIndexOf(items4, function(i) {
    return i._url && i._url.indexOf('toggle_typing') !== -1 && JSON.parse(i._body).typing_status === 'off';
  });
  var lastMsgIdx = lastIndexOf(items4, function(i) {
    return i._url && i._url.indexOf('/messages') !== -1;
  });
  assert('typing_off comes AFTER last message', typingOffIdx !== -1 && lastMsgIdx !== -1 && typingOffIdx > lastMsgIdx);
})();

// ============================================================
// SECTION 9 — Regex edge cases
// ============================================================
section('Regex edge cases');

// 9.1 Nested brackets: [[MAIN_MENU]]
(function() {
  var r = runEnricher('[[MAIN_MENU]]');
  assert('[[MAIN_MENU]]: does not crash', Array.isArray(r));
  // The inner [MAIN_MENU] may be matched; what matters is no crash and no raw leak
  assert('[[MAIN_MENU]]: returns non-empty array', r.length > 0);
})();

// 9.2 Partial marker — no closing bracket
(function() {
  var r = runEnricher('[MAIN_MENU');
  assert('[MAIN_MENU (no close): does not crash', Array.isArray(r));
  // Should be treated as plain text — no input_select with menu values
  assert('[MAIN_MENU (no close): treated as plain text (no menu)',
    !parsedBodies(r).some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));
})();

// 9.3 Wrong case
(function() {
  var r1 = runEnricher('[main_menu]');
  assert('[main_menu] (lowercase): not matched as main menu',
    !parsedBodies(r1).some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));

  var r2 = runEnricher('[Main_Menu]');
  assert('[Main_Menu] (mixed case): not matched as main menu',
    !parsedBodies(r2).some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));
})();

// 9.4 Extra whitespace inside brackets
(function() {
  var r1 = runEnricher('[ MAIN_MENU ]');
  assert('[ MAIN_MENU ] (space inside): not matched as valid marker',
    !parsedBodies(r1).some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));

  var r2 = runEnricher('[MAIN_MENU ]');
  assert('[MAIN_MENU ] (trailing space): not matched as valid marker',
    !parsedBodies(r2).some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));
})();

// 9.5 Marker in backtick code: `[MAIN_MENU]`
(function() {
  var r = runEnricher('`[MAIN_MENU]`');
  // The enricher does NOT treat backtick code blocks specially.
  // The marker WILL be matched. Test for no crash.
  assert('Marker in backticks: does not crash', Array.isArray(r));
})();

// 9.6 Marker with newlines around it
(function() {
  var r = runEnricher('\n[MAIN_MENU]\n');
  var bodies = parsedBodies(r);
  assert('Marker with surrounding newlines: main menu produced',
    bodies.some(function(b) {
      return b.content_type === 'input_select' &&
        b.content_attributes.items.some(function(i) { return i.value.indexOf('gimtadien') !== -1; });
    }));
})();

// ============================================================
// SECTION 10 — Security tests
// ============================================================
section('Security tests');

// 10.1 XSS in AI response alongside marker
(function() {
  var r = runEnricher("<script>alert('xss')</script> [MAIN_MENU]");
  var bodies = parsedBodies(r);
  assert('XSS + marker: does not crash', bodies.length >= 1);
  assert('XSS + marker: menu still produced',
    bodies.some(function(b) { return b.content_type === 'input_select'; }));
  assert('XSS + marker: result is an array', Array.isArray(r));
})();

// 10.2 HTML injection in plain text
(function() {
  var r = runEnricher('<img src=x onerror=alert(1)> Sveiki!');
  var bodies = parsedBodies(r);
  assert('HTML injection: does not crash', bodies.length >= 1);
  assert('HTML injection: returns text content_type', bodies[0].content_type === 'text');
})();

// 10.3 SQL injection in booking confirm
(function() {
  var json = JSON.stringify({
    contact_name: "'; DROP TABLE bookings;--",
    contact_phone: '+37061234567',
    date: '2026-04-15',
    trampoline: 'Candy Pop'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var b = parsedBodies(r);
  assert('SQL injection in booking: does not crash', b.length >= 1);
  assert('SQL injection in booking: content_type text', b[0].content_type === 'text');
})();

// 10.4 Very long response (10,000+ chars)
(function() {
  var longText = new Array(10002).join('A') + ' [MAIN_MENU]';
  var r, err;
  try { r = runEnricher(longText); } catch (e) { err = e; }
  assert('Very long response (10k chars): does not crash', !err, err && err.message);
  if (r) {
    assert('Very long response: returns array', Array.isArray(r));
    assert('Very long response: main menu produced',
      parsedBodies(r).some(function(b) { return b.content_type === 'input_select'; }));
  }
})();

// 10.5 Null bytes in response
(function() {
  var r = runEnricher('Hello\x00World [MAIN_MENU]');
  assert('Null bytes: does not crash', Array.isArray(r));
})();

// ============================================================
// SECTION 11 — Messenger vs Widget mode differences
// ============================================================
section('Messenger mode differences');

(function() {
  var rW = runEnricher('[MAIN_MENU]', { isMessenger: false });
  var rM = runEnricher('[MAIN_MENU]', { isMessenger: true });

  var wBodies = parsedBodies(rW);
  var mBodies = parsedBodies(rM);

  var wSel = wBodies.find(function(b) { return b.content_type === 'input_select'; });
  var mSel = mBodies.find(function(b) { return b.content_type === 'input_select'; });

  var wItems = wSel ? wSel.content_attributes.items : [];
  var mItems = mSel ? mSel.content_attributes.items : [];

  assert('Widget menu has >=5 items', wItems.length >= 5);
  assert('Messenger menu has >=5 items', mItems.length >= 5);

  var longMItems = mItems.filter(function(i) { return i.title.length > 20; });
  assert('Messenger titles <=20 chars each', longMItems.length === 0, longMItems.map(function(i) { return { title: i.title, len: i.title.length }; }));
})();

// ============================================================
// SECTION 12 — Output URL structure
// ============================================================
section('Output URL structure');

(function() {
  var r = runEnricher('[MAIN_MENU]');
  var msgItems = getMessageItems(r);
  var chatwootBase = 'https://mock.chatwoot.example/api/v1/accounts/1';
  assert('Message _url contains chatwootBase',
    msgItems.every(function(i) { return i._url.indexOf(chatwootBase) === 0; }));
  assert('Message _url ends with /messages',
    msgItems.every(function(i) { return i._url.slice(-9) === '/messages'; }));
  assert('Message _url contains conversationId',
    msgItems.every(function(i) { return i._url.indexOf('conv-123') !== -1; }));
})();

// ============================================================
// SECTION 13 — BOOKING_CONFIRM post-booking navigation buttons
// ============================================================
section('BOOKING_CONFIRM post-booking navigation buttons');

(function() {
  var json = JSON.stringify({
    contact_name: 'Ana',
    contact_phone: '+370611111',
    date: '2026-05-01',
    trampoline: 'Monstrai'
  });
  var r = runEnricher('[BOOKING_CONFIRM:' + json + ']');
  var bodies = parsedBodies(r);
  var navSelect = bodies.find(function(b) {
    return b.content_type === 'input_select' &&
      b.content_attributes.items.some(function(i) {
        return i.value.indexOf('meniu') !== -1 || i.value.indexOf('Meniu') !== -1 ||
               i.value.indexOf('Pradžia') !== -1 || i.value.indexOf('užsakyti') !== -1;
      });
  });
  assert('Post-booking: navigation input_select appended', !!navSelect);
  assert('Post-booking: nav has at least 2 buttons',
    navSelect && navSelect.content_attributes.items.length >= 2);
})();

// ============================================================
// SECTION 14 — FR-3.2 malformed BOOKING_CONFIRM fallback
// ============================================================
section('FR-3.2 — Malformed BOOKING_CONFIRM fallback (no JSON braces)');

(function() {
  // Pipe-separated format is not matched by allMarkerRegex (expects JSON with braces).
  // It DOES contain "BOOKING_CONFIRM" keyword — FR-3.2 fires.
  var r = runEnricher('[BOOKING_CONFIRM:invalid-no-braces]');
  var bodies = parsedBodies(r);
  assert('BOOKING_CONFIRM invalid (no braces): does not crash', bodies.length >= 0);
  assert('BOOKING_CONFIRM invalid (no braces): returns array', Array.isArray(r));
  // After stripping the unrecognised marker, either plain text or fallback
  assert('BOOKING_CONFIRM invalid (no braces): result non-empty', r.length > 0);
})();

// ============================================================
// SECTION 15 — HUMAN_HANDOFF Telegram item structure
// ============================================================
section('HUMAN_HANDOFF Telegram notification structure');

(function() {
  var r = runEnricher('[HUMAN_HANDOFF]', { contactName: 'Petras Petraitis' });
  var items = getItems(r);
  var tgItem = items.find(function(i) { return i._url && i._url.indexOf('api.telegram.org') !== -1; });
  assert('HUMAN_HANDOFF: Telegram item exists', !!tgItem);
  assert('HUMAN_HANDOFF: Telegram _body is valid JSON',
    (function() { try { JSON.parse(tgItem._body); return true; } catch (e) { return false; } })());
  var tgBody = JSON.parse(tgItem._body);
  assert('HUMAN_HANDOFF: Telegram body has chat_id', typeof tgBody.chat_id !== 'undefined');
  assert('HUMAN_HANDOFF: Telegram body has text', typeof tgBody.text === 'string');
  assert('HUMAN_HANDOFF: Telegram text mentions contact name', tgBody.text.indexOf('Petras') !== -1);
  assert('HUMAN_HANDOFF: Telegram parse_mode is HTML', tgBody.parse_mode === 'HTML');
})();

// ============================================================
// SECTION 16 — MENU_GROUP_BIRTHDAY with guest count parameter
// ============================================================
section('MENU_GROUP_BIRTHDAY with guest count parameter');

(function() {
  var r1 = runEnricher('[MENU_GROUP_BIRTHDAY:10]');
  assert('MENU_GROUP_BIRTHDAY:10 — does not crash', parsedBodies(r1).length >= 1);

  var r2 = runEnricher('[MENU_GROUP_BIRTHDAY:20]');
  var b2 = parsedBodies(r2);
  assert('MENU_GROUP_BIRTHDAY:20 (large group) — does not crash', b2.length >= 1);
  assert('MENU_GROUP_BIRTHDAY:20 — has CTA input_select',
    b2.some(function(b) { return b.content_type === 'input_select'; }));

  var r3 = runEnricher('[MENU_GROUP_BIRTHDAY:abc]');
  assert('MENU_GROUP_BIRTHDAY:abc (invalid count) — does not crash', parsedBodies(r3).length >= 1);

  var r4 = runEnricher('[MENU_GROUP_BIRTHDAY:-5]');
  assert('MENU_GROUP_BIRTHDAY:-5 (negative count) — does not crash', parsedBodies(r4).length >= 1);
})();

// ============================================================
// SECTION 17 — MENU_GROUP_PUBLIC with guest count parameter
// ============================================================
section('MENU_GROUP_PUBLIC with guest count parameter');

(function() {
  var r = runEnricher('[MENU_GROUP_PUBLIC:150]');
  var bodies = parsedBodies(r);
  assert('MENU_GROUP_PUBLIC:150 — does not crash', bodies.length >= 1);
  // >100 guests triggers advisory text
  // Actual advisory text uses "derinti kelias atrakcijas" (not "kombinu")
  assert('MENU_GROUP_PUBLIC:150 — includes advisory text for large groups',
    bodies.some(function(b) { return b.content_type === 'text' && b.content.indexOf('derinti') !== -1; }));
})();

// ============================================================
// SECTION 18 — Plain text formatting (no markers)
// ============================================================
section('Plain text formatting (no markers)');

(function() {
  // **bold** in widget → *bold*
  var r1 = runEnricher('**Sveiki!** Kaip sekasi?', { isMessenger: false });
  var b1 = parsedBodies(r1);
  assert('Widget: **bold** converted to *bold*', b1[0].content.indexOf('*Sveiki!*') !== -1);

  // **bold** on Messenger → stripped to plain text (no asterisks)
  var r2 = runEnricher('**Sveiki!** Kaip sekasi?', { isMessenger: true });
  var b2 = parsedBodies(r2);
  assert('Messenger: **bold** → no asterisks remain', b2[0].content.indexOf('*') === -1);

  // \\n → newline
  var r3 = runEnricher('Pirma eilutė\\nAntra eilutė');
  var b3 = parsedBodies(r3);
  assert('\\n escape → real newline in output', b3[0].content.indexOf('\n') !== -1);
})();

// ============================================================
// SECTION 19 — FR-3.1 unrecognised marker stripping
// ============================================================
section('FR-3.1 — Unrecognised marker stripping (no-marker path)');

(function() {
  var r1 = runEnricher('Šiandien oras gražus [UNKNOWN_MARKER] labas');
  var b1 = parsedBodies(r1);
  assert('Unknown marker stripped from plain text',
    !b1.some(function(b) { return b.content && b.content.indexOf('[UNKNOWN_MARKER]') !== -1; }));
  assert('Surrounding text preserved after stripping',
    b1.some(function(b) { return b.content && b.content.indexOf('Šiandien') !== -1; }));
})();

// ============================================================
// SECTION 20 — Purchase flows
// ============================================================
section('Purchase flows');

(function() {
  var r1 = runEnricher('[PURCHASE_EMAIL_INPUT]', { isMessenger: false });
  var b1 = parsedBodies(r1);
  assert('PURCHASE_EMAIL_INPUT widget: produces form',
    b1.some(function(b) { return b.content_type === 'form'; }));

  var r2 = runEnricher('[PURCHASE_EMAIL_INPUT]', { isMessenger: true });
  var b2 = parsedBodies(r2);
  assert('PURCHASE_EMAIL_INPUT Messenger: produces text (no form)',
    b2.every(function(b) { return b.content_type === 'text'; }));

  var r3 = runEnricher('[PURCHASE_CUSTOM_FORM]', { isMessenger: false });
  var b3 = parsedBodies(r3);
  assert('PURCHASE_CUSTOM_FORM widget: produces form',
    b3.some(function(b) { return b.content_type === 'form'; }));
  var form = b3.find(function(b) { return b.content_type === 'form'; });
  assert('PURCHASE_CUSTOM_FORM widget: form has 6 fields',
    form && form.content_attributes.items.length === 6);

  var r4 = runEnricher('[PURCHASE_CUSTOM_FORM]', { isMessenger: true });
  var b4 = parsedBodies(r4);
  assert('PURCHASE_CUSTOM_FORM Messenger: produces text (no form)',
    b4.every(function(b) { return b.content_type === 'text'; }));
})();

// ============================================================
// SECTION 21 — H-4 empty allMessages fallback
// ============================================================
section('H-4 — Empty allMessages fallback');

(function() {
  // After stripping an unknown marker from an otherwise blank string, allMessages would be empty.
  // H-4 fires and injects the "kažkas nutiko" message.
  var r = runEnricher('   [UNKNOWN_MARKER]   ');
  assert('After stripping all content: result is non-empty array',
    Array.isArray(r) && r.length > 0);
  var bodies = parsedBodies(r);
  assert('After stripping all content: H-4 fallback or content present',
    bodies.length >= 1);
})();

// ============================================================
// SECTION 22 — Cards structure validation
// ============================================================
section('Cards structure validation');

(function() {
  var r = runEnricher('[MENU_GROUP_PARTY]');
  var bodies = parsedBodies(r);
  var cardMsg = bodies.find(function(b) { return b.content_type === 'cards'; });
  assert('Cards message has content_attributes', cardMsg && typeof cardMsg.content_attributes === 'object');
  assert('Cards content_attributes has items array',
    cardMsg && Array.isArray(cardMsg.content_attributes.items));
  assert('Cards items are non-empty', cardMsg && cardMsg.content_attributes.items.length > 0);
  var firstCard = cardMsg && cardMsg.content_attributes.items[0];
  assert('Card item has title', firstCard && typeof firstCard.title === 'string');
  assert('Card item has media_url', firstCard && typeof firstCard.media_url === 'string');
  assert('Card item has actions array', firstCard && Array.isArray(firstCard.actions));
  assert('Card action has type and text',
    firstCard && firstCard.actions[0] &&
    typeof firstCard.actions[0].type === 'string' &&
    typeof firstCard.actions[0].text === 'string');
})();

// ============================================================
// SECTION 23 — GUEST_COUNT markers
// ============================================================
section('GUEST_COUNT markers');

(function() {
  var r1 = runEnricher('[GUEST_COUNT]');
  var b1 = parsedBodies(r1);
  assert('[GUEST_COUNT] produces input_select',
    b1.some(function(b) { return b.content_type === 'input_select'; }));
  var sel1 = b1.find(function(b) { return b.content_type === 'input_select'; });
  assert('[GUEST_COUNT] has 5 options',
    sel1 && sel1.content_attributes.items.length === 5);

  var r2 = runEnricher('[GUEST_COUNT_PUBLIC]');
  var b2 = parsedBodies(r2);
  assert('[GUEST_COUNT_PUBLIC] produces input_select',
    b2.some(function(b) { return b.content_type === 'input_select'; }));
  var sel2 = b2.find(function(b) { return b.content_type === 'input_select'; });
  assert('[GUEST_COUNT_PUBLIC] has 5 options',
    sel2 && sel2.content_attributes.items.length === 5);
})();

// ============================================================
// SECTION 24 — PURCHASE_SUBMENU
// ============================================================
section('PURCHASE_SUBMENU');

(function() {
  var r = runEnricher('[PURCHASE_SUBMENU]', { isMessenger: false });
  var b = parsedBodies(r);
  assert('[PURCHASE_SUBMENU] produces input_select',
    b.some(function(bb) { return bb.content_type === 'input_select'; }));
  var sel = b.find(function(bb) { return bb.content_type === 'input_select'; });
  assert('[PURCHASE_SUBMENU] has 2 options',
    sel && sel.content_attributes.items.length === 2);

  var rM = runEnricher('[PURCHASE_SUBMENU]', { isMessenger: true });
  var bM = parsedBodies(rM);
  var selM = bM.find(function(bb) { return bb.content_type === 'input_select'; });
  var longMItems = selM ? selM.content_attributes.items.filter(function(i) { return i.title.length > 20; }) : [];
  assert('[PURCHASE_SUBMENU] Messenger: titles <=20 chars', longMItems.length === 0, longMItems);
})();

// ============================================================
// SUMMARY
// ============================================================

console.log('\n' + '='.repeat(70));
console.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(70));

if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(function(f, i) {
    console.log('\n  ' + (i + 1) + '. ' + f.name);
    if (f.detail !== undefined) {
      var detail = JSON.stringify(f.detail, null, 4);
      detail.split('\n').forEach(function(line) { console.log('     ' + line); });
    }
  });
  process.exit(1);
} else {
  console.log('\n  All tests passed!');
  process.exit(0);
}
