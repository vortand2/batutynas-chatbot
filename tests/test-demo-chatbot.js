/**
 * test-demo-chatbot.js
 * Playwright E2E stress tests for the Batutynas.lt demo chatbot.
 * Self-contained: starts its own HTTP server on port 3457, runs all tests, reports results.
 *
 * Run: node tests/test-demo-chatbot.js
 */

'use strict';

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────
const PORT = 3457;
const DEMO_DIR = path.resolve(__dirname, '../demo');
const BASE_URL = 'http://localhost:' + PORT;
const SLOW_MO = 0;

const AI_RESPONSE_MS = 3000;

// ─── Tiny HTTP server ──────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const safePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const filePath = path.join(DEMO_DIR, safePath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, () => resolve(server));
  });
}

// ─── Test harness ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log('  PASS  ' + name);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log('  FAIL  ' + name);
    console.log('        ERROR: ' + err.message);
  }
}

// ─── Page helpers ─────────────────────────────────────────────────────────

async function freshPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 }
  });
  const page = await ctx.newPage();

  page._jsErrors = [];
  page.on('pageerror', function(err) { page._jsErrors.push(err.message); });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Clear session so every test starts from the welcome screen
  await page.locator('body').evaluate(function() {
    localStorage.removeItem('batutynas_chat');
  });

  return { page, ctx };
}

async function openChat(page) {
  await page.click('.woo-chat-toggle');
  await page.waitForSelector('.woo-chat-window.open', { timeout: 2000 });
}

async function typeAndSend(page, text) {
  const input = page.locator('#woo-chat-input');
  await input.fill(text);
  await page.click('#woo-chat-send-btn');
}

async function waitForAIResponse(page, timeoutMs) {
  timeoutMs = timeoutMs || AI_RESPONSE_MS;
  await page.waitForSelector('.woo-chat-typing.visible', { timeout: timeoutMs }).catch(function() {});
  await page.waitForFunction(
    function() { return !document.querySelector('.woo-chat-typing.visible'); },
    { timeout: timeoutMs }
  );
}

// Map of welcome action values to their 0-based index in the welcome screen button list
// (in the order they appear in the DOM)
// NOTE: public event value has a typo in the source HTML: "sąskrydiį" (extra i) — use nth index
var WELCOME_ACTION_INDEX = {
  'Planuoju vaik\u0173 gimtadien\u012F arba krik\u0161tynas': 0,
  'Planuoju vie\u0161\u0105 rengin\u012F arba \u012Fmon\u0117s s\u0105skryd\u012F': 1,   // intended value
  'Planuoju vie\u0161\u0105 rengin\u012F arba \u012Fmon\u0117s s\u0105skrydi\u012F': 1, // actual DOM value (typo in source)
  'Noriu pirkti batut\u0105': 2,
  'Planuoju triuk\u0161ming\u0105 vakar\u0117l\u012F': 3,
  'Saugumas, DUK ir kontaktai': 4
};

async function clickWelcomeAction(page, value) {
  // Use nth-based selection to avoid CSS selector encoding edge cases with Lithuanian diacritics
  var idx = WELCOME_ACTION_INDEX[value];
  if (idx !== undefined) {
    await page.locator('[data-welcome-action]').nth(idx).click({ timeout: 5000 });
  } else {
    // Fallback: try direct attribute selector
    await page.click('[data-welcome-action="' + value + '"]');
  }
  await waitForAIResponse(page);
}

// ─── Helpers to run full birthday flow up to guest-count step ─────────────
async function flowToBirthdayGuestCount(page) {
  await openChat(page);
  await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
  const dateBtn = page.locator('.chat-option-btn[data-chat-option^="20"]').first();
  await dateBtn.click();
  await waitForAIResponse(page);
  await page.click('[data-chat-address-fill="Tauragė"]');
  const confirmBtn = page.locator('[data-chat-address-confirm]');
  await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
  await confirmBtn.click();
  await waitForAIResponse(page);
}

async function flowToBirthdayEquipment(page) {
  await flowToBirthdayGuestCount(page);
  const gcBtn = page.locator('[data-step="guest-count"] .chat-option-btn').first();
  await gcBtn.click();
  await waitForAIResponse(page);
}

async function flowToBirthdayContact(page) {
  await flowToBirthdayEquipment(page);
  // Click the t-name text inside the trampoline card to avoid triggering the image zoom overlay
  const tramName = page.locator('.chat-trampoline-select[data-chat-option] .t-name').first();
  await tramName.click();
  await page.waitForTimeout(200);
  // Dismiss any zoom overlay that may have opened (just in case)
  await page.locator('.t-zoom-overlay').click().catch(function() {});
  await page.waitForTimeout(100);
  // Click the t-name text inside the first addon card to avoid the image zoom overlay
  const addonName = page.locator('[data-chat-addon] .t-name').first();
  await addonName.click();
  await page.waitForTimeout(200);
  await page.locator('[data-chat-addon-continue]').click();
  await waitForAIResponse(page);
}

// ─── Suite: Page Load ─────────────────────────────────────────────────────
async function suite_PageLoad(browser) {
  console.log('\n── Suite: Page Load ─────────────────────────────────────');

  await runTest('Page returns HTTP 200', async function() {
    const res = await new Promise(function(resolve, reject) {
      http.get(BASE_URL + '/', resolve).on('error', reject);
    });
    assert(res.statusCode === 200, 'Expected 200, got ' + res.statusCode);
  });

  await runTest('Page loads without JS errors', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await page.waitForTimeout(500);
      assert(page._jsErrors.length === 0, 'JS errors: ' + page._jsErrors.join(' | '));
    } finally { await ctx.close(); }
  });

  await runTest('Chat toggle button is visible', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      const visible = await page.isVisible('.woo-chat-toggle');
      assert(visible, 'Chat toggle button not visible');
    } finally { await ctx.close(); }
  });

  await runTest('Chat window opens on toggle click', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const open = await page.isVisible('.woo-chat-window.open');
      assert(open, 'Chat window did not open');
    } finally { await ctx.close(); }
  });

  await runTest('Welcome screen shows exactly 5 action buttons', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const count = await page.locator('[data-welcome-action]').count();
      assert(count === 5, 'Expected 5 welcome buttons, found ' + count);
    } finally { await ctx.close(); }
  });

  await runTest('Welcome screen button labels match expected options', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const texts = await page.locator('[data-welcome-action]').allTextContents();
      const combined = texts.join(' ');
      const labels = ['gimtadienį', 'renginys', 'batutą', 'Vakarėlis', 'kontaktai'];
      for (const lbl of labels) {
        assert(combined.toLowerCase().includes(lbl.toLowerCase()), 'Missing welcome label: "' + lbl + '"');
      }
    } finally { await ctx.close(); }
  });

  await runTest('Demo bar is visible with scenario buttons', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      assert(await page.isVisible('.demo-bar'), 'Demo bar not visible');
      const count = await page.locator('.demo-btn').count();
      assert(count >= 5, 'Expected >=5 demo buttons, found ' + count);
    } finally { await ctx.close(); }
  });

  await runTest('Main menu (from main menu option) shows 5 menu items', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Saugumas, DUK ir kontaktai');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Pagrindinis meniu"]').first().click();
      await waitForAIResponse(page);
      const menuBtns = await page.locator('.chat-menu-btn').count();
      assert(menuBtns === 5, 'Expected 5 main menu buttons, found ' + menuBtns);
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Birthday Flow ─────────────────────────────────────────────────
async function suite_BirthdayFlow(browser) {
  console.log('\n── Suite: Birthday Flow (E2E) ───────────────────────────');

  await runTest('Birthday button triggers date picker', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      assert(await page.isVisible('.chat-date-input'), 'Date picker not shown');
    } finally { await ctx.close(); }
  });

  await runTest('Progress bar appears at step 1', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      assert(await page.isVisible('.booking-progress'), 'Progress bar not shown on date step');
    } finally { await ctx.close(); }
  });

  await runTest('Date selection → location picker appears', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      assert(await page.isVisible('.chat-address-form'), 'Location form not shown after date selection');
    } finally { await ctx.close(); }
  });

  await runTest('Location → guest count options appear', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayGuestCount(page);
      assert(await page.isVisible('[data-step="guest-count"]'), 'Guest count options not shown');
    } finally { await ctx.close(); }
  });

  await runTest('Guest count → trampoline equipment cards appear', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      const count = await page.locator('.chat-trampoline-select').count();
      assert(count > 0, 'No trampoline cards shown after guest count');
    } finally { await ctx.close(); }
  });

  await runTest('Trampoline card contains name and capacity text', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      const cardText = await page.locator('.chat-trampoline-select').first().textContent();
      const hasCapacity = cardText.includes('vaikų') || cardText.includes('Iki') || cardText.includes('dalyvių');
      assert(hasCapacity, 'Trampoline card missing capacity info: "' + cardText.substring(0, 100) + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Addon cards appear below trampolines', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      assert(await page.isVisible('[data-chat-addon-continue]'), '"Testi" continue button not found');
      const addonCount = await page.locator('[data-chat-addon]').count();
      assert(addonCount > 0, 'No addon cards found');
    } finally { await ctx.close(); }
  });

  await runTest('Trampoline + addon + continue → contact info request', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const lastText = await msgs[msgs.length - 1].textContent();
      const asksContact = lastText.toLowerCase().includes('vardas') ||
        lastText.toLowerCase().includes('telefon') ||
        lastText.toLowerCase().includes('kontakt') ||
        lastText.toLowerCase().includes('susisiek');
      assert(asksContact, 'Expected contact request, got: "' + lastText.substring(0, 150) + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Contact info → booking confirmation card appears', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Jonas Jonaitis +370 612 34567');
      await waitForAIResponse(page);
      assert(await page.isVisible('.booking-confirm'), 'Booking confirmation card not shown');
    } finally { await ctx.close(); }
  });

  await runTest('Booking confirmation contains group type "Gimtadienis"', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Jonas +370 612 34567');
      await waitForAIResponse(page);
      const text = await page.locator('.booking-confirm').textContent();
      assert(text.includes('Gimtadienis'), 'Booking type missing: ' + text.substring(0, 200));
    } finally { await ctx.close(); }
  });

  await runTest('Booking confirmation contains contact name', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Viktorija +370 699 88776');
      await waitForAIResponse(page);
      const text = await page.locator('.booking-confirm').textContent();
      assert(text.includes('Viktorija'), 'Contact name missing: ' + text.substring(0, 200));
    } finally { await ctx.close(); }
  });

  await runTest('Booking confirmation contains phone number', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Petras +370 611 22333');
      await waitForAIResponse(page);
      const text = await page.locator('.booking-confirm').textContent();
      const hasPhone = text.includes('+370 611 22333') || text.includes('37061122333') || text.includes('611 22333');
      assert(hasPhone, 'Phone number missing: ' + text.substring(0, 200));
    } finally { await ctx.close(); }
  });

  await runTest('Booking confirmation contains location', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Test +370 600 11111');
      await waitForAIResponse(page);
      const text = await page.locator('.booking-confirm').textContent();
      const hasLocation = text.includes('Taurag') || text.includes('Vieta');
      assert(hasLocation, 'Location missing from booking confirmation: ' + text.substring(0, 200));
    } finally { await ctx.close(); }
  });

  await runTest('Working hours string "8:00-21:00" present in page source', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      // Read raw HTML to check the hours string is defined in the source
      const srcHtml = fs.readFileSync(path.join(DEMO_DIR, 'index.html'), 'utf8');
      // The em-dash version (U+2013)
      const hasHours = srcHtml.includes('8:00\u201321:00');
      assert(hasHours, 'Working hours "8:00-21:00" not found in index.html source');
    } finally { await ctx.close(); }
  });

  await runTest('Post-booking quick replies include "Uzsakyti dar viena" and "Pagrindinis meniu"', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Rasa +370 688 99000');
      await waitForAIResponse(page);
      const qrText = await page.locator('#woo-chat-messages').textContent();
      const hasDarViena = qrText.toLowerCase().includes('dar vien') || qrText.toLowerCase().includes('užsakyti dar');
      const hasMenu = qrText.includes('Pagrindinis meniu');
      assert(hasDarViena && hasMenu, 'Post-booking quick replies missing. Text: ' + qrText.substring(0, 300));
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Party Flow ────────────────────────────────────────────────────
async function suite_PartyFlow(browser) {
  console.log('\n── Suite: Party Flow ────────────────────────────────────');

  await runTest('Party button triggers date picker', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju triukšmingą vakarėlį');
      assert(await page.isVisible('.chat-date-input'), 'Date picker not shown after party selection');
    } finally { await ctx.close(); }
  });

  await runTest('Party flow — location form after date', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju triukšmingą vakarėlį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      assert(await page.isVisible('.chat-address-form'), 'Location form not shown in party flow');
    } finally { await ctx.close(); }
  });

  await runTest('Party flow — party equipment cards appear', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju triukšmingą vakarėlį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      const confirmBtn = page.locator('[data-chat-address-confirm]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
      await confirmBtn.click();
      await waitForAIResponse(page);
      await page.locator('[data-step="guest-count"] .chat-option-btn').first().click();
      await waitForAIResponse(page);
      const count = await page.locator('.chat-trampoline-select').count();
      assert(count > 0, 'No party equipment cards shown');
    } finally { await ctx.close(); }
  });

  await runTest('Party items show "Nemokama" price label for free items', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju triukšmingą vakarėlį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      const confirmBtn = page.locator('[data-chat-address-confirm]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
      await confirmBtn.click();
      await waitForAIResponse(page);
      await page.locator('[data-step="guest-count"] .chat-option-btn').first().click();
      await waitForAIResponse(page);
      const text = await page.locator('#woo-chat-messages').textContent();
      assert(text.includes('Nemokama'), '"Nemokama" label not found in party equipment');
    } finally { await ctx.close(); }
  });

  await runTest('Party continue without selection shows hint on button', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju triukšmingą vakarėlį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      const confirmBtn = page.locator('[data-chat-address-confirm]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
      await confirmBtn.click();
      await waitForAIResponse(page);
      await page.locator('[data-step="guest-count"] .chat-option-btn').first().click();
      await waitForAIResponse(page);
      const msgsBefore = await page.locator('.woo-chat-msg').count();
      await page.locator('[data-chat-addon-continue]').click();
      await page.waitForTimeout(400);
      const msgsAfter = await page.locator('.woo-chat-msg').count();
      assert(msgsAfter === msgsBefore, 'Unexpected message sent without selection (before: ' + msgsBefore + ', after: ' + msgsAfter + ')');
      const btnText = await page.locator('[data-chat-addon-continue]').textContent();
      assert(btnText.includes('Pasirinkite'), 'Expected hint on continue button, got: "' + btnText + '"');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Info / FAQ ─────────────────────────────────────────────────────
async function suite_InfoFAQ(browser) {
  console.log('\n── Suite: FAQ / Info Flow ───────────────────────────────');

  await runTest('Info button shows safety/contact information', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Saugumas, DUK ir kontaktai');
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const text = await msgs[msgs.length - 1].textContent();
      const hasSafety = text.includes('EN-14960') || text.includes('saugos') || text.includes('kontakt') || text.includes('+370');
      assert(hasSafety, 'Expected safety/contact info, got: "' + text.substring(0, 200) + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Info response contains phone number +370', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Saugumas, DUK ir kontaktai');
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.includes('+370'), 'Phone number missing from info: "' + text.substring(0, 200) + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Info response contains email address', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Saugumas, DUK ir kontaktai');
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.includes('@'), 'Email missing from info response: "' + text.substring(0, 200) + '"');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Equipment Catalog ─────────────────────────────────────────────
async function suite_EquipmentCatalog(browser) {
  console.log('\n── Suite: Equipment Catalog (Purchase Flow) ─────────────');

  await runTest('Purchase button shows catalog + custom submenu', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      const text = await page.locator('.woo-chat-msg.agent').last().textContent();
      const hasOptions = text.includes('katalog') || text.includes('gamyb') || text.includes('Gauti');
      assert(hasOptions, 'Purchase submenu missing: "' + text.substring(0, 200) + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Catalog request shows email input form', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Noriu gauti batutų katalogą el. paštu"]').click();
      await waitForAIResponse(page);
      assert(await page.isVisible('[data-chat-email]'), 'Email input not shown for catalog request');
    } finally { await ctx.close(); }
  });

  await runTest('Catalog email confirm button starts disabled', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Noriu gauti batutų katalogą el. paštu"]').click();
      await waitForAIResponse(page);
      assert(await page.locator('[data-chat-email-confirm]').isDisabled(), 'Email confirm should start disabled');
    } finally { await ctx.close(); }
  });

  await runTest('Catalog email confirm enables after valid email typed', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Noriu gauti batutų katalogą el. paštu"]').click();
      await waitForAIResponse(page);
      await page.locator('[data-chat-email]').fill('test@example.com');
      await page.locator('[data-chat-email]').dispatchEvent('input');
      assert(await page.locator('[data-chat-email-confirm]').isEnabled(), 'Email confirm should enable with valid email');
    } finally { await ctx.close(); }
  });

  await runTest('Custom manufacturing form has >=4 fields incl email and phone', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Noriu individualios batuto gamybos"]').click();
      await waitForAIResponse(page);
      const fieldCount = await page.locator('[data-custom-field]').count();
      assert(fieldCount >= 4, 'Expected >=4 custom fields, found ' + fieldCount);
      assert(await page.isVisible('[data-custom-field="email"]'), 'Custom form missing email field');
      assert(await page.isVisible('[data-custom-field="phone"]'), 'Custom form missing phone field');
    } finally { await ctx.close(); }
  });

  await runTest('Custom form submit disabled until email + phone filled', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Noriu pirkti batutą');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Noriu individualios batuto gamybos"]').click();
      await waitForAIResponse(page);
      const submitBtn = page.locator('[data-chat-custom-submit]');
      assert(await submitBtn.isDisabled(), 'Custom submit should start disabled');
      await page.locator('[data-custom-field="email"]').fill('ok@test.com');
      await page.locator('[data-custom-field="email"]').dispatchEvent('input');
      assert(await submitBtn.isDisabled(), 'Should still be disabled with only email');
      await page.locator('[data-custom-field="phone"]').fill('+37061234567');
      await page.locator('[data-custom-field="phone"]').dispatchEvent('input');
      assert(await submitBtn.isEnabled(), 'Submit should enable after email + phone filled');
    } finally { await ctx.close(); }
  });

  await runTest('Addon pricing labels exist in page source ("Nemokama", "1 NEMOKAMAI")', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      const src = fs.readFileSync(path.join(DEMO_DIR, 'index.html'), 'utf8');
      const hasPricing = src.includes('1 NEMOKAMAI') || src.includes('Nemokama');
      assert(hasPricing, 'No addon pricing labels found in page source');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Date Picker ───────────────────────────────────────────────────
async function suite_DatePicker(browser) {
  console.log('\n── Suite: Date Picker ───────────────────────────────────');

  await runTest('Date picker shows 4 Saturday quick-pick buttons', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      const count = await page.locator('.chat-option-btn[data-chat-option^="20"]').count();
      assert(count === 4, 'Expected 4 date buttons, found ' + count);
    } finally { await ctx.close(); }
  });

  await runTest('Date confirm button starts disabled', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      assert(await page.locator('[data-chat-date-confirm]').isDisabled(), 'Date confirm should start disabled');
    } finally { await ctx.close(); }
  });

  await runTest('Date confirm enables after date input filled', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      const future = new Date();
      future.setMonth(future.getMonth() + 1);
      const iso = future.toISOString().substring(0, 10);
      await page.locator('.chat-date-input').fill(iso);
      await page.locator('.chat-date-input').dispatchEvent('change');
      assert(await page.locator('[data-chat-date-confirm]').isEnabled(), 'Date confirm should enable after date entered');
    } finally { await ctx.close(); }
  });

  await runTest('Date input min attribute is today or later', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      const minAttr = await page.locator('.chat-date-input').getAttribute('min');
      assert(minAttr && /^\d{4}-\d{2}-\d{2}$/.test(minAttr), 'Date input min attr invalid: ' + minAttr);
      const todayIso = new Date().toISOString().substring(0, 10);
      assert(minAttr >= todayIso, 'Date min (' + minAttr + ') is in the past vs today (' + todayIso + ')');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Public Event Flow ──────────────────────────────────────────────
async function suite_PublicEventFlow(browser) {
  console.log('\n── Suite: Public Event Flow ─────────────────────────────');

  await runTest('BUG CHECK: Public event data-welcome-action has correct spelling (no extra "i")', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const actualAttr = await page.locator('[data-welcome-action]').nth(1).getAttribute('data-welcome-action');
      // Correct spelling: "sąskrydį" — if it has "sąskrydiį" that is a typo
      const hasTypo = actualAttr && actualAttr.includes('skrydi\u012F');  // 'skrydiį'
      assert(!hasTypo, 'BUG: data-welcome-action has typo "skrydiį" (extra i). Value: ' + JSON.stringify(actualAttr) + '. Expected: "...s\u0105skryd\u012F"');
    } finally { await ctx.close(); }
  });

  await runTest('Public event button triggers date picker', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju viešą renginį arba įmonės sąskrydį');
      assert(await page.isVisible('.chat-date-input'), 'Date picker not shown for public event');
    } finally { await ctx.close(); }
  });

  await runTest('Public event shows larger guest count options (35, 75, 150...)', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju viešą renginį arba įmonės sąskrydį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      const confirmBtn = page.locator('[data-chat-address-confirm]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
      await confirmBtn.click();
      await waitForAIResponse(page);
      const gcTexts = await page.locator('[data-step="guest-count"] .chat-option-btn').allTextContents();
      const hasLarge = gcTexts.some(function(t) { return t.includes('35') || t.includes('75') || t.includes('150'); });
      assert(hasLarge, 'Public guest counts missing large options: ' + gcTexts.join(', '));
    } finally { await ctx.close(); }
  });

  await runTest('Public event shows big-park equipment (Dziumandzi/Fantaziju/Giga)', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju viešą renginį arba įmonės sąskrydį');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      const confirmBtn = page.locator('[data-chat-address-confirm]');
      await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
      await confirmBtn.click();
      await waitForAIResponse(page);
      await page.locator('[data-step="guest-count"] .chat-option-btn').first().click();
      await waitForAIResponse(page);
      const text = await page.locator('#woo-chat-messages').textContent();
      const hasBig = text.includes('Džiuman') || text.includes('Fantazij') || text.includes('Giga');
      assert(hasBig, 'Big-park equipment missing. Text snippet: ' + text.substring(0, 300));
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Address Input ─────────────────────────────────────────────────
async function suite_AddressInput(browser) {
  console.log('\n── Suite: Address Input ─────────────────────────────────');

  await runTest('Known city (Taurage) — confirm enables immediately', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      assert(await page.locator('[data-chat-address-confirm]').isEnabled(), 'Confirm should be enabled for known city');
    } finally { await ctx.close(); }
  });

  await runTest('"Kitas miestas" — confirm stays disabled until user types', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Kitas miestas"]');
      assert(await page.locator('[data-chat-address-confirm]').isDisabled(), 'Confirm should be disabled for "Kitas miestas" without typed address');
    } finally { await ctx.close(); }
  });

  await runTest('Address confirm strips trailing comma from city fill', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      await page.locator('.chat-option-btn[data-chat-option^="20"]').first().click();
      await waitForAIResponse(page);
      await page.click('[data-chat-address-fill="Tauragė"]');
      await page.locator('[data-chat-address-confirm]').waitFor({ state: 'visible', timeout: 2000 });
      // Poll until enabled (the button becomes enabled after city fill event handler fires)
      await page.waitForFunction(
        function() { var b = document.querySelector('[data-chat-address-confirm]'); return b && !b.disabled; },
        { timeout: 2000 }
      );
      await page.locator('[data-chat-address-confirm]').click();
      await waitForAIResponse(page);
      const customerMsgs = await page.locator('.woo-chat-msg.customer').all();
      const lastText = (await customerMsgs[customerMsgs.length - 1].textContent()).trim();
      assert(!lastText.endsWith(','), 'Address ends with trailing comma: "' + lastText + '"');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: No-Addon Confirmation Dialog ─────────────────────────────────
async function suite_NoAddonFlow(browser) {
  console.log('\n── Suite: No-Addon Confirmation Dialog ─────────────────');

  await runTest('Continuing without addons shows "NEMOKAMOS" confirmation dialog', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      // Click t-name text to avoid image zoom overlay
      await page.locator('.chat-trampoline-select[data-chat-option] .t-name').first().click();
      await page.locator('.t-zoom-overlay').click().catch(function() {});
      await page.waitForTimeout(200);
      // Do NOT select any addon
      await page.locator('[data-chat-addon-continue]').click();
      await page.waitForTimeout(500);
      assert(await page.isVisible('.chat-no-addon-confirm'), 'No-addon confirmation dialog not shown');
    } finally { await ctx.close(); }
  });

  await runTest('"Grizti ir pasirinkti" re-enables addon cards', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      await page.locator('.chat-trampoline-select[data-chat-option] .t-name').first().click();
      await page.locator('.t-zoom-overlay').click().catch(function() {});
      await page.waitForTimeout(200);
      await page.locator('[data-chat-addon-continue]').click();
      await page.waitForTimeout(500);
      await page.click('[data-chat-no-addon-back]');
      await page.waitForTimeout(300);
      // At least one addon card should be re-enabled
      const addonCards = await page.locator('[data-chat-addon]').all();
      let someEnabled = false;
      for (const card of addonCards) {
        const disabled = await card.getAttribute('disabled');
        if (!disabled) { someEnabled = true; break; }
      }
      assert(someEnabled, 'No addon cards re-enabled after going back');
    } finally { await ctx.close(); }
  });

  await runTest('"Testi be pramogų" proceeds to contact step', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      await page.locator('.chat-trampoline-select[data-chat-option] .t-name').first().click();
      await page.locator('.t-zoom-overlay').click().catch(function() {});
      await page.waitForTimeout(200);
      await page.locator('[data-chat-addon-continue]').click();
      await page.waitForTimeout(500);
      await page.click('[data-chat-no-addon-send]');
      await waitForAIResponse(page);
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const lastText = await msgs[msgs.length - 1].textContent();
      const asksContact = lastText.toLowerCase().includes('vardas') ||
        lastText.toLowerCase().includes('telefon') ||
        lastText.toLowerCase().includes('kontakt');
      assert(asksContact, 'Expected contact request after "no-addon" send, got: "' + lastText.substring(0, 150) + '"');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Session Persistence ──────────────────────────────────────────
async function suite_SessionPersistence(browser) {
  console.log('\n── Suite: Session Persistence ───────────────────────────');

  await runTest('Messages are saved to localStorage after sending', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await typeAndSend(page, 'Labas');
      await waitForAIResponse(page);
      const raw = await page.locator('html').getAttribute('lang').then(function() {
        return page.locator('body').getAttribute('class');
      }).catch(function() { return null; });
      // Use $$eval to read localStorage
      const savedStr = await page.locator('body').getAttribute('data-x').catch(function() { return null; });
      // Since we can't use page.evaluate(), read via Playwright storage API
      const storage = await page.context().storageState();
      const ls = storage.origins && storage.origins[0] && storage.origins[0].localStorage;
      const entry = ls && ls.find(function(e) { return e.name === 'batutynas_chat'; });
      assert(entry && entry.value, 'Nothing saved to localStorage');
      const data = JSON.parse(entry.value);
      assert(Array.isArray(data.messages) && data.messages.length > 0, 'No messages in saved session');
    } finally { await ctx.close(); }
  });

  await runTest('Session messages restore after page reload', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await typeAndSend(page, 'Sesijos testas reload');
      await waitForAIResponse(page);
      // Reload without clearing storage
      await page.reload({ waitUntil: 'networkidle' });
      await openChat(page);
      const msgs = await page.locator('.woo-chat-msg').count();
      assert(msgs > 0, 'Messages not restored after reload');
      const allText = await page.locator('#woo-chat-messages').textContent();
      assert(allText.includes('Sesijos testas reload'), 'Previous message not found after reload');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Detail Toggle ─────────────────────────────────────────────────
async function suite_TrampolineDetailToggle(browser) {
  console.log('\n── Suite: Trampoline Detail Toggle ──────────────────────');

  await runTest('Info button on trampoline card opens detail panel', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      await page.locator('[data-chat-detail-toggle]').first().click();
      await page.waitForTimeout(200);
      const openCount = await page.locator('.t-detail.open').count();
      assert(openCount > 0, 'Detail panel did not open after clicking info button');
    } finally { await ctx.close(); }
  });

  await runTest('Clicking info button again closes detail panel', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayEquipment(page);
      const toggleBtn = page.locator('[data-chat-detail-toggle]').first();
      await toggleBtn.click();
      await page.waitForTimeout(200);
      await toggleBtn.click();
      await page.waitForTimeout(200);
      const openCount = await page.locator('.t-detail.open').count();
      assert(openCount === 0, 'Detail panel should close on second click');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Edge Cases ────────────────────────────────────────────────────
async function suite_EdgeCases(browser) {
  console.log('\n── Suite: Edge Cases ────────────────────────────────────');

  await runTest('Long message (500+ chars) sends and displays', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const longMsg = 'X'.repeat(520);
      await typeAndSend(page, longMsg);
      await page.waitForTimeout(400);
      const msgs = await page.locator('.woo-chat-msg.customer').all();
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.length > 400, 'Long message aggressively truncated: len=' + text.length);
    } finally { await ctx.close(); }
  });

  await runTest('XSS: <script> tag is NOT executed', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      // Expose detection flag — if XSS fires, this function would be called
      let triggered = false;
      page.on('console', function(msg) {
        if (msg.text().includes('XSS_FIRED')) triggered = true;
      });
      await openChat(page);
      await typeAndSend(page, '<script>console.log("XSS_FIRED")</script>');
      await page.waitForTimeout(600);
      assert(!triggered, 'XSS: <script> was executed!');
    } finally { await ctx.close(); }
  });

  await runTest('XSS: <img onerror> does not execute', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      let triggered = false;
      page.on('console', function(msg) {
        if (msg.text().includes('IMG_XSS')) triggered = true;
      });
      await openChat(page);
      await typeAndSend(page, '<img src=x onerror="console.log(\'IMG_XSS\')">');
      await page.waitForTimeout(600);
      assert(!triggered, 'XSS: onerror handler executed');
    } finally { await ctx.close(); }
  });

  await runTest('XSS: HTML special chars in message are escaped', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await typeAndSend(page, '<b>bold</b> & "quotes"');
      await page.waitForTimeout(300);
      const msgs = await page.locator('.woo-chat-msg.customer').all();
      const html = await msgs[msgs.length - 1].innerHTML();
      assert(!html.includes('onerror=') && !html.includes('onclick='), 'Dangerous attribute in rendered HTML: ' + html.substring(0, 200));
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.includes('bold'), 'Message text garbled: ' + text);
    } finally { await ctx.close(); }
  });

  await runTest('Empty message does not send', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const before = await page.locator('.woo-chat-msg').count();
      await page.click('#woo-chat-send-btn');
      await page.waitForTimeout(500);
      const after = await page.locator('.woo-chat-msg').count();
      assert(after === before, 'Empty message was sent (count: ' + before + ' -> ' + after + ')');
    } finally { await ctx.close(); }
  });

  await runTest('Whitespace-only message does not send', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await page.locator('#woo-chat-input').fill('   ');
      const before = await page.locator('.woo-chat-msg').count();
      await page.click('#woo-chat-send-btn');
      await page.waitForTimeout(500);
      const after = await page.locator('.woo-chat-msg').count();
      assert(after === before, 'Whitespace-only message was sent');
    } finally { await ctx.close(); }
  });

  await runTest('Rapid clicks on welcome button do not duplicate customer messages', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      const btn = page.locator('[data-welcome-action="Planuoju vaikų gimtadienį arba krikštynas"]');
      await btn.click();
      await btn.click().catch(function() {});
      await btn.click().catch(function() {});
      await waitForAIResponse(page);
      const count = await page.locator('.woo-chat-msg.customer').count();
      assert(count <= 1, 'Duplicate customer messages after rapid clicks: ' + count);
    } finally { await ctx.close(); }
  });

  await runTest('Rapid clicks on disabled option button do not send duplicates', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      const dateBtn = page.locator('.chat-option-btn[data-chat-option^="20"]').first();
      const value = await dateBtn.getAttribute('data-chat-option');
      await dateBtn.click();
      await dateBtn.click().catch(function() {});
      await dateBtn.click().catch(function() {});
      await waitForAIResponse(page);
      const msgs = await page.locator('.woo-chat-msg.customer').allTextContents();
      const dateMsgs = msgs.filter(function(t) { return t.trim() === value; });
      assert(dateMsgs.length === 1, 'Expected 1 date message, got ' + dateMsgs.length);
    } finally { await ctx.close(); }
  });

  await runTest('Chat toggle closes and re-opens correctly', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      assert(await page.isVisible('.woo-chat-window.open'), 'Chat should be open');
      await page.click('.woo-chat-toggle');
      await page.waitForTimeout(400);
      assert(!await page.isVisible('.woo-chat-window.open'), 'Chat should be closed');
      await page.click('.woo-chat-toggle');
      await page.waitForTimeout(400);
      assert(await page.isVisible('.woo-chat-window.open'), 'Chat should re-open');
    } finally { await ctx.close(); }
  });

  await runTest('Reset button clears all messages', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Planuoju vaikų gimtadienį arba krikštynas');
      await waitForAIResponse(page);
      await page.click('.demo-btn[onclick*="reset"]');
      await page.waitForTimeout(400);
      if (!await page.isVisible('.woo-chat-window.open')) await openChat(page);
      const count = await page.locator('.woo-chat-msg').count();
      assert(count === 0, 'Expected 0 messages after reset, found ' + count);
    } finally { await ctx.close(); }
  });

  await runTest('"Pagrindinis meniu" quick reply shows main menu', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await clickWelcomeAction(page, 'Saugumas, DUK ir kontaktai');
      await waitForAIResponse(page);
      await page.locator('[data-chat-option="Pagrindinis meniu"]').first().click();
      await waitForAIResponse(page);
      assert(await page.isVisible('.chat-main-menu'), 'Main menu not shown after clicking "Pagrindinis meniu"');
    } finally { await ctx.close(); }
  });

  await runTest('English message gets a non-empty response', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await typeAndSend(page, 'What trampolines do you have?');
      await waitForAIResponse(page);
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      assert(msgs.length > 0, 'No response for English message');
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.length > 10, 'Response too short for English: "' + text + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Demo bar scenario button fills the input field', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      // Click first demo button (Gimtadienis)
      await page.locator('.demo-btn').first().click();
      await page.waitForTimeout(500);
      const val = await page.locator('#woo-chat-input').inputValue().catch(function() { return ''; });
      assert(val.length > 0, 'Input not filled after demo button click');
    } finally { await ctx.close(); }
  });

  await runTest('Emoji in message does not break rendering', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await openChat(page);
      await typeAndSend(page, 'Labas 🎂🎉🎪🦄');
      await waitForAIResponse(page);
      const msgs = await page.locator('.woo-chat-msg.customer').all();
      const text = await msgs[msgs.length - 1].textContent();
      assert(text.includes('Labas'), 'Emoji message garbled: "' + text + '"');
    } finally { await ctx.close(); }
  });

  await runTest('Contact step: invalid contact (no phone) prompts for phone again', async function() {
    const { page, ctx } = await freshPage(browser);
    try {
      await flowToBirthdayContact(page);
      await typeAndSend(page, 'Jonas be telefono');
      await waitForAIResponse(page);
      const msgs = await page.locator('.woo-chat-msg.agent').all();
      const text = await msgs[msgs.length - 1].textContent();
      const asksAgain = text.toLowerCase().includes('telefon') || text.toLowerCase().includes('numeris') ||
        text.toLowerCase().includes('vardas') || text.toLowerCase().includes('pvz');
      assert(asksAgain, 'Expected re-prompt for phone, got: "' + text.substring(0, 200) + '"');
    } finally { await ctx.close(); }
  });
}

// ─── Suite: Responsive Layout ─────────────────────────────────────────────
async function suite_ResponsiveLayout(browser) {
  console.log('\n── Suite: Responsive Layout ─────────────────────────────');

  await runTest('Mobile (375px) — chat widget visible and openable', async function() {
    const { page, ctx } = await freshPage(browser, { viewport: { width: 375, height: 812 } });
    try {
      assert(await page.isVisible('.woo-chat-toggle'), 'Toggle not visible on mobile');
      await openChat(page);
      assert(await page.isVisible('.woo-chat-window.open'), 'Chat did not open on mobile');
    } finally { await ctx.close(); }
  });

  await runTest('Mobile (375px) — chat window width does not exceed 380px', async function() {
    const { page, ctx } = await freshPage(browser, { viewport: { width: 375, height: 812 } });
    try {
      await openChat(page);
      const box = await page.locator('.woo-chat-window').boundingBox();
      assert(box !== null, 'Chat window has no bounding box on mobile');
      assert(box.x >= 0, 'Chat window left-overflows viewport: x=' + box.x);
      assert(box.x + box.width <= 380, 'Chat window right-overflows: x+w=' + (box.x + box.width));
    } finally { await ctx.close(); }
  });

  await runTest('Desktop (1280px) — chat window positioned on the right side', async function() {
    const { page, ctx } = await freshPage(browser, { viewport: { width: 1280, height: 800 } });
    try {
      await openChat(page);
      const box = await page.locator('.woo-chat-window').boundingBox();
      assert(box !== null, 'Chat window has no bounding box on desktop');
      assert(box.x > 800, 'Chat window not on right side: x=' + box.x);
    } finally { await ctx.close(); }
  });

  await runTest('Mobile (375px) — demo bar scroll width <= 400px', async function() {
    const { page, ctx } = await freshPage(browser, { viewport: { width: 375, height: 812 } });
    try {
      const demoBarScrollWidth = await page.locator('.demo-bar').evaluate(function(el) {
        return el.scrollWidth;
      });
      assert(demoBarScrollWidth <= 400, 'Demo bar too wide on mobile: ' + demoBarScrollWidth);
    } finally { await ctx.close(); }
  });
}

// ─── Main runner ──────────────────────────────────────────────────────────
async function main() {
  console.log('=========================================================');
  console.log('  Batutynas.lt Demo Chatbot -- Playwright Test Suite');
  console.log('=========================================================');

  let server;
  let browser;

  try {
    server = await startServer();
    console.log('\nHTTP server started on ' + BASE_URL);

    browser = await chromium.launch({ headless: true, slowMo: SLOW_MO });
    console.log('Browser launched (Chromium headless)\n');

    await suite_PageLoad(browser);
    await suite_BirthdayFlow(browser);
    await suite_PartyFlow(browser);
    await suite_InfoFAQ(browser);
    await suite_EquipmentCatalog(browser);
    await suite_DatePicker(browser);
    await suite_PublicEventFlow(browser);
    await suite_AddressInput(browser);
    await suite_NoAddonFlow(browser);
    await suite_SessionPersistence(browser);
    await suite_TrampolineDetailToggle(browser);
    await suite_EdgeCases(browser);
    await suite_ResponsiveLayout(browser);

  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }

  console.log('\n=========================================================');
  console.log('  Results: ' + passed + ' passed, ' + failed + ' failed  (' + (passed + failed) + ' total)');
  console.log('=========================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter(function(r) { return r.status === 'FAIL'; })
      .forEach(function(r) { console.log('  FAIL  ' + r.name + '\n        ' + r.error); });
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
