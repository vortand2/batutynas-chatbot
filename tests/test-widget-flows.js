'use strict';

// ============================================================
// QA Test Suite — enrich-chatwoot.js (Web Widget mode)
// ============================================================
// Mocks the n8n environment and runs simulated AI responses
// through the enricher, verifying the output structure.
//
// Strategy: we re-export the enricher as a module by writing a
// thin module wrapper to a temp file that injects mock globals,
// then require it inside a vm.Script context per run.
// ============================================================

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ---------------------------------------------------------------
// 1. Load enricher source
// ---------------------------------------------------------------

const enricherPath = path.resolve(__dirname, '../chatwoot/enrich-chatwoot.js');
const enricherSource = fs.readFileSync(enricherPath, 'utf8');

// ---------------------------------------------------------------
// 2. n8n environment mock factory
// ---------------------------------------------------------------

function makeEnv(context) {
  // Mock for $('Filter & Extract').item.json
  function $(nodeName) {
    return {
      item: {
        json: context.filterExtract || {}
      }
    };
  }

  const $input = {
    first: function () {
      return { json: context.agentOutput || {} };
    }
  };

  const $vars = {
    CHATWOOT_BASE_URL: 'https://test-chatwoot.example.com/api/v1/accounts/1'
  };

  return { $: $, $input: $input, $vars: $vars };
}

// ---------------------------------------------------------------
// 3. Run enricher in a vm sandbox
// ---------------------------------------------------------------

// The enricher uses top-level `return` statements (valid in n8n
// Code nodes).  vm.Script does not support top-level return, so
// we wrap the source in an immediately-invoked function that
// captures the return value.
const wrappedSource =
  '(function($, $input, $vars) {\n' +
  enricherSource +
  '\n})';

const compiledScript = new vm.Script(wrappedSource, { filename: 'enrich-chatwoot.js' });

function runEnricher(context) {
  const env = makeEnv(context);
  // Each run gets a fresh sandbox so state doesn't bleed between tests
  const sandbox = {
    Date: Date,
    JSON: JSON,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    console: console
  };
  vm.createContext(sandbox);
  const fn = compiledScript.runInContext(sandbox);
  return fn(env.$, env.$input, env.$vars);
}

// ---------------------------------------------------------------
// 4. Assertion helpers
// ---------------------------------------------------------------

let passed  = 0;
let failed  = 0;
const failures = [];

function assert(condition, testName, detail) {
  if (condition) {
    console.log('  PASS:', testName);
    passed++;
  } else {
    console.error('  FAIL:', testName);
    if (detail !== undefined) {
      console.error('       Detail:', JSON.stringify(detail, null, 2));
    }
    failed++;
    failures.push({ test: testName, detail });
  }
}

// ---------------------------------------------------------------
// 5. Context builder helpers
// ---------------------------------------------------------------

function widgetCtx(aiResponse, extra) {
  return {
    filterExtract: Object.assign({
      isMessenger: false,
      conversationId: 'conv-test-123',
      contactName: 'Test User'
    }, extra),
    agentOutput: { output: aiResponse }
  };
}

// ---------------------------------------------------------------
// 6. Output structure validators (shared)
// ---------------------------------------------------------------

function validateOutputArray(result, suiteName) {
  assert(Array.isArray(result), suiteName + ': result is an array', result);
  if (!Array.isArray(result)) return false;
  assert(result.length > 0, suiteName + ': result is non-empty', result);

  let allValid = true;
  result.forEach(function (item, i) {
    const hasJson = item && typeof item.json === 'object';
    assert(hasJson, suiteName + ': item[' + i + '] has .json', item);
    if (!hasJson) { allValid = false; return; }

    const j = item.json;
    const hasUrlAndBody = typeof j._url === 'string' && typeof j._body === 'string';
    const isSkip = j._skip === true;
    assert(hasUrlAndBody || isSkip, suiteName + ': item[' + i + '] has _url and _body', j);
    if (!hasUrlAndBody && !isSkip) allValid = false;
  });
  return allValid;
}

// Extract only real message bodies (not typing-indicators or Telegram extras)
function extractMessages(result) {
  return result.filter(function (item) {
    if (!item || !item.json) return false;
    const j = item.json;
    if (j._skip) return false;
    if (!j._body) return false;
    try {
      const body = JSON.parse(j._body);
      if (body.typing_status) return false; // typing indicator
      if (body.chat_id)       return false; // Telegram
      return true;
    } catch (e) {
      return false;
    }
  }).map(function (item) {
    return JSON.parse(item.json._body);
  });
}

function extractTypingItems(result) {
  return result.filter(function (item) {
    if (!item || !item.json || !item.json._body) return false;
    try {
      const body = JSON.parse(item.json._body);
      return !!body.typing_status;
    } catch (e) { return false; }
  });
}

// ---------------------------------------------------------------
// 7. TEST SUITES
// ---------------------------------------------------------------

// -----------------------------------------------------------
// SUITE A: Plain text (no markers)
// -----------------------------------------------------------
console.log('\n=== SUITE A: Plain text (no markers) ===');
{
  // A1: Simple greeting
  const r = runEnricher(widgetCtx('Labas! Kaip galiu padeti?'));
  validateOutputArray(r, 'A1');
  const msgs = extractMessages(r);
  assert(msgs.length === 1, 'A1: exactly 1 message');
  assert(msgs[0] && msgs[0].content_type === 'text', 'A1: content_type is text');
  assert(msgs[0] && msgs[0].message_type === 'outgoing', 'A1: message_type is outgoing');
  assert(msgs[0] && msgs[0].content.includes('Labas!'), 'A1: content preserved');

  // A2: Bold markdown — web widget converts ** to *
  const r2 = runEnricher(widgetCtx('Tai yra **svarbus** pranesimas.'));
  const msgs2 = extractMessages(r2);
  assert(msgs2.length === 1, 'A2: 1 message');
  assert(msgs2[0] && msgs2[0].content.includes('*svarbus*'), 'A2: ** converted to * for widget');
}

// -----------------------------------------------------------
// SUITE B: MAIN_MENU
// -----------------------------------------------------------
console.log('\n=== SUITE B: MAIN_MENU ===');
{
  const r = runEnricher(widgetCtx('Sveiki! Kuo galiu padeti?\n[MAIN_MENU]'));
  validateOutputArray(r, 'B1');
  const msgs = extractMessages(r);
  assert(msgs.length >= 1, 'B1: at least 1 message');
  const menuMsg = msgs.find(function (m) { return m.content_type === 'input_select'; });
  assert(!!menuMsg, 'B1: there is an input_select message');
  assert(menuMsg && menuMsg.content_attributes && Array.isArray(menuMsg.content_attributes.items),
    'B1: menu has items array');
  const itemCount = menuMsg && menuMsg.content_attributes && menuMsg.content_attributes.items.length;
  assert(itemCount === 5, 'B1: web widget main menu has exactly 5 items (not 6)', itemCount);
}

// -----------------------------------------------------------
// SUITE C: Birthday flow
// -----------------------------------------------------------
console.log('\n=== SUITE C: Birthday flow ===');
{
  // C1: DATE_PICKER
  const r1 = runEnricher(widgetCtx('Puiku! Kada planuojate svente?\n[DATE_PICKER]'));
  validateOutputArray(r1, 'C1 DATE_PICKER');
  const msgs1 = extractMessages(r1);
  const dpMsg = msgs1.find(function (m) { return m.content_type === 'input_select'; });
  assert(!!dpMsg, 'C1: DATE_PICKER generates input_select');
  assert(dpMsg && dpMsg.content_attributes && Array.isArray(dpMsg.content_attributes.items) &&
    dpMsg.content_attributes.items.length === 4, 'C1: DATE_PICKER has 4 date options',
    dpMsg && dpMsg.content_attributes && dpMsg.content_attributes.items.length);
  const allDatesValid = dpMsg && dpMsg.content_attributes.items.every(function (it) {
    return /^\d{4}-\d{2}-\d{2}$/.test(it.value);
  });
  assert(allDatesValid, 'C1: all date values are YYYY-MM-DD format');

  // C2: EQUIPMENT_CARDS — MENU_GROUP_BIRTHDAY (no guest count)
  const r2 = runEnricher(widgetCtx('Puiku! Stat batutai:\n[MENU_GROUP_BIRTHDAY]'));
  validateOutputArray(r2, 'C2 MENU_GROUP_BIRTHDAY');
  const msgs2 = extractMessages(r2);
  const hasCards2 = msgs2.some(function (m) { return m.content_type === 'cards'; });
  assert(hasCards2, 'C2: MENU_GROUP_BIRTHDAY includes cards message');
  const cardsMsg2 = msgs2.find(function (m) { return m.content_type === 'cards'; });
  assert(cardsMsg2 && cardsMsg2.content_attributes && Array.isArray(cardsMsg2.content_attributes.items),
    'C2: cards message has items');
  const typingItems2 = extractTypingItems(r2);
  assert(typingItems2.length >= 1, 'C2: typing indicator appears with cards');

  // C3: MENU_GROUP_BIRTHDAY:10 — with guest count
  const r3 = runEnricher(widgetCtx('Stat batutai:\n[MENU_GROUP_BIRTHDAY:10]'));
  validateOutputArray(r3, 'C3 MENU_GROUP_BIRTHDAY:10');
  const msgs3 = extractMessages(r3);
  const hasCards3 = msgs3.some(function (m) { return m.content_type === 'cards'; });
  assert(hasCards3, 'C3: MENU_GROUP_BIRTHDAY:10 produces cards');

  // C4: ADDON_CARDS
  const r4 = runEnricher(widgetCtx('Gal noretumete ka nors prideti?\n[ADDON_UPSELL]'));
  validateOutputArray(r4, 'C4 ADDON_UPSELL');
  const msgs4 = extractMessages(r4);
  const hasAddonCards4 = msgs4.some(function (m) { return m.content_type === 'cards'; });
  const hasAddonSelect4 = msgs4.some(function (m) { return m.content_type === 'input_select'; });
  assert(hasAddonCards4, 'C4: ADDON_UPSELL includes cards');
  assert(hasAddonSelect4, 'C4: ADDON_UPSELL includes input_select (skip option)');
  const selectMsg4 = msgs4.find(function (m) { return m.content_type === 'input_select'; });
  // The skip option value is "Tęsti be papildomų pramogų" (Lithuanian with diacritics)
  const hasSkipOption4 = selectMsg4 && selectMsg4.content_attributes.items.some(function (it) {
    return it.value && it.value.includes('be papildom');
  });
  assert(hasSkipOption4, 'C4: ADDON_UPSELL select has skip option ("Tęsti be papildomų pramogų")');

  // C5: BOOKING_CONFIRM with full data
  const bookingJson = JSON.stringify({
    date: '2026-05-10',
    location: 'Taurage',
    event_type: 'Gimtadienis',
    guest_count: '10',
    contact_name: 'Jonas Jonaitis',
    contact_phone: '+37061234567',
    trampoline: 'Mega Rocket',
    addons: 'Milziniskas Dart'
  });
  const r5 = runEnricher(widgetCtx('Jusu uzklausa pateikta!\n[BOOKING_CONFIRM:' + bookingJson + ']'));
  validateOutputArray(r5, 'C5 BOOKING_CONFIRM');
  const msgs5 = extractMessages(r5);
  const confirmMsg5 = msgs5.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('\u2705');
  });
  assert(!!confirmMsg5, 'C5: BOOKING_CONFIRM generates confirmation text with checkmark');
  assert(confirmMsg5 && confirmMsg5.content.includes('Jonas Jonaitis'), 'C5: confirm includes contact name');
  assert(confirmMsg5 && confirmMsg5.content.includes('+37061234567'), 'C5: confirm includes phone');
  assert(confirmMsg5 && confirmMsg5.content.includes('2026-05-10'), 'C5: confirm includes date');
  assert(confirmMsg5 && confirmMsg5.content.includes('Mega Rocket'), 'C5: confirm includes trampoline');
  // Web widget uses *bold* markup (not plain text like Messenger)
  assert(confirmMsg5 && confirmMsg5.content.includes('*\u017dklausa pateikta!*') ||
         (confirmMsg5 && confirmMsg5.content.includes('*')),
    'C5: widget confirm uses bold markup');
  // Post-booking quick replies
  const postBookingSelect5 = msgs5.find(function (m) {
    return m.content_type === 'input_select' && m.content_attributes && m.content_attributes.items &&
      m.content_attributes.items.some(function (it) { return it.value && it.value.includes('dar vien\u0105'); });
  });
  assert(!!postBookingSelect5, 'C5: post-booking navigation quick replies present');
  const newOrderItem5 = postBookingSelect5 &&
    postBookingSelect5.content_attributes.items.find(function (it) {
      return it.value && it.value.includes('dar vien\u0105');
    });
  assert(newOrderItem5 && newOrderItem5.title && newOrderItem5.title.length > 20,
    'C5: widget post-booking label is NOT trimmed to 20 chars');
}

// -----------------------------------------------------------
// SUITE D: Party flow — MENU_GROUP_PARTY
// -----------------------------------------------------------
console.log('\n=== SUITE D: Party flow ===');
{
  const r = runEnricher(widgetCtx('Stat vakarelio iranga:\n[MENU_GROUP_PARTY]'));
  validateOutputArray(r, 'D1 MENU_GROUP_PARTY');
  const msgs = extractMessages(r);
  const hasCards = msgs.some(function (m) { return m.content_type === 'cards'; });
  assert(hasCards, 'D1: MENU_GROUP_PARTY produces cards');
  const cardsMsg = msgs.find(function (m) { return m.content_type === 'cards'; });
  assert(cardsMsg && cardsMsg.content_attributes && Array.isArray(cardsMsg.content_attributes.items),
    'D1: party cards have items array');
  // Putu sou has no image — should appear in input_select fallback
  const hasSelect = msgs.some(function (m) { return m.content_type === 'input_select'; });
  assert(hasSelect, 'D1: no-image party item falls back to input_select');
  const typingItemsD = extractTypingItems(r);
  assert(typingItemsD.length >= 1, 'D1: typing indicator present');

  // D2: Party booking confirm
  const partyJson = JSON.stringify({
    date: '2026-06-14',
    location: 'Silale',
    event_type: 'Vakarelis',
    contact_name: 'Milda K.',
    contact_phone: '+37069876543',
    trampolines: 'Disco paviljonas'
  });
  const r2 = runEnricher(widgetCtx('Viskas sutvarkyta!\n[BOOKING_CONFIRM:' + partyJson + ']'));
  const msgs2 = extractMessages(r2);
  const partyConfirm = msgs2.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Milda K.');
  });
  assert(!!partyConfirm, 'D2: party booking confirm contains contact name');
}

// -----------------------------------------------------------
// SUITE E: Public event flow — MENU_GROUP_PUBLIC
// -----------------------------------------------------------
console.log('\n=== SUITE E: Public event flow ===');
{
  // E1: Without guest count
  const r1 = runEnricher(widgetCtx('Renginiui siulome:\n[MENU_GROUP_PUBLIC]'));
  validateOutputArray(r1, 'E1 MENU_GROUP_PUBLIC');
  const msgs1 = extractMessages(r1);
  const hasCards1 = msgs1.some(function (m) { return m.content_type === 'cards'; });
  assert(hasCards1, 'E1: MENU_GROUP_PUBLIC produces cards');

  // E2: With guest count 150 — extra header for large groups
  const r2 = runEnricher(widgetCtx('Dideliam renginiui:\n[MENU_GROUP_PUBLIC:150]'));
  validateOutputArray(r2, 'E2 MENU_GROUP_PUBLIC:150');
  const msgs2 = extractMessages(r2);
  const headerMsg2 = msgs2.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Dideliam');
  });
  assert(!!headerMsg2, 'E2: >100 guests shows large-group text header');

  // E3: GUEST_COUNT_PUBLIC
  const r3 = runEnricher(widgetCtx('Kiek dalyvi\u0173 planuojate?\n[GUEST_COUNT_PUBLIC]'));
  validateOutputArray(r3, 'E3 GUEST_COUNT_PUBLIC');
  const msgs3 = extractMessages(r3);
  const guestPublicSelect = msgs3.find(function (m) { return m.content_type === 'input_select'; });
  assert(!!guestPublicSelect, 'E3: GUEST_COUNT_PUBLIC produces input_select');
  const itemCount3 = guestPublicSelect && guestPublicSelect.content_attributes.items.length;
  assert(itemCount3 === 5, 'E3: GUEST_COUNT_PUBLIC has 5 options', itemCount3);

  // E4: Public event with booking confirm alongside equipment cards
  const pubJson = JSON.stringify({
    date: '2026-07-04',
    location: 'Kaunas',
    event_type: 'Imones saskrydis',
    guest_count: '150',
    contact_name: 'Petras P.',
    contact_phone: '+37065432100',
    trampolines: 'Giga ruozas, Dziumandzi parkas'
  });
  const r4 = runEnricher(widgetCtx('[MENU_GROUP_PUBLIC:150]\n[BOOKING_CONFIRM:' + pubJson + ']'));
  validateOutputArray(r4, 'E4 PUBLIC + BOOKING_CONFIRM');
  const msgs4 = extractMessages(r4);
  const hasPublicCards4 = msgs4.some(function (m) { return m.content_type === 'cards'; });
  const hasPublicConfirm4 = msgs4.some(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Petras P.');
  });
  assert(hasPublicCards4, 'E4: equipment cards present alongside booking confirm');
  assert(hasPublicConfirm4, 'E4: booking confirm present alongside equipment cards');
}

// -----------------------------------------------------------
// SUITE F: Equipment purchase flows
// -----------------------------------------------------------
console.log('\n=== SUITE F: Equipment purchase ===');
{
  // F1: PURCHASE_SUBMENU — widget shows full-length labels
  const r1 = runEnricher(widgetCtx('Norite pirkti batuta?\n[PURCHASE_SUBMENU]'));
  validateOutputArray(r1, 'F1 PURCHASE_SUBMENU');
  const msgs1 = extractMessages(r1);
  const submenuMsg1 = msgs1.find(function (m) { return m.content_type === 'input_select'; });
  assert(!!submenuMsg1, 'F1: PURCHASE_SUBMENU produces input_select');
  const submenuItems1 = submenuMsg1 && submenuMsg1.content_attributes.items;
  const customItem1 = submenuItems1 && submenuItems1.find(function (it) {
    return it.title && it.title.includes('Individuali gamyba');
  });
  assert(!!customItem1, 'F1: widget shows full "Individuali gamyba" label (not Messenger-trimmed)');

  // F2: PURCHASE_EMAIL_INPUT — web widget uses form type
  const r2 = runEnricher(widgetCtx('Iveskite el. pasta:\n[PURCHASE_EMAIL_INPUT]'));
  validateOutputArray(r2, 'F2 PURCHASE_EMAIL_INPUT');
  const msgs2 = extractMessages(r2);
  const formMsg2 = msgs2.find(function (m) { return m.content_type === 'form'; });
  assert(!!formMsg2, 'F2: widget PURCHASE_EMAIL_INPUT produces form (not plain text)');
  const formFields2 = formMsg2 && formMsg2.content_attributes && formMsg2.content_attributes.items;
  assert(formFields2 && formFields2.length === 1, 'F2: email form has exactly 1 field');
  assert(formFields2 && formFields2[0].type === 'email', 'F2: field type is email');

  // F3: PURCHASE_CUSTOM_FORM — web widget uses form type with 6 fields
  const r3 = runEnricher(widgetCtx('Uzpildykite forma:\n[PURCHASE_CUSTOM_FORM]'));
  validateOutputArray(r3, 'F3 PURCHASE_CUSTOM_FORM');
  const msgs3 = extractMessages(r3);
  const customFormMsg3 = msgs3.find(function (m) { return m.content_type === 'form'; });
  assert(!!customFormMsg3, 'F3: widget PURCHASE_CUSTOM_FORM produces form');
  const customFields3 = customFormMsg3 && customFormMsg3.content_attributes && customFormMsg3.content_attributes.items;
  assert(customFields3 && customFields3.length === 6,
    'F3: custom order form has 6 fields', customFields3 && customFields3.length);
  const typingItems3 = extractTypingItems(r3);
  assert(typingItems3.length >= 1, 'F3: typing indicator present for form content');
}

// -----------------------------------------------------------
// SUITE G: FAQ / plain text flow
// -----------------------------------------------------------
console.log('\n=== SUITE G: FAQ / plain text flow ===');
{
  const r = runEnricher(widgetCtx(
    'Batutai yra saugus - visi sertifikuoti pagal **EN14960** standarta. ' +
    'Jei turite daugiau klausimu, skambinkite +370 648 803 88.'
  ));
  validateOutputArray(r, 'G1 FAQ plain text');
  const msgs = extractMessages(r);
  assert(msgs.length === 1, 'G1: single text message');
  assert(msgs[0] && msgs[0].content_type === 'text', 'G1: content_type is text');
  assert(msgs[0] && msgs[0].content.includes('*EN14960*'), 'G1: bold converted to * for widget');
}

// -----------------------------------------------------------
// SUITE H: GUEST_COUNT (birthday)
// -----------------------------------------------------------
console.log('\n=== SUITE H: GUEST_COUNT ===');
{
  const r = runEnricher(widgetCtx('Kiek sveciy planuojate?\n[GUEST_COUNT]'));
  validateOutputArray(r, 'H1 GUEST_COUNT');
  const msgs = extractMessages(r);
  const selectMsg = msgs.find(function (m) { return m.content_type === 'input_select'; });
  assert(!!selectMsg, 'H1: GUEST_COUNT produces input_select');
  const itemCount = selectMsg && selectMsg.content_attributes.items.length;
  assert(itemCount === 5, 'H1: GUEST_COUNT has 5 options', itemCount);
}

// -----------------------------------------------------------
// SUITE I: Mixed / multi-marker responses
// -----------------------------------------------------------
console.log('\n=== SUITE I: Mixed / multi-marker responses ===');
{
  // I1: Text before and after a marker
  const r1 = runEnricher(widgetCtx(
    'Labas! Esame batutynas.lt.\n[MAIN_MENU]\nLaukiame jusu!'
  ));
  validateOutputArray(r1, 'I1 text before+after marker');
  const msgs1 = extractMessages(r1);
  const textMsgs1 = msgs1.filter(function (m) { return m.content_type === 'text'; });
  const selectMsgs1 = msgs1.filter(function (m) { return m.content_type === 'input_select'; });
  assert(textMsgs1.length >= 1, 'I1: at least one text message');
  assert(selectMsgs1.length >= 1, 'I1: at least one select message');

  // I2: Multiple markers — DATE_PICKER and GUEST_COUNT
  const r2 = runEnricher(widgetCtx(
    'Puiku, tesiame!\n[DATE_PICKER]\nKiek sveciu?\n[GUEST_COUNT]'
  ));
  validateOutputArray(r2, 'I2 multiple markers');
  const msgs2 = extractMessages(r2);
  const selects2 = msgs2.filter(function (m) { return m.content_type === 'input_select'; });
  assert(selects2.length >= 2, 'I2: two select messages from two markers', selects2.length);

  // I3: MENU_GROUP_BIRTHDAY + ADDON_UPSELL in same response
  const r3 = runEnricher(widgetCtx(
    'Batutai:\n[MENU_GROUP_BIRTHDAY:8]\nPapildomos pramogos:\n[ADDON_UPSELL]'
  ));
  validateOutputArray(r3, 'I3 BIRTHDAY + ADDON in same response');
  const msgs3 = extractMessages(r3);
  const cardsMsgs3 = msgs3.filter(function (m) { return m.content_type === 'cards'; });
  assert(cardsMsgs3.length >= 2, 'I3: at least 2 cards messages', cardsMsgs3.length);
}

// -----------------------------------------------------------
// SUITE J: BOOKING_CONFIRM with multiple addons
// -----------------------------------------------------------
console.log('\n=== SUITE J: BOOKING_CONFIRM with multiple addons ===');
{
  const multiAddonJson = JSON.stringify({
    date: '2026-08-15',
    location: 'Silute',
    event_type: 'Gimtadienis',
    guest_count: '12',
    contact_name: 'Andrius A.',
    contact_phone: '+37068881234',
    trampoline: 'Candy Pop',
    addons: 'Milziniskas Dart, Rodeo bulius, Saldesiu aparatai'
  });
  const r = runEnricher(widgetCtx('[BOOKING_CONFIRM:' + multiAddonJson + ']'));
  validateOutputArray(r, 'J1 BOOKING_CONFIRM with addons');
  const msgs = extractMessages(r);
  const confirmMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Andrius A.');
  });
  assert(!!confirmMsg, 'J1: confirm message present');
  assert(confirmMsg && confirmMsg.content.includes('Milziniskas Dart'), 'J1: addons listed in confirm');
  assert(confirmMsg && confirmMsg.content.includes('Candy Pop'), 'J1: trampoline in confirm');
}

// -----------------------------------------------------------
// SUITE K: HUMAN_HANDOFF
// -----------------------------------------------------------
console.log('\n=== SUITE K: HUMAN_HANDOFF ===');
{
  const r = runEnricher(widgetCtx('Musu komanda netrukus susieks!\n[HUMAN_HANDOFF]'));
  validateOutputArray(r, 'K1 HUMAN_HANDOFF');
  const msgs = extractMessages(r);
  const handoffMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('+370 648 803 88');
  });
  assert(!!handoffMsg, 'K1: handoff message contains contact number');

  // Telegram notification item
  const telegramItems = r.filter(function (item) {
    if (!item || !item.json || !item.json._body) return false;
    try {
      const body = JSON.parse(item.json._body);
      return !!body.chat_id;
    } catch (e) { return false; }
  });
  assert(telegramItems.length === 1, 'K1: exactly 1 Telegram notification item');
  const tgBody = telegramItems.length > 0 && JSON.parse(telegramItems[0].json._body);
  assert(tgBody && tgBody.text && tgBody.text.includes('Svetain'), 'K1: Telegram msg mentions website channel');
}

// -----------------------------------------------------------
// SUITE L: Edge cases
// -----------------------------------------------------------
console.log('\n=== SUITE L: Edge cases ===');

// L1: Empty AI response
{
  const r = runEnricher(widgetCtx(''));
  validateOutputArray(r, 'L1 empty response');
  const msgs = extractMessages(r);
  assert(msgs.length >= 1, 'L1: fallback message generated for empty response');
  assert(msgs[0] && msgs[0].content_type === 'text', 'L1: fallback is text type');
  assert(msgs[0] && msgs[0].content.includes('+370 648 803 88'), 'L1: fallback contains contact number');
}

// L2: Whitespace-only response
{
  const r = runEnricher(widgetCtx('   \n\n   '));
  validateOutputArray(r, 'L2 whitespace-only response');
  const msgs = extractMessages(r);
  assert(msgs.length >= 1, 'L2: fallback for whitespace-only');
  assert(msgs[0] && msgs[0].content.includes('+370 648 803 88'), 'L2: fallback message has contact');
}

// L3: Text only, no markers
{
  const r = runEnricher(widgetCtx('Beje, ar zinojote, kad musu batutai yra sertifikuoti?'));
  validateOutputArray(r, 'L3 text only no markers');
  const msgs = extractMessages(r);
  assert(msgs.length === 1, 'L3: exactly 1 text message');
  const allContent = msgs.map(function (m) { return m.content || ''; }).join(' ');
  assert(!allContent.includes('['), 'L3: no bracket characters in output');
}

// L4: Unknown marker [FAKE_MARKER] — stripped from output
{
  const r = runEnricher(widgetCtx('Labas! [FAKE_MARKER] Iki!'));
  validateOutputArray(r, 'L4 unknown marker');
  const msgs = extractMessages(r);
  const allContent = msgs.map(function (m) { return m.content || ''; }).join(' ');
  assert(!allContent.includes('FAKE_MARKER'), 'L4: [FAKE_MARKER] is stripped from output', allContent);
  assert(msgs.length >= 1, 'L4: at least 1 message produced');
  // The text before/after the marker should still appear
  const hasLabas = allContent.includes('Labas');
  const hasIki   = allContent.includes('Iki');
  assert(hasLabas || hasIki, 'L4: surrounding text is preserved');
}

// L5: Malformed BOOKING_CONFIRM — no closing bracket
// KNOWN ENRICHER BEHAVIOR: when the closing }] is missing, the hasMarker quick-check
// regex does fire (it matches "BOOKING_CONFIRM:"), but the allMarkerRegex never matches.
// The text segment then contains the raw "[BOOKING_CONFIRM:..." string which is NOT
// stripped by FR-3.1 because there is no closing ]. This causes the raw marker text
// to leak verbatim into the user-facing message. This test documents the actual behavior.
{
  const r = runEnricher(widgetCtx('Patvirtinimas: [BOOKING_CONFIRM:{"date":"2026-01-01"'));
  validateOutputArray(r, 'L5 malformed BOOKING_CONFIRM no closing bracket');
  const msgs = extractMessages(r);
  assert(msgs.length >= 1, 'L5: at least 1 message even with malformed marker');
  // KNOWN BUG: raw BOOKING_CONFIRM text leaks when closing }] is missing
  // because FR-3.1 strip regex requires a closing ] which is absent here.
  const allContent5 = msgs.map(function (m) { return m.content || ''; }).join(' ');
  const doesLeak = allContent5.includes('BOOKING_CONFIRM');
  assert(doesLeak, 'L5 [KNOWN ENRICHER BUG]: malformed marker without closing ] leaks raw text to user');
}

// L6: BOOKING_CONFIRM with syntactically valid brackets but JSON parse error
{
  const r = runEnricher(widgetCtx('[BOOKING_CONFIRM:{not valid json}]'));
  validateOutputArray(r, 'L6 BOOKING_CONFIRM invalid JSON');
  const msgs = extractMessages(r);
  // Should show the generic fallback (buildBookingConfirm returns "Užklausa gauta!" for null data)
  // Note: "Užklausa" starts with 'U' + U+017E (ž) — not ASCII 'z'.
  const confirmMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content &&
      (m.content.includes('gauta') || m.content.includes('pateikta'));
  });
  assert(!!confirmMsg, 'L6: invalid JSON produces generic confirm/fallback text message');
}

// L7: Very long text (>2000 chars) before a marker
{
  const longText = 'Labas! '.repeat(400); // ~2800 chars
  const r = runEnricher(widgetCtx(longText + '\n[MAIN_MENU]'));
  validateOutputArray(r, 'L7 very long text before marker');
  const msgs = extractMessages(r);
  const hasMenu = msgs.some(function (m) { return m.content_type === 'input_select'; });
  assert(hasMenu, 'L7: MAIN_MENU still renders after very long text');
  assert(msgs.length >= 1, 'L7: output is non-empty');
}

// L8: Multiple MENU_GROUP_BIRTHDAY markers in one response
{
  const r = runEnricher(widgetCtx('[MENU_GROUP_BIRTHDAY:5]\n[MENU_GROUP_BIRTHDAY:12]'));
  validateOutputArray(r, 'L8 duplicate equipment markers');
  const msgs = extractMessages(r);
  const cardsMsgs = msgs.filter(function (m) { return m.content_type === 'cards'; });
  assert(cardsMsgs.length >= 2, 'L8: two separate cards groups rendered', cardsMsgs.length);
}

// L9: Marker with extra whitespace [ MAIN_MENU ] — should NOT trigger MAIN_MENU
{
  const r = runEnricher(widgetCtx('[ MAIN_MENU ]'));
  validateOutputArray(r, 'L9 marker with extra whitespace');
  const msgs = extractMessages(r);
  const hasMenu = msgs.some(function (m) { return m.content_type === 'input_select' &&
    m.content_attributes && m.content_attributes.items &&
    m.content_attributes.items.length === 5
  });
  assert(!hasMenu, 'L9: whitespace-padded [ MAIN_MENU ] does not trigger MAIN_MENU');
}

// L10: Missing conversationId — should return _skip item
{
  const r = runEnricher({
    filterExtract: { isMessenger: false, contactName: 'Test' }, // no conversationId
    agentOutput: { output: 'Labas!' }
  });
  assert(Array.isArray(r), 'L10: returns array even without conversationId');
  const skipItem = r.find(function (item) { return item && item.json && item.json._skip; });
  assert(!!skipItem, 'L10: _skip item returned when conversationId missing');
}

// L11: BOOKING_CONFIRM with missing contact info — appends warning
{
  const noContactJson = JSON.stringify({
    date: '2026-09-01',
    location: 'Jurbarkas',
    event_type: 'Gimtadienis',
    guest_count: '8',
    trampoline: 'Chameleonas'
  });
  const r = runEnricher(widgetCtx('[BOOKING_CONFIRM:' + noContactJson + ']'));
  validateOutputArray(r, 'L11 BOOKING_CONFIRM missing contact');
  const msgs = extractMessages(r);
  const confirmMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Chameleonas');
  });
  assert(!!confirmMsg, 'L11: confirm message present');
  assert(confirmMsg && confirmMsg.content.includes('\u26a0\ufe0f'), 'L11: missing contact triggers warning emoji');
}

// L12: BOOKING_CONFIRM with empty JSON object — generic fallback
{
  const r = runEnricher(widgetCtx('[BOOKING_CONFIRM:{}]'));
  validateOutputArray(r, 'L12 BOOKING_CONFIRM empty object');
  const msgs = extractMessages(r);
  const fallbackMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content &&
      (m.content.includes('gauta') || m.content.includes('pateikta'));
  });
  assert(!!fallbackMsg, 'L12: empty JSON {} triggers fallback/confirm text');
}

// L13: MENU_GROUP_BIRTHDAY with large guest count (>15) — shows public event CTA
{
  const r = runEnricher(widgetCtx('[MENU_GROUP_BIRTHDAY:30]'));
  validateOutputArray(r, 'L13 birthday large group >15');
  const msgs = extractMessages(r);
  // CTA value is "Planuoju viešą renginį arba įmonės sąskrydį"
  // "viešą" = v,i,e,š(U+0161),ą — search for "vieš" using the actual Unicode char
  const ctaSelect = msgs.find(function (m) {
    return m.content_type === 'input_select' && m.content_attributes && m.content_attributes.items &&
      m.content_attributes.items.some(function (it) {
        return it.value && it.value.includes('vie\u0161');
      });
  });
  assert(!!ctaSelect, 'L13: large birthday group shows public event CTA select');
}

// L14: agentOutput uses .text field (not .output)
{
  const ctx = {
    filterExtract: {
      isMessenger: false,
      conversationId: 'conv-text-field',
      contactName: 'Ruta'
    },
    agentOutput: { text: 'Atsakymas is text lauko.' }
  };
  const r = runEnricher(ctx);
  validateOutputArray(r, 'L14 agentOutput.text field');
  const msgs = extractMessages(r);
  assert(msgs.length >= 1, 'L14: handles agentOutput.text field');
  assert(msgs[0] && msgs[0].content.includes('Atsakymas'), 'L14: content from .text field preserved');
}

// L15: BOOKING_CONFIRM with comma-separated addons (nested content test)
{
  const nestedJson = JSON.stringify({
    date: '2026-10-31',
    location: 'Taurage',
    event_type: 'Gimtadienis',
    guest_count: '10',
    contact_name: 'Zivile Z.',
    contact_phone: '+37067778899',
    trampoline: 'Mega Waikiki',
    addons: 'Milziniskas Dart, Rodeo bulius'
  });
  const r = runEnricher(widgetCtx('[BOOKING_CONFIRM:' + nestedJson + ']'));
  validateOutputArray(r, 'L15 BOOKING_CONFIRM comma-separated addons');
  const msgs = extractMessages(r);
  const confirmMsg = msgs.find(function (m) {
    return m.content_type === 'text' && m.content && m.content.includes('Zivile Z.');
  });
  assert(!!confirmMsg, 'L15: confirm rendered with contact name');
  assert(confirmMsg && confirmMsg.content.includes('Milziniskas Dart'), 'L15: first addon in confirm');
  assert(confirmMsg && confirmMsg.content.includes('Rodeo bulius'), 'L15: second addon in confirm');
}

// -----------------------------------------------------------
// SUITE M: _url and _body structure on every output item
// -----------------------------------------------------------
console.log('\n=== SUITE M: _url and _body structure ===');
{
  const scenarios = [
    { name: 'M1 text msg', input: 'Labas!' },
    { name: 'M2 main menu', input: '[MAIN_MENU]' },
    { name: 'M3 date picker', input: '[DATE_PICKER]' },
    { name: 'M4 birthday equipment', input: '[MENU_GROUP_BIRTHDAY]' },
    { name: 'M5 addon upsell', input: '[ADDON_UPSELL]' },
    { name: 'M6 booking confirm', input: '[BOOKING_CONFIRM:{"date":"2026-01-01","location":"X","contact_name":"Y","contact_phone":"Z"}]' },
    { name: 'M7 guest count', input: '[GUEST_COUNT]' },
    { name: 'M8 public equipment', input: '[MENU_GROUP_PUBLIC:50]' }
  ];

  scenarios.forEach(function (s) {
    const r = runEnricher(widgetCtx(s.input));
    r.forEach(function (item, i) {
      if (!item || !item.json) return;
      const j = item.json;
      if (j._skip) return;
      assert(typeof j._url === 'string' && j._url.length > 0,
        s.name + ': item[' + i + '] has non-empty _url string');
      assert(typeof j._body === 'string' && j._body.length > 0,
        s.name + ': item[' + i + '] has non-empty _body string');
      let parsed = null;
      try { parsed = JSON.parse(j._body); } catch (e) { parsed = null; }
      assert(parsed !== null, s.name + ': item[' + i + '] _body is valid JSON');
    });
  });
}

// -----------------------------------------------------------
// FINAL REPORT
// -----------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\nFAILURES:');
  failures.forEach(function (f, i) {
    console.log('\n' + (i + 1) + '. ' + f.test);
    if (f.detail !== undefined) {
      console.log('   ' + JSON.stringify(f.detail, null, 4).replace(/\n/g, '\n   '));
    }
  });
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
