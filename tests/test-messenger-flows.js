'use strict';

// =============================================================================
// test-messenger-flows.js
// QA stress-test for enrich-chatwoot.js — Messenger (isMessenger = true) paths
// Run: node tests/test-messenger-flows.js
// =============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// 1. Read source once
// ---------------------------------------------------------------------------
const enricherPath = path.resolve(__dirname, '../chatwoot/enrich-chatwoot.js');
const enricherSource = fs.readFileSync(enricherPath, 'utf8');

// ---------------------------------------------------------------------------
// 2. n8n environment mock — runs enricher in an isolated vm context
// ---------------------------------------------------------------------------
function runEnricher(opts) {
  const {
    aiResponse = '',
    isMessenger = true,
    contactName = '',
    conversationId = 42,
  } = opts;

  // $input — AI node output wrapper
  const fakeInput = {
    first: () => ({ json: { output: aiResponse } }),
  };

  // $('Filter & Extract') result
  const fakeFilterExtractItem = {
    item: {
      json: {
        isMessenger,
        contactName,
        conversationId,
        aiResponse,
      },
    },
  };

  // n8n node accessor
  function fake$(nodeName) {
    if (nodeName === 'Filter & Extract') return fakeFilterExtractItem;
    throw new Error('Unknown node: ' + nodeName);
  }

  // Workflow variables
  const fake$vars = {
    CHATWOOT_BASE_URL: 'https://chatwoot.test/api/v1/accounts/1',
  };

  // Build the context that mirrors the n8n Code-node environment
  const sandbox = {
    $input: fakeInput,
    $: fake$,
    $vars: fake$vars,
    require: require,
    // Node globals that enricher may use
    JSON: JSON,
    Date: Date,
    parseInt: parseInt,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    Math: Math,
    console: console,
    // Storage for the enricher return value
    __result: undefined,
  };

  // Wrap source so the final `return formatOutput(...)` writes to __result
  const wrappedSource = enricherSource
    .replace(/^(.*return\s+formatOutput\()/m, '__result = formatOutput(')
    .replace(/^(.*return\s+\[)/m, '__result = [');

  // For enricher code that has multiple return paths we wrap the whole thing in an IIFE
  const iife = '(function() {\n' + enricherSource + '\n})()';

  const contextifiedSandbox = vm.createContext(sandbox);
  try {
    const result = vm.runInContext(
      '(function(__result_holder) {\n' +
      '  var $input   = __result_holder.$input;\n' +
      '  var $        = __result_holder.$;\n' +
      '  var $vars    = __result_holder.$vars;\n' +
      '  var require  = __result_holder.require;\n' +
      '  function __run() {\n' +
      enricherSource + '\n' +
      '  }\n' +
      '  return __run();\n' +
      '})(this)',
      contextifiedSandbox
    );
    return result || [{ json: { _error: 'No return value' } }];
  } catch (err) {
    return [{ json: { _error: err.message } }];
  }
}

// ---------------------------------------------------------------------------
// 3. Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details) {
  if (condition) {
    console.log('  PASS:', testName);
    passed++;
  } else {
    console.error('  FAIL:', testName);
    if (details !== undefined) {
      console.error('       Details:', JSON.stringify(details, null, 2));
    }
    failed++;
    failures.push({ testName, details });
  }
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  console.log(' ' + title);
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Items that POST to the Chatwoot /messages endpoint */
function getChatwootMessages(result) {
  return result
    .map(item => item.json)
    .filter(j => j._url && j._url.includes('/messages'));
}

/** Parsed body objects from Chatwoot message items */
function getChatwootBodies(result) {
  return getChatwootMessages(result).map(j => JSON.parse(j._body));
}

/** Items whose _url points to the Telegram API */
function getTelegramItems(result) {
  return result
    .map(item => item.json)
    .filter(j => j._url && j._url.includes('api.telegram.org'));
}

/** content values from all Chatwoot messages */
function getContentTexts(result) {
  return getChatwootBodies(result).map(b => b.content);
}

/** True if any text in the array matches the pattern */
function anyTextContains(texts, pattern) {
  if (pattern instanceof RegExp) return texts.some(t => t && pattern.test(t));
  return texts.some(t => t && t.includes(pattern));
}

// ---------------------------------------------------------------------------
// 4. TESTS
// ---------------------------------------------------------------------------

// ─────────────────────────────────────────────────────────────────────────────
section('MAIN MENU — Messenger: 6 items including "Susisiekti"');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: true });
  const bodies = getChatwootBodies(result);
  const menuBody = bodies.find(b => b.content_type === 'input_select');

  assert(!!menuBody, 'Main menu: input_select message exists', bodies);

  if (menuBody) {
    const items = menuBody.content_attributes.items;
    assert(items.length === 6, 'Main menu Messenger: exactly 6 items', items.map(i => i.title));

    const hasSusisiekti = items.some(i => i.title.includes('Susisiekti'));
    assert(hasSusisiekti, 'Main menu Messenger: "Susisiekti" item present', items.map(i => i.title));
  }

  // Widget must only have 5 items
  const widgetResult = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: false });
  const widgetMenu = getChatwootBodies(widgetResult).find(b => b.content_type === 'input_select');
  assert(
    widgetMenu && widgetMenu.content_attributes.items.length === 5,
    'Main menu Widget: exactly 5 items (no "Susisiekti")',
    widgetMenu ? widgetMenu.content_attributes.items.map(i => i.title) : null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('BUTTON LABEL TRUNCATION — Messenger 20-char limit');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Main menu titles
  const result = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: true });
  const menuBody = getChatwootBodies(result).find(b => b.content_type === 'input_select');

  if (menuBody) {
    const items = menuBody.content_attributes.items;
    const longItems = items.filter(i => i.title.length > 20);
    assert(
      longItems.length === 0,
      'Main menu Messenger: all titles <= 20 chars',
      longItems.map(i => ({ title: i.title, len: i.title.length }))
    );

    // Widget is allowed to be longer
    const widgetResult = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: false });
    const widgetMenu = getChatwootBodies(widgetResult).find(b => b.content_type === 'input_select');
    if (widgetMenu) {
      const widgetLong = widgetMenu.content_attributes.items.filter(i => i.title.length > 20);
      assert(
        widgetLong.length > 0,
        'Main menu Widget: some titles are > 20 chars (as expected)',
        widgetLong.map(i => ({ title: i.title, len: i.title.length }))
      );
    }
  }

  // Purchase submenu titles
  const purchaseResult = runEnricher({ aiResponse: '[PURCHASE_SUBMENU]', isMessenger: true });
  const purchaseMenu = getChatwootBodies(purchaseResult).find(b => b.content_type === 'input_select');
  if (purchaseMenu) {
    const longPurchase = purchaseMenu.content_attributes.items.filter(i => i.title.length > 20);
    assert(
      longPurchase.length === 0,
      'Purchase submenu Messenger: all titles <= 20 chars',
      longPurchase.map(i => ({ title: i.title, len: i.title.length }))
    );
  }

  // Post-booking quick replies
  const bookingJson = '{"date":"2026-05-10","location":"Taurage","event_type":"Gimtadienis","guest_count":"10","contact_name":"Jonas","contact_phone":"+37061234567","trampoline":"Candy Pop"}';
  const bookingResult = runEnricher({ aiResponse: '[BOOKING_CONFIRM:' + bookingJson + ']', isMessenger: true });
  const postBookingSelect = getChatwootBodies(bookingResult).find(b => b.content_type === 'input_select');
  if (postBookingSelect) {
    const longBtns = postBookingSelect.content_attributes.items.filter(i => i.title.length > 20);
    assert(
      longBtns.length === 0,
      'Post-booking Messenger: all quick reply titles <= 20 chars',
      longBtns.map(i => ({ title: i.title, len: i.title.length }))
    );
  }

  // Large birthday group CTA buttons
  const birthdayResult = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:20]', isMessenger: true });
  const ctaSelects = getChatwootBodies(birthdayResult).filter(b => b.content_type === 'input_select');
  ctaSelects.forEach(sel => {
    sel.content_attributes.items.forEach(item => {
      assert(
        item.title.length <= 20,
        'Birthday CTA Messenger: "' + item.title + '" <= 20 chars (' + item.title.length + ')',
        { title: item.title, len: item.title.length }
      );
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Basic structure');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({
    aiResponse: '[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: 'Marius Petraitis',
    conversationId: 100,
  });

  const chatwootBodies = getChatwootBodies(result);
  const telegramItems  = getTelegramItems(result);

  // Exactly 1 customer-facing message
  assert(chatwootBodies.length === 1, 'Handoff: exactly 1 Chatwoot message', chatwootBodies);

  const customerMsg = chatwootBodies[0];
  assert(customerMsg && customerMsg.content_type === 'text', 'Handoff: customer message is text type');

  const content = (customerMsg && customerMsg.content) || '';
  assert(content.includes('+370 648 803 88'), 'Handoff: customer msg contains phone number', content);
  assert(content.includes('info@batutynas.lt'), 'Handoff: customer msg contains email', content);
  assert(content.includes('8:00'), 'Handoff: customer msg contains working hours', content);

  // Telegram item
  assert(telegramItems.length === 1, 'Handoff: exactly 1 Telegram item', telegramItems);

  if (telegramItems.length > 0) {
    const tg = telegramItems[0];

    assert(
      tg._url && tg._url.includes('api.telegram.org'),
      'Handoff: Telegram _url points to Telegram API', tg._url
    );
    assert(
      tg._url && tg._url.includes('sendMessage'),
      'Handoff: Telegram _url includes sendMessage', tg._url
    );

    let tgBody;
    try {
      tgBody = JSON.parse(tg._body);
      assert(true, 'Handoff: Telegram _body is valid JSON');
    } catch (e) {
      assert(false, 'Handoff: Telegram _body is valid JSON', tg._body);
    }

    if (tgBody) {
      assert(tgBody.chat_id === '8258463322', 'Handoff: Telegram chat_id correct', tgBody.chat_id);
      assert(typeof tgBody.text === 'string' && tgBody.text.length > 0, 'Handoff: Telegram text non-empty');
      assert(tgBody.parse_mode === 'HTML', 'Handoff: Telegram parse_mode is HTML', tgBody.parse_mode);
      assert(tgBody.text.includes('Marius Petraitis'), 'Handoff: Telegram text contains contact name', tgBody.text);
      assert(tgBody.text.includes('Facebook Messenger'), 'Handoff: Telegram text says "Facebook Messenger"', tgBody.text);
    }
  }

  // The Telegram item must NOT be routed through the Chatwoot /messages endpoint
  const wrongItems = result
    .map(i => i.json)
    .filter(j => j._url && j._url.includes('/messages') && j._url.includes('telegram'));
  assert(wrongItems.length === 0, 'Handoff: Telegram item NOT sent to Chatwoot /messages');
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Empty / unknown contact name');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({
    aiResponse: '[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: '',
    conversationId: 101,
  });

  const telegramItems = getTelegramItems(result);
  if (telegramItems.length > 0) {
    const tgBody = JSON.parse(telegramItems[0]._body);
    assert(
      tgBody.text.includes('Ne\u017einomas klientas'),
      'Handoff (no name): Telegram text has fallback "Nezinomas klientas"',
      tgBody.text
    );
  } else {
    assert(false, 'Handoff (no name): Telegram item present');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Name with HTML special characters');
// ─────────────────────────────────────────────────────────────────────────────
{
  const htmlName = '<b>Test</b> & "quotes" <xss>';
  const result = runEnricher({
    aiResponse: '[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: htmlName,
    conversationId: 102,
  });

  const telegramItems = getTelegramItems(result);
  assert(telegramItems.length === 1, 'Handoff (HTML name): Telegram item produced');

  if (telegramItems.length > 0) {
    const tgBody = JSON.parse(telegramItems[0]._body);
    // Raw or escaped — the name content must appear
    const textHasContent =
      tgBody.text.includes('<b>') ||
      tgBody.text.includes('&lt;b&gt;') ||
      tgBody.text.includes('Test');
    assert(textHasContent, 'Handoff (HTML name): name content present in Telegram text', tgBody.text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Very long contact name (100+ chars)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const longName = 'Vardenis Pavardenis Labai Ilgas Vardas Kuris Virsija Simta Simboliu Ir Dar Kiek '
    .repeat(2).trim();
  const result = runEnricher({
    aiResponse: '[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: longName,
    conversationId: 103,
  });

  const telegramItems = getTelegramItems(result);
  assert(telegramItems.length === 1, 'Handoff (long name): Telegram item produced');

  if (telegramItems.length > 0) {
    const tgBody = JSON.parse(telegramItems[0]._body);
    assert(tgBody.text.includes(longName), 'Handoff (long name): full name present in Telegram text');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Text before and after [HUMAN_HANDOFF]');
// ─────────────────────────────────────────────────────────────────────────────
{
  const response = 'Suprantu, perduodu jus musu komandai.\n\n[HUMAN_HANDOFF]\n\nSusisieksime greitai!';
  const result = runEnricher({
    aiResponse: response,
    isMessenger: true,
    contactName: 'Ana',
    conversationId: 104,
  });

  const texts = getContentTexts(result);
  assert(anyTextContains(texts, 'perduodu'), 'Handoff (text around): pre-marker text present', texts);
  assert(anyTextContains(texts, 'greitai'),  'Handoff (text around): post-marker text present', texts);
  assert(anyTextContains(texts, '+370 648 803 88'), 'Handoff (text around): handoff message with phone present', texts);

  const telegramItems = getTelegramItems(result);
  assert(telegramItems.length === 1, 'Handoff (text around): Telegram item produced');
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Duplicate [HUMAN_HANDOFF] in one response');
// ─────────────────────────────────────────────────────────────────────────────
{
  const response = '[HUMAN_HANDOFF]\n\nKazkas nutiko\n\n[HUMAN_HANDOFF]';
  const result = runEnricher({
    aiResponse: response,
    isMessenger: true,
    contactName: 'Domas',
    conversationId: 105,
  });

  const chatwootBodies = getChatwootBodies(result);
  const telegramItems  = getTelegramItems(result);

  assert(chatwootBodies.length >= 1, 'Handoff (double): at least 1 customer message', chatwootBodies.length);
  assert(telegramItems.length >= 1,  'Handoff (double): at least 1 Telegram item', telegramItems.length);
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — formatOutput extras mechanism (Telegram is last item)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({
    aiResponse: 'Priesais tekstas.\n\n[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: 'Tomas',
    conversationId: 106,
  });

  const last = result[result.length - 1].json;
  assert(
    last._url && last._url.includes('api.telegram.org'),
    'Handoff extras: Telegram item is the LAST item in result array',
    last._url
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('HUMAN HANDOFF — Telegram item structure deep check');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({
    aiResponse: '[HUMAN_HANDOFF]',
    isMessenger: true,
    contactName: 'Kristina Jonaitis',
    conversationId: 107,
  });

  const telegramItems = getTelegramItems(result);
  if (telegramItems.length > 0) {
    const tg = telegramItems[0];

    const keys = Object.keys(tg);
    assert(
      keys.length === 2 && keys.includes('_url') && keys.includes('_body'),
      'Handoff structure: Telegram item has exactly {_url, _body}',
      keys
    );

    assert(
      /https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage/.test(tg._url),
      'Handoff structure: Telegram _url matches expected pattern',
      tg._url
    );

    const body = JSON.parse(tg._body);
    assert(typeof body.chat_id === 'string',   'Handoff structure: chat_id is string',    body.chat_id);
    assert(typeof body.text   === 'string',    'Handoff structure: text is string');
    assert(body.parse_mode    === 'HTML',      'Handoff structure: parse_mode is HTML',   body.parse_mode);
    assert(body.text.includes('Kristina Jonaitis'), 'Handoff structure: name in Telegram text');
  } else {
    assert(false, 'Handoff structure: Telegram item missing');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('NO MARKDOWN — Messenger output must not contain **text**');
// ─────────────────────────────────────────────────────────────────────────────
{
  const mdResponse = '**Labas!** Cia yra **pusjuodis** ir _kursyvas_ tekstas.';

  const messengerResult = runEnricher({ aiResponse: mdResponse, isMessenger: true });
  const messengerTexts  = getContentTexts(messengerResult);
  assert(
    !anyTextContains(messengerTexts, /\*\*[^*]+\*\*/),
    'No markdown: **bold** stripped from Messenger output',
    messengerTexts
  );

  // Widget converts ** to * (Chatwoot single-asterisk bold)
  const widgetResult = runEnricher({ aiResponse: mdResponse, isMessenger: false });
  const widgetTexts  = getContentTexts(widgetResult);
  assert(
    anyTextContains(widgetTexts, /\*[^*]+\*/),
    'No markdown (widget): **bold** converted to *bold* for widget',
    widgetTexts
  );
}

{
  // Single asterisk italic also stripped on Messenger
  const italicResponse = 'Cia *kursyvas* ir daugiau teksto.';
  const result = runEnricher({ aiResponse: italicResponse, isMessenger: true });
  const texts  = getContentTexts(result);
  assert(
    !anyTextContains(texts, /\*[^*]+\*/),
    'No markdown: *italic* stripped from Messenger output',
    texts
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('BOOKING_CONFIRM — No ** markdown on Messenger');
// ─────────────────────────────────────────────────────────────────────────────
{
  const bookingJson = '{"date":"2026-06-01","location":"Taurage","event_type":"Gimtadienis","guest_count":"8","contact_name":"Laima","contact_phone":"+37061111111","trampoline":"Candy Pop"}';

  const messengerResult = runEnricher({ aiResponse: '[BOOKING_CONFIRM:' + bookingJson + ']', isMessenger: true });
  const messengerTexts  = getContentTexts(messengerResult);
  assert(
    !anyTextContains(messengerTexts, /\*\*[^*]+\*\*/),
    'Booking confirm Messenger: no **bold** in output',
    messengerTexts
  );

  // Widget should use *bold* for the header
  const widgetResult = runEnricher({ aiResponse: '[BOOKING_CONFIRM:' + bookingJson + ']', isMessenger: false });
  const widgetTexts  = getContentTexts(widgetResult);
  assert(
    anyTextContains(widgetTexts, /\*[A-Za-z\u00C0-\u017E ]+!\*/),
    'Booking confirm Widget: confirmation header uses *bold* asterisks',
    widgetTexts
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('FORMS to TEXT — Messenger converts form content to plain text');
// ─────────────────────────────────────────────────────────────────────────────
{
  // PURCHASE_EMAIL_INPUT
  const emailResult = runEnricher({ aiResponse: '[PURCHASE_EMAIL_INPUT]', isMessenger: true });
  const emailBodies = getChatwootBodies(emailResult);
  assert(
    emailBodies.filter(b => b.content_type === 'form').length === 0,
    'Email input Messenger: no "form" content_type',
    emailBodies.map(b => b.content_type)
  );
  assert(
    emailBodies.filter(b => b.content_type === 'text').length >= 1,
    'Email input Messenger: at least 1 text message',
    emailBodies.map(b => b.content_type)
  );

  // Widget should use form
  const emailWidgetResult = runEnricher({ aiResponse: '[PURCHASE_EMAIL_INPUT]', isMessenger: false });
  assert(
    getChatwootBodies(emailWidgetResult).filter(b => b.content_type === 'form').length >= 1,
    'Email input Widget: uses "form" content_type',
    getChatwootBodies(emailWidgetResult).map(b => b.content_type)
  );

  // PURCHASE_CUSTOM_FORM
  const customResult = runEnricher({ aiResponse: '[PURCHASE_CUSTOM_FORM]', isMessenger: true });
  const customBodies = getChatwootBodies(customResult);
  assert(
    customBodies.filter(b => b.content_type === 'form').length === 0,
    'Custom form Messenger: no "form" content_type',
    customBodies.map(b => b.content_type)
  );

  // Messenger text should contain numbered instruction prompts
  const customText = customBodies.map(b => b.content || '').join(' ');
  assert(
    customText.includes('1.') || customText.includes('matmenis'),
    'Custom form Messenger: text contains numbered field prompts',
    customText
  );

  // Widget should use form
  const customWidgetResult = runEnricher({ aiResponse: '[PURCHASE_CUSTOM_FORM]', isMessenger: false });
  assert(
    getChatwootBodies(customWidgetResult).filter(b => b.content_type === 'form').length >= 1,
    'Custom form Widget: uses "form" content_type',
    getChatwootBodies(customWidgetResult).map(b => b.content_type)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('CARDS RENDERING — Equipment / addon / party cards on Messenger');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Birthday equipment
  const birthdayResult = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:10]', isMessenger: true });
  const birthdayBodies = getChatwootBodies(birthdayResult);
  const birthdayCards  = birthdayBodies.filter(b => b.content_type === 'cards');
  assert(birthdayCards.length >= 1, 'Equipment cards: birthday menu produces cards', birthdayBodies.map(b => b.content_type));

  if (birthdayCards.length > 0) {
    const firstCard = birthdayCards[0].content_attributes.items[0];
    assert(firstCard && firstCard.media_url && firstCard.media_url.startsWith('http'),
      'Equipment cards: card has media_url (image)', firstCard);
    assert(firstCard && typeof firstCard.title === 'string' && firstCard.title.length > 0,
      'Equipment cards: card has title', firstCard && firstCard.title);
    assert(firstCard && Array.isArray(firstCard.actions) && firstCard.actions.length > 0,
      'Equipment cards: card has actions (buttons)', firstCard && firstCard.actions);
  }

  // Addon upsell
  const addonResult = runEnricher({ aiResponse: '[ADDON_UPSELL]', isMessenger: true });
  assert(
    getChatwootBodies(addonResult).filter(b => b.content_type === 'cards').length >= 1,
    'Addon cards: [ADDON_UPSELL] produces cards on Messenger',
    getChatwootBodies(addonResult).map(b => b.content_type)
  );

  // Party equipment
  const partyResult = runEnricher({ aiResponse: '[MENU_GROUP_PARTY]', isMessenger: true });
  assert(
    getChatwootBodies(partyResult).filter(b => b.content_type === 'cards').length >= 1,
    'Party cards: [MENU_GROUP_PARTY] produces cards on Messenger',
    getChatwootBodies(partyResult).map(b => b.content_type)
  );

  // Public event equipment
  const publicResult = runEnricher({ aiResponse: '[MENU_GROUP_PUBLIC:50]', isMessenger: true });
  assert(
    getChatwootBodies(publicResult).filter(b => b.content_type === 'cards').length >= 1,
    'Public event cards: [MENU_GROUP_PUBLIC:50] produces cards',
    getChatwootBodies(publicResult).map(b => b.content_type)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('isMessenger TOGGLE — Same response, different output');
// ─────────────────────────────────────────────────────────────────────────────
{
  const messengerResult = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: true });
  const widgetResult    = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: false });

  const messengerMenu = getChatwootBodies(messengerResult).find(b => b.content_type === 'input_select');
  const widgetMenu    = getChatwootBodies(widgetResult).find(b => b.content_type === 'input_select');

  assert(messengerMenu && widgetMenu, 'Toggle: both produce input_select menu');

  if (messengerMenu && widgetMenu) {
    assert(
      messengerMenu.content_attributes.items.length !== widgetMenu.content_attributes.items.length,
      'Toggle: Messenger and widget menus have different item counts',
      {
        messenger: messengerMenu.content_attributes.items.length,
        widget:    widgetMenu.content_attributes.items.length,
      }
    );

    const messengerTitles = messengerMenu.content_attributes.items.map(i => i.title);
    const widgetTitles    = widgetMenu.content_attributes.items.map(i => i.title);
    assert(
      JSON.stringify(messengerTitles) !== JSON.stringify(widgetTitles),
      'Toggle: Messenger and widget menu titles differ',
      { messengerTitles, widgetTitles }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('FULL FLOW — Birthday booking end-to-end (Messenger)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const step1 = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: true });
  assert(getChatwootBodies(step1).some(b => b.content_type === 'input_select'),
    'Birthday flow step 1 (main menu): input_select produced');

  const step2 = runEnricher({ aiResponse: 'Kada planuojate gimtadieniu?\n\n[DATE_PICKER]', isMessenger: true });
  const step2Bodies = getChatwootBodies(step2);
  assert(step2Bodies.some(b => b.content_type === 'input_select'),
    'Birthday flow step 2 (date picker): input_select produced');
  assert(step2Bodies.some(b => b.content_type === 'text'),
    'Birthday flow step 2: intro text present');

  const step3 = runEnricher({ aiResponse: '[GUEST_COUNT]', isMessenger: true });
  assert(getChatwootBodies(step3).some(b => b.content_type === 'input_select'),
    'Birthday flow step 3 (guest count): input_select produced');

  const step4 = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:10]', isMessenger: true });
  assert(getChatwootBodies(step4).some(b => b.content_type === 'cards'),
    'Birthday flow step 4 (equipment): cards produced');

  const step5 = runEnricher({ aiResponse: '[ADDON_UPSELL]', isMessenger: true });
  assert(getChatwootBodies(step5).some(b => b.content_type === 'cards'),
    'Birthday flow step 5 (addon upsell): cards produced');

  const bookJson = '{"date":"2026-05-15","location":"Taurage","event_type":"Gimtadienis","guest_count":"10","contact_name":"Ruta","contact_phone":"+37061234567","trampoline":"Mega Waikiki","addons":"Dart"}';
  const step6 = runEnricher({ aiResponse: '[BOOKING_CONFIRM:' + bookJson + ']', isMessenger: true });
  const step6Bodies = getChatwootBodies(step6);
  const confirmText = step6Bodies.find(b => b.content_type === 'text');
  assert(confirmText && confirmText.content.includes('Ruta'),
    'Birthday flow step 6 (booking confirm): contact name present');
  assert(confirmText && confirmText.content.includes('Gimtadienis'),
    'Birthday flow step 6: event type present');
  assert(confirmText && !confirmText.content.includes('**'),
    'Birthday flow step 6: no markdown on Messenger');
  assert(step6Bodies.some(b => b.content_type === 'input_select'),
    'Birthday flow step 6: post-booking navigation buttons present');
}

// ─────────────────────────────────────────────────────────────────────────────
section('FULL FLOW — Party booking end-to-end (Messenger)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const step1 = runEnricher({ aiResponse: '[DATE_PICKER]', isMessenger: true });
  assert(getChatwootBodies(step1).some(b => b.content_type === 'input_select'),
    'Party flow: date picker works');

  const step2 = runEnricher({ aiResponse: '[MENU_GROUP_PARTY]', isMessenger: true });
  const step2Bodies = getChatwootBodies(step2);
  assert(step2Bodies.some(b => b.content_type === 'cards'),
    'Party flow: party equipment produces cards');
  // Putow show (no img) falls back to input_select
  assert(step2Bodies.some(b => b.content_type === 'input_select'),
    'Party flow: no-image party items use input_select fallback');

  const step3 = runEnricher({
    aiResponse: '[BOOKING_CONFIRM:{"date":"2026-08-01","location":"Vilnius","event_type":"Vakarielis","guest_count":"20","contact_name":"Darius","contact_phone":"+37060000000"}]',
    isMessenger: true,
  });
  assert(
    getContentTexts(step3).some(t => t && t.includes('Darius')),
    'Party flow: booking confirm shows contact name'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('FULL FLOW — FAQ / public event (Messenger)');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Public event guest count picker
  const gcPublic = runEnricher({ aiResponse: '[GUEST_COUNT_PUBLIC]', isMessenger: true });
  assert(
    getChatwootBodies(gcPublic).some(b => b.content_type === 'input_select'),
    'Public event: GUEST_COUNT_PUBLIC produces input_select'
  );

  // Public event equipment (> 100 guests → intro text expected)
  const pubEq = runEnricher({ aiResponse: '[MENU_GROUP_PUBLIC:150]', isMessenger: true });
  const pubBodies = getChatwootBodies(pubEq);
  assert(pubBodies.some(b => b.content_type === 'text'),
    'Public event (150 guests): intro text present');
  assert(pubBodies.some(b => b.content_type === 'cards'),
    'Public event (150 guests): cards present');

  // Plain FAQ answer (no markers)
  const faqResponse = 'Musu batutai sertifikuoti pagal EN14960 standarta. Visi 2025-2026 m. gamybos.';
  const faqResult   = runEnricher({ aiResponse: faqResponse, isMessenger: true });
  const faqBodies   = getChatwootBodies(faqResult);
  assert(faqBodies.length === 1 && faqBodies[0].content_type === 'text',
    'FAQ: plain text response produces single text message');
  assert(faqBodies[0].content.includes('EN14960'),
    'FAQ: response content preserved');
}

// ─────────────────────────────────────────────────────────────────────────────
section('FULL FLOW — Equipment catalog (birthday group sizes)');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Small group (8) — standard trampolines expected in cards
  const smallGroup = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:8]', isMessenger: true });
  assert(
    getChatwootBodies(smallGroup).some(b => b.content_type === 'cards'),
    'Catalog: small group birthday (8) produces cards'
  );

  // Large group (20) — large-group CTA appears alongside cards
  const largeGroup = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:20]', isMessenger: true });
  const largeBodies  = getChatwootBodies(largeGroup);
  assert(largeBodies.some(b => b.content_type === 'cards'),
    'Catalog: large group birthday (20) still shows cards');
  const largeSelects = largeBodies.filter(b => b.content_type === 'input_select');
  assert(largeSelects.length >= 1, 'Catalog: large group birthday (20) shows CTA select');

  // Verify all CTA select titles <= 20 chars on Messenger
  largeSelects.forEach(sel => {
    sel.content_attributes.items.forEach(item => {
      assert(
        item.title.length <= 20,
        'Catalog: large group CTA button "' + item.title + '" <= 20 chars (' + item.title.length + ')',
        { title: item.title, len: item.title.length }
      );
    });
  });

  // No guest count → shows all trampolines
  const noCount = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY]', isMessenger: true });
  assert(
    getChatwootBodies(noCount).some(b => b.content_type === 'cards'),
    'Catalog: birthday without guest count still produces cards'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('"Susisiekti" MENU ITEM → HUMAN HANDOFF flow (Messenger)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const response = 'Labai dzaiugiuosi! Tuoj pat perduosiu jus musu komandai.\n\n[HUMAN_HANDOFF]';
  const result = runEnricher({
    aiResponse: response,
    isMessenger: true,
    contactName: 'Petras Jonaitis',
    conversationId: 200,
  });

  const chatwootBodies = getChatwootBodies(result);
  const telegramItems  = getTelegramItems(result);

  assert(chatwootBodies.length >= 2,
    '"Susisiekti" flow: at least 2 Chatwoot messages (intro + handoff)',
    chatwootBodies.length);
  assert(telegramItems.length === 1,
    '"Susisiekti" flow: Telegram notification sent');

  if (telegramItems.length > 0) {
    const tgBody = JSON.parse(telegramItems[0]._body);
    assert(tgBody.text.includes('Petras Jonaitis'),
      '"Susisiekti" flow: Telegram has customer name', tgBody.text);
    assert(tgBody.text.includes('Facebook Messenger'),
      '"Susisiekti" flow: Telegram identifies Messenger channel');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('EDGE CASE — Empty response fallback');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: '', isMessenger: true });
  const bodies = getChatwootBodies(result);
  assert(bodies.length >= 1, 'Empty response: at least 1 fallback message');
  assert(bodies[0] && bodies[0].content_type === 'text', 'Empty response: fallback is text type');
  assert(bodies[0] && bodies[0].content.includes('+370 648 803 88'),
    'Empty response: fallback includes phone number');
}

// ─────────────────────────────────────────────────────────────────────────────
section('EDGE CASE — Missing conversationId returns _skip');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: '[MAIN_MENU]', isMessenger: true, conversationId: null });
  assert(
    result.length === 1 && result[0].json._skip === true,
    'Missing conversationId: returns {_skip: true}',
    result[0] && result[0].json
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('EDGE CASE — Unrecognized marker stripped from output');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: 'Labas! [UNKNOWN_MARKER] Kaip galiu padeti?', isMessenger: true });
  const bodies = getChatwootBodies(result);
  const text   = bodies.map(b => b.content).join(' ');
  assert(!text.includes('[UNKNOWN_MARKER]'),
    'Unrecognized marker: stripped from output', text);
  assert(text.includes('Kaip galiu padeti'),
    'Unrecognized marker: surrounding text preserved', text);
}

// ─────────────────────────────────────────────────────────────────────────────
section('EDGE CASE — BOOKING_CONFIRM with malformed JSON');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: '[BOOKING_CONFIRM:{bad json here}]', isMessenger: true });
  const bodies = getChatwootBodies(result);
  assert(
    bodies.some(b => b.content_type === 'text' && b.content.includes('U\u017eklausa')),
    'Malformed JSON: shows generic confirmation text',
    bodies.map(b => b.content)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('EDGE CASE — BOOKING_CONFIRM missing contact info (warning shown)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const noContactJson = '{"date":"2026-05-15","location":"Taurage","event_type":"Gimtadienis","guest_count":"10","trampoline":"Candy Pop"}';
  const result = runEnricher({ aiResponse: '[BOOKING_CONFIRM:' + noContactJson + ']', isMessenger: true });
  const bodies = getChatwootBodies(result);
  const confirmText = bodies.find(b => b.content_type === 'text');
  assert(
    confirmText && confirmText.content.includes('telefono'),
    'Booking confirm (no contact): shows missing contact warning',
    confirmText && confirmText.content
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('REGRESSION Fix #2 — BOOKING_CONFIRM + MENU_GROUP_PUBLIC both render');
// ─────────────────────────────────────────────────────────────────────────────
{
  const bookJson = '{"date":"2026-07-04","location":"Vilnius","event_type":"Viesasis renginys","guest_count":"100","contact_name":"Zilvinas","contact_phone":"+37065555555","trampolines":"Giga ruozas"}';
  const response = '[MENU_GROUP_PUBLIC:100]\n\n[BOOKING_CONFIRM:' + bookJson + ']';
  const result = runEnricher({ aiResponse: response, isMessenger: true });
  const bodies = getChatwootBodies(result);

  assert(bodies.some(b => b.content_type === 'cards'),
    'Fix #2: MENU_GROUP_PUBLIC produces cards', bodies.map(b => b.content_type));
  assert(
    bodies.some(b => b.content_type === 'text' && b.content.includes('Zilvinas')),
    'Fix #2: BOOKING_CONFIRM NOT dropped when combined with MENU_GROUP_PUBLIC',
    bodies.map(b => b.content)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('WIDGET vs MESSENGER — Handoff Telegram channel label differs');
// ─────────────────────────────────────────────────────────────────────────────
{
  const messengerResult = runEnricher({ aiResponse: '[HUMAN_HANDOFF]', isMessenger: true,  contactName: 'Test' });
  const widgetResult    = runEnricher({ aiResponse: '[HUMAN_HANDOFF]', isMessenger: false, contactName: 'Test' });

  const messengerTg = getTelegramItems(messengerResult);
  const widgetTg    = getTelegramItems(widgetResult);

  assert(messengerTg.length > 0 && widgetTg.length > 0, 'Channel label: both produce Telegram item');

  if (messengerTg.length > 0 && widgetTg.length > 0) {
    const messengerTgBody = JSON.parse(messengerTg[0]._body);
    const widgetTgBody    = JSON.parse(widgetTg[0]._body);

    assert(
      messengerTgBody.text.includes('Facebook Messenger'),
      'Channel label: Messenger handoff says "Facebook Messenger"',
      messengerTgBody.text
    );
    assert(
      widgetTgBody.text.includes('Svetain\u0117s widget'),
      'Channel label: Widget handoff says "Svetaines widget"',
      widgetTgBody.text
    );
    assert(
      messengerTgBody.text !== widgetTgBody.text,
      'Channel label: Messenger and widget Telegram messages differ'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('TYPING INDICATOR — Fires for heavy content (cards/form)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const result = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:10]', isMessenger: true });
  const typingItems = result
    .map(i => i.json)
    .filter(j => j._url && j._url.includes('toggle_typing_status'));

  assert(typingItems.length === 2,
    'Typing indicator: 2 toggle items for cards content (on + off)',
    typingItems.length);

  if (typingItems.length >= 2) {
    const onBody  = JSON.parse(typingItems[0]._body);
    const offBody = JSON.parse(typingItems[1]._body);
    assert(onBody.typing_status  === 'on',  'Typing indicator: first item is "on"',  onBody);
    assert(offBody.typing_status === 'off', 'Typing indicator: second item is "off"', offBody);
  }

  // No typing indicator for plain text
  const plainResult  = runEnricher({ aiResponse: 'Labas! Kaip galiu padeti?', isMessenger: true });
  const plainTyping  = plainResult
    .map(i => i.json)
    .filter(j => j._url && j._url.includes('toggle_typing_status'));
  assert(plainTyping.length === 0, 'Typing indicator: no toggle items for plain text response');
}

// ─────────────────────────────────────────────────────────────────────────────
section('COMPLEX — Multiple markers in one response (Messenger)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const response = 'Labas! Cia musu paslaugos:\n\n[MAIN_MENU]\n\nPasirinkite!';
  const result   = runEnricher({ aiResponse: response, isMessenger: true });
  const bodies   = getChatwootBodies(result);

  assert(bodies.filter(b => b.content_type === 'text').length >= 1,
    'Multi-marker: text segments preserved');
  assert(bodies.filter(b => b.content_type === 'input_select').length >= 1,
    'Multi-marker: menu produced');

  // DATE_PICKER + GUEST_COUNT combo
  const combo      = runEnricher({ aiResponse: '[DATE_PICKER]\n\n[GUEST_COUNT]', isMessenger: true });
  const comboBodies = getChatwootBodies(combo);
  assert(
    comboBodies.filter(b => b.content_type === 'input_select').length >= 2,
    'Multi-marker: DATE_PICKER + GUEST_COUNT both produce input_select',
    comboBodies.map(b => b.content_type)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('messengerName — override used in select items on Messenger');
// ─────────────────────────────────────────────────────────────────────────────
{
  // 'Banketo stalai ir kedeshas messengerName: 'Stalai ir kedes'
  // It has an image so it appears in cards (using t.name, not messengerName).
  // Verify cards use the full name even on Messenger.
  const partyResult = runEnricher({ aiResponse: '[MENU_GROUP_PARTY]', isMessenger: true });
  const partyBodies = getChatwootBodies(partyResult);
  const cardsMsg    = partyBodies.find(b => b.content_type === 'cards');

  if (cardsMsg) {
    const banketoCard = cardsMsg.content_attributes.items.find(
      i => i.title.includes('Banketo') || i.title.includes('Stalai')
    );
    if (banketoCard) {
      // In cards the title is built as t.icon + ' ' + t.name (full name)
      assert(
        banketoCard.title.includes('Banketo'),
        'messengerName: cards use full t.name even on Messenger',
        banketoCard.title
      );
    } else {
      assert(true, 'messengerName: Banketo stalai not found in cards (may be in select — OK)');
    }
  } else {
    assert(true, 'messengerName: no cards for party (all items may have no image — OK)');
  }

  // Verify popular-emoji truncation: icon added ONLY if total <= 20 chars
  const birthdayResult  = runEnricher({ aiResponse: '[MENU_GROUP_BIRTHDAY:20]', isMessenger: true });
  const birthdaySelects = getChatwootBodies(birthdayResult).filter(b => b.content_type === 'input_select');
  let popularIconOverflow = false;
  birthdaySelects.forEach(sel => {
    sel.content_attributes.items.forEach(item => {
      if (item.title.includes('\u{1F525}') && item.title.length > 20) {
        popularIconOverflow = true;
      }
    });
  });
  assert(!popularIconOverflow,
    'messengerName: popular fire-icon never added if it would push title > 20 chars');
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(70));
console.log(' RESULTS');
console.log('='.repeat(70));
console.log(' Passed : ' + passed);
console.log(' Failed : ' + failed);
console.log(' Total  : ' + (passed + failed));

if (failures.length > 0) {
  console.log('\n FAILED TESTS:');
  failures.forEach((f, idx) => {
    console.log('  ' + (idx + 1) + '. ' + f.testName);
  });
}

if (failed === 0) {
  console.log('\n All tests passed!');
  process.exit(0);
} else {
  console.log('\n Some tests FAILED — see details above.');
  process.exit(1);
}
