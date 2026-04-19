#!/usr/bin/env python3
"""
Build Google Tasks -> Calendar Events sync workflow for n8n (v2 - refined parser).
Generates tasks-sync-workflow.json for deployment.

Owner (eddobr@gmail.com) logs orders as Google Tasks in the primary "Mano užduotys" list.
This workflow polls every 10 minutes, classifies each task (ORDER / TODO / INTERNAL),
parses ORDER tasks into bookings (with multi-day merging, per-item price verification,
B2B tagging, add-on extraction), creates matching Google Calendar events via the
Calendar Bridge, marks tasks as completed, and notifies the owner via Telegram.

Owner clarifications baked into parser (Session 37+):
  1. Multi-day event: same address + name + "2 diena/antra diena" -> merged (durationDays=2)
  2. Multi-equipment, same address/same date -> merged event with combined equipment list
  3. Per-item price: extract quantity, compute unit price, flag VERIFY when math is off
  4. Mega ruožas/trasa is MODULAR - keep quantity metadata
  5. "Bendruomenės namai" is a B2B venue -> tag explicitly
  6. Kempiniukas = small trampoline (SpongeBob), Pilis/Candy Pop are examples of "fits inside"
  7. Standalone TODO-like titles ("nurasyti", "palaistyti", "sutvarkyti") stay in Tasks
  8. TODO near an ORDER (e.g. "Candy Pop, turi nurasyti 30 eur") -> merge as ORDER note

Usage:
    source .env && python3 n8n-workflows/build-tasks-sync.py
"""

import json, os, uuid

# Configuration
BOT_TOKEN = os.environ.get('BATUTYNAS_BOT_TOKEN', '')
OWNER_CHAT_ID = os.environ.get('BATUTYNAS_OWNER_CHAT_ID', '8258463322')
# Dashboard-only, silent-auto-confirm mode (owner directive 2026-04-18):
# - URL: /api/webhook/n8n-tasks-import (NOT /api/orders)
# - Creates status="confirmed", no email, no Telegram confirm-button trigger
# - Requires x-sync-secret header matching N8N_SYNC_SECRET env var
# - Idempotent on form_data.taskIds (never creates duplicates)
DASHBOARD_ORDERS_URL = "https://batutynas-chatbot.0uvai5.easypanel.host/api/webhook/n8n-tasks-import"
# Shared secret pulled from Telegram Bot V3 workflow (same value backend uses)
N8N_SYNC_SECRET_VALUE = "__N8N_SYNC_SECRET__"
# Deprecated (kept for reference — do NOT use, sent to Google Calendar):
# CALENDAR_BRIDGE_CREATE = "https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-calendar-create"

# Google Tasks OAuth credential (separate from Calendar - different project/scope)
GTASKS_CRED_ID = "2IWv8jjxCnAqLgx3"
GTASKS_CRED_NAME = "Batutynas Google Tasks"

# Telegram credential
TELEGRAM_CRED_ID = "9BHFQfSuhUuhfdqW"
TELEGRAM_CRED_NAME = "Batutynas Telegram Bot"

def uid():
    return str(uuid.uuid4())

Y = 400  # vertical lane

# Parser constants shared with Parse Tasks node via JS string
PARSER_PREAMBLE_JS = r"""
// Equipment taxonomy (18 core items + aliases + typos found in 222 tasks)
const EQUIPMENT = [
  { name: 'Mega Rocket',          kw: ['mega rocket','mega raketa','raketa','rocket'], tier: 'mega' },
  { name: 'Mega Ufonautai',       kw: ['mega ufonautai','ufonautai','ufo'], tier: 'mega' },
  { name: 'Mega Waikiki',         kw: ['mega waikiki','mega vaikiki','waikiki','vaikiki'], tier: 'mega' },
  { name: 'Mega ruožas',          kw: ['mega trasa','mega ruoz','mega ruož','mega ruoza'], tier: 'obstacle', modular: true },
  { name: 'Giga ruožas',          kw: ['giga ruoz','giga ruož','giga ruoza','giga trasa','giga'], tier: 'obstacle' },
  { name: 'Fantazijų parkas',     kw: ['fantaziju','fantazij','fantazijos'], tier: 'park' },
  { name: 'Džiumandži parkas',    kw: ['dziumandzi','džiumandži','jumanji'], tier: 'park' },
  { name: 'Candy Pop',            kw: ['candy pop','candypop','candy'], tier: 'compact' },
  { name: 'Chameleonas',          kw: ['chameleonas','chemeleonas','chameleon'], tier: 'compact' },
  { name: 'Monstrai',             kw: ['monstrai','monstai','monstr'], tier: 'compact' },
  { name: 'Vidutinis batutas',    kw: ['vidutinis batut','vidutinis bat'], tier: 'compact' },
  { name: 'Naujas batutas',       kw: ['naujas batut','naujas bat'], tier: 'compact' },
  { name: 'Mega batutas (bendras)', kw: ['mega batut'], tier: 'mega' },
  { name: 'Batutų parkas (bendras)', kw: ['batutu parkas','batutų parkas','batutu park'], tier: 'park' },
  { name: 'Dino batutas',         kw: [' dino ',' dino,','dino uz','dino u\\u017E'], tier: 'compact' },
  { name: 'Vandenynas',           kw: ['vandenynas'], tier: 'compact' },
  { name: 'Aštuonkojis',          kw: ['astuonkojis','aštuonkojis','octopus'], tier: 'compact' },
  { name: 'Vienaragiai',          kw: ['vienaragiai','vienaragi','unicorn'], tier: 'compact' },
  { name: 'Pilis mažiesiems',     kw: ['pilis','pilis maziesiems','castle'], tier: 'toddler' },
  { name: 'Kempiniukas (SpongeBob)', kw: ['kempiniukas','spongebob','kempinis'], tier: 'toddler' },
  { name: 'Milžiniškas Dart',     kw: ['milziniskas dart','milžiniškas dart','saudykla','šaudykla','dart','darts'], tier: 'interactive' },
  { name: 'Kamuolių medžioklė',   kw: ['kamuoliu medzio','kamuolių medžio','kamuoliu','kamuolių'], tier: 'interactive' },
  { name: 'Rodeo bulius',         kw: ['rodeo','bulius','rodeobulius'], tier: 'interactive' },
  { name: 'Banketo stalai ir kėdės', kw: ['stalai ir kedes','stalai ir kėdės','kedziu ir stalu','kedes','kėdės','kedziu','kėdžių','banketo','stalai'], tier: 'party-equipment' },
  { name: 'Disco paviljonas',     kw: ['disco','paviljonas','klubas','diskoteka'], tier: 'party-equipment' },
  // Sumo + VR are usually ADDONS (paired with primary equipment). Keeping them
  // in ADDONS only; rare standalone bookings fall through to INTERNAL and the
  // owner handles them manually.
];

// Add-ons (tracked separately from equipment; flagged in notes/tags)
const ADDONS = {
  'vata': 'Cukraus vata',
  'cukraus vata': 'Cukraus vata',
  'serbetas': 'Šerbetas',
  'šerbetas': 'Šerbetas',
  'popcorn': 'Popcorn',
  'popkorn': 'Popcorn',
  'burbulai': 'Burbulų mašina',
  'burbulu': 'Burbulų mašina',
  'burbulų': 'Burbulų mašina',
  'vr': 'Virtuali realybė',
  'putos': 'Putų šou',
  'putu šou': 'Putų šou',
  'putų šou': 'Putų šou',
  'fotikas': 'Instax Mini',
  'instax': 'Instax Mini',
  'sumo': 'Sumo kostiumai',
  'prailgintuvas': 'Prailgintuvas',
  'jbl': 'JBL PartyBox',
  'partybox': 'JBL PartyBox',
  'dumu masina': 'Dūmų mašina',
  'dūmų mašina': 'Dūmų mašina',
  'dumai': 'Dūmų mašina',
  'popcorn aparat': 'Popcorn aparatas',
  'popkorn aparat': 'Popcorn aparatas',
  'kolonele': 'Kolonėlė',
  'kolonėlė': 'Kolonėlė',
  'kolonel': 'Kolonėlė',
  'prieziura': 'Priežiūra',
  'priežiūra': 'Priežiūra',
  'priziureti': 'Priežiūra',
};

// Normalize Lithuanian diacritics
function norm(s) {
  return (s || '').toLowerCase()
    .replace(/ą/g,'a').replace(/č/g,'c').replace(/ę/g,'e').replace(/ė/g,'e')
    .replace(/į/g,'i').replace(/š/g,'s').replace(/ų/g,'u').replace(/ū/g,'u').replace(/ž/g,'z');
}

// Classification: ORDER / TODO / INTERNAL
const TODO_PREFIXES = [
  'nurasyti','nurašyti','palaistyti','sutvarkyti','pakrauti',
  'ivertinti','įvertinti','paskambinti','patikrinti','atsiusti','atsiųsti',
  'sumoketi','sumokėti','susisiekti','nupirkti','nuvezti','paruosti',
  'domejosi','domėjosi','pasiimti','grazinti','gražinti','perpildyti','uzsakyti','užsakyti',
  'ratu suvedimas','ratų suvedimas',
  'paimti','paiimti','atsiimti','atiduoti','issiaiskinti','išsiaiškinti',
  'ivykdyti','įvykdyti','susitikti','susitart',
];

function classify(task, hasEquipment, hasPrice, hasAddress, hasDate, hasPhone) {
  const titleNorm = norm(task.title || '');
  // TODO prefix beats everything: "nurasyti 30 eur Candy Pop" is a write-off, not a booking
  for (const verb of TODO_PREFIXES) {
    if (titleNorm.startsWith(verb)) return 'TODO';
  }
  // TODO verb embedded in short title with no real booking fields:
  // "Turi nurasyti SUMA" — 'turi' isn't a prefix but contains 'nurasyti'
  if (!hasDate && !hasAddress && !hasPrice) {
    for (const verb of TODO_PREFIXES) {
      if (titleNorm.includes(' ' + verb) || titleNorm.includes(verb + ' ')) return 'TODO';
    }
  }
  // ORDER requires a scheduled booking with either a location or a price
  if (hasEquipment && hasDate && (hasPrice || hasAddress || hasPhone)) return 'ORDER';
  // ORDER without phone/addr/price but has date — still likely a draft booking
  if (hasEquipment && hasDate) return 'ORDER';
  // Chair/equipment rental with contact info but no date — request waiting to be scheduled
  if (hasEquipment && (hasPrice || hasAddress) && hasPhone) return 'ORDER';
  // Draft: equipment mentioned but no date, no address, no price, no phone → not actionable
  return 'INTERNAL';
}
"""

PARSE_TASKS_CODE = PARSER_PREAMBLE_JS + r"""

// Extract matches (returns {equipment:[], addons:[]})
function extractItems(text) {
  const n = norm(text);
  const foundEquip = [];
  const foundAddons = [];
  for (const eq of EQUIPMENT) {
    for (const kw of eq.kw) {
      if (n.includes(kw)) {
        if (!foundEquip.find(e => e.name === eq.name)) {
          foundEquip.push({ name: eq.name, tier: eq.tier, modular: !!eq.modular });
        }
        break;
      }
    }
  }
  for (const [kw, label] of Object.entries(ADDONS)) {
    if (n.includes(kw) && !foundAddons.includes(label)) {
      // Skip add-on if already matched as equipment (e.g. Sumo kostiumai is both)
      if (foundEquip.find(e => e.name === label)) continue;
      foundAddons.push(label);
    }
  }
  return { equipment: foundEquip, addons: foundAddons };
}

// Price extraction
// Handles: "uz 200", "už 70 Eur", "200€", "| 200 eur", "150 eurų",
// "170+25" (sum), "140-14=126€" (final after discount), "3x50" (quantity)
function extractPrice(text) {
  if (!text) return 0;

  // Priority 1: explicit final price after "=" (discount/computed)
  const eq = text.match(/=\s*(\d+)\s*(?:€|eur|eurų|euru)?/i);
  if (eq) return parseInt(eq[1], 10);

  // Priority 2: sum pattern "170+25" or "170+25€" — both operands 1-4 digits,
  // second operand NOT followed by more digits (prevents "5 +37063473711" = phone).
  const sum = text.match(/(\d{1,4})\s*\+\s*(\d{1,4})(?!\d)(?:\s*(?:€|(?:eur|eurų|euru)\b))?/i);
  if (sum) return parseInt(sum[1], 10) + parseInt(sum[2], 10);

  // Priority 3: "uz N" / "už N" + optional unit
  const uz = text.match(/u[zž]\s*(\d+)\s*(?:€|eur|eurų|euru)?/i);
  if (uz) return parseInt(uz[1], 10);

  // Priority 4: bare number followed by €/eur
  const eur = text.match(/(\d+)\s*(?:€|(?:eur|eurų|euru)\b)/i);
  if (eur) return parseInt(eur[1], 10);

  // Priority 5: pipe/dash separated "| 200"
  const sep = text.match(/[\|\-]\s*(\d+)(?:\s|$)/);
  if (sep) return parseInt(sep[1], 10);

  return 0;
}

// Per-item quantity extraction for price verification using matchAll
function extractQuantities(text) {
  if (!text) return [];
  const quantities = [];
  const re = /(\d+)\s+(kedz|kėdz|kede|kėde|kedes|kėdes|stalai|stalu|stalų|stal)/gi;
  for (const m of text.matchAll(re)) {
    quantities.push({ qty: parseInt(m[1], 10), unit: m[2].toLowerCase() });
  }
  return quantities;
}

// Price double-check
// Standard rates: kėdė=2.5€, stalas=15€ (approximate; owner may override)
const UNIT_RATES = { 'kede': 2.5, 'kėde': 2.5, 'kedes': 2.5, 'kėdes': 2.5, 'kedz': 2.5, 'kėdz': 2.5,
                      'stal': 15, 'stalai': 15, 'stalu': 15, 'stalų': 15 };

function verifyPrice(statedPrice, quantities) {
  if (!statedPrice || !quantities.length) return { verified: false, expected: 0, match: null };
  let expected = 0;
  for (const q of quantities) {
    const rate = UNIT_RATES[q.unit] || 0;
    expected += q.qty * rate;
  }
  const diff = Math.abs(statedPrice - expected);
  const match = diff <= 5;
  return {
    verified: expected > 0,
    expected: expected,
    stated: statedPrice,
    match: match,
    diff: diff,
    breakdown: quantities.map(q => q.qty + '×' + (UNIT_RATES[q.unit] || '?') + '€').join(' + '),
  };
}

// Notes parser: extract address, phones, email, customer name.
// If notes is empty, falls back to parsing the TITLE for inline contact
// (e.g. "Kempiniukas uz 70€, šeštadienį, Bendruomenės namai 863587425").
function parseNotes(notes, titleFallback) {
  const source = notes || '';
  const phoneRe = /(?:\+370|8|0)\d[\d\s\-()]{6,}/g;
  const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/;

  const phones = [];
  let email = '';

  // Harvest phones + email from both notes AND title (phones may live in title).
  // Trim phones — regex character class `\s` eats trailing newlines from notes.
  for (const pool of [source, titleFallback || '']) {
    const pm = pool.match(phoneRe);
    if (pm) for (const raw of pm) {
      const p = raw.trim();
      if (pool.replace(/\D/g,'').length >= 8 && p && !phones.includes(p)) phones.push(p);
    }
    const em = pool.match(emailRe);
    if (em && !email) email = em[0];
  }

  // Address extraction
  let address = '';
  let customerName = '';
  if (source) {
    const lines = source.split(/\n/).map(l => l.trim()).filter(Boolean);
    const nonContact = lines.filter(l => !l.match(phoneRe) && !l.match(emailRe));
    address = nonContact[0] || '';
    customerName = nonContact.slice(1).join(' · ') || '';
  } else if (titleFallback) {
    // Fallback: strip price/equipment/phone from title, use remainder as address
    let rest = titleFallback
      .replace(phoneRe, '')
      .replace(/u[zž]\s*\d+\s*(?:€|eur|eurų|euru)?/gi, '')
      .replace(/\d+\s*(?:€|(?:eur|eurų|euru)\b)/gi, '')
      .replace(/^[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž ]+?(?:\+|,|$)/, ''); // strip leading equipment word
    rest = rest.replace(/[,\|]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest.length > 3) address = rest;
  }
  return { address, phones, email, customerName, rawLines: source.split(/\n/) };
}

// Tag extraction
function extractTags(text, notes) {
  const tags = [];
  const n = norm(text + ' ' + (notes || ''));
  // Owner uses "bendruomene"/"bendruomenei"/"bendruomenė" for community
  // venue (B2B); not every case has "namai" in the name.
  if (n.includes('bendruomen')) tags.push('Bendruomenės namai');
  if (n.includes('per nakti') || n.includes('per naktį') || n.includes('nakvoja')) tags.push('Per naktį');
  if (n.includes('sms') || n.includes('zinute') || n.includes('žinutė')) tags.push('SMS tik');
  if (n.includes('2 diena') || n.includes('antra diena') || n.includes('2d.')) tags.push('Multi-day');
  if (n.includes('vr ') || n.startsWith('vr')) tags.push('VR');
  return tags;
}

// Multi-day detection
function isMultiDay(task) {
  const t = norm(task.title || '');
  const n = norm(task.notes || '');
  return t.includes('2 diena') || n.includes('2 diena') ||
         t.includes('antra diena') || n.includes('antra diena') ||
         t.includes('2d.') || n.includes('2d.');
}

// Build booking from a task
function buildBooking(task) {
  const title = task.title || '';
  const notes = task.notes || '';
  const items = extractItems(title + ' ' + notes);
  const price = extractPrice(title) || extractPrice(notes);
  const quantities = extractQuantities(title + ' ' + notes);
  const priceCheck = verifyPrice(price, quantities);
  const parsedNotes = parseNotes(notes, title);
  const tags = extractTags(title, notes);
  const due = task.due ? task.due.substring(0, 10) : null;

  const hasEquip = items.equipment.length > 0;
  const hasAddr = !!parsedNotes.address;
  const hasDate = !!due;
  const hasPhone = (parsedNotes.phones || []).length > 0;
  const classification = classify(task, hasEquip, price > 0, hasAddr, hasDate, hasPhone);

  return {
    taskId: task.id,
    taskTitle: title,
    taskNotes: notes,
    classification: classification,
    equipment: items.equipment,
    addons: items.addons,
    primaryEquipment: items.equipment[0]?.name || '',
    price: price,
    priceCheck: priceCheck,
    address: parsedNotes.address,
    customerName: parsedNotes.customerName || 'Iš Google Tasks',
    phones: parsedNotes.phones,
    phone: parsedNotes.phones[0] || '',
    email: parsedNotes.email,
    startDate: due,
    isMultiDay: isMultiDay(task),
    tags: tags,
  };
}

// Multi-day + address-based merging
function mergeRelated(bookings) {
  const merged = [];
  const used = new Set();
  for (let i = 0; i < bookings.length; i++) {
    if (used.has(i)) continue;
    const b = bookings[i];
    used.add(i);
    if (!b.address) { merged.push(b); continue; }
    const siblings = [];
    for (let j = i + 1; j < bookings.length; j++) {
      if (used.has(j)) continue;
      const o = bookings[j];
      if (!o.address) continue;
      const sameAddr = norm(o.address) === norm(b.address);
      const sameDate = o.startDate === b.startDate;
      const nextDay = b.startDate && o.startDate &&
        (new Date(o.startDate) - new Date(b.startDate)) === 86400000;
      if (sameAddr && (sameDate || o.isMultiDay || b.isMultiDay || nextDay)) {
        siblings.push(o);
        used.add(j);
      }
    }
    if (siblings.length === 0) { merged.push(b); continue; }
    const allEquip = [...b.equipment];
    const allAddons = [...b.addons];
    const allTags = [...b.tags];
    const allTaskIds = [b.taskId];
    let totalPrice = b.price;
    let earliestDate = b.startDate;
    let latestDate = b.startDate;
    let isMulti = b.isMultiDay;
    for (const s of siblings) {
      for (const e of s.equipment) if (!allEquip.find(x => x.name === e.name)) allEquip.push(e);
      for (const a of s.addons) if (!allAddons.includes(a)) allAddons.push(a);
      for (const t of s.tags) if (!allTags.includes(t)) allTags.push(t);
      allTaskIds.push(s.taskId);
      totalPrice += s.price;
      if (s.startDate && (!earliestDate || s.startDate < earliestDate)) earliestDate = s.startDate;
      if (s.startDate && (!latestDate || s.startDate > latestDate)) latestDate = s.startDate;
      if (s.isMultiDay) isMulti = true;
    }
    const duration = isMulti || (latestDate !== earliestDate) ? 2 : 1;
    merged.push({
      ...b,
      equipment: allEquip,
      addons: allAddons,
      tags: [...new Set([...allTags, ...(duration > 1 ? ['Multi-day'] : [])])],
      price: totalPrice,
      primaryEquipment: allEquip[0]?.name || '',
      startDate: earliestDate, // use earliest, not first-iterated
      durationDays: duration,
      mergedTaskIds: allTaskIds,
      endDate: latestDate,
    });
  }
  return merged;
}

// MAIN
// Support both shapes:
//   (a) native googleTasks node — one item per task at $input.all()[i].json
//   (b) HTTP Request Google Tasks API — { items: [...] } at $input.first().json.items
const allItems = $input.all();
const firstJson = allItems[0] ? allItems[0].json : {};
const raw = Array.isArray(firstJson.items)
  ? firstJson.items
  : allItems.map(it => it.json).filter(t => t && (t.id || t.title));

// Future-only: only sync tasks whose due date is today or later.
// String compare on YYYY-MM-DD is timezone-safe and avoids time-of-day edge
// cases (Google Tasks typically stores due as midnight UTC).
// Per owner directive 2026-04-18: "Do only for the ones in the future from today on."
const TODAY_STR = new Date().toISOString().substring(0, 10);
const recent = raw.filter(t => {
  if (!t.due) return false; // no due date — can't schedule, skip
  const dueStr = t.due.substring(0, 10);
  return dueStr >= TODAY_STR;
});

const all = recent.map(buildBooking);

const orders = all.filter(b => b.classification === 'ORDER');
const todos = all.filter(b => b.classification === 'TODO');
const internals = all.filter(b => b.classification === 'INTERNAL');

const mergedOrders = mergeRelated(orders);

const bookings = mergedOrders.map(o => {
  const equipNames = o.equipment.map(e => e.name).join(', ');
  const addonStr = o.addons.length ? '\n+ Priedai: ' + o.addons.join(', ') : '';
  const tagStr = o.tags.length ? '\n[' + o.tags.join(' · ') + ']' : '';
  const priceVerif = o.priceCheck && o.priceCheck.verified && !o.priceCheck.match
    ? '\nVERIFY: stated ' + o.priceCheck.stated + '€ vs expected ' + o.priceCheck.expected + '€ (' + o.priceCheck.breakdown + ')'
    : '';
  const phoneStr = o.phones.length ? '\n' + o.phones.join(', ') : '';
  const emailStr = o.email ? '\n' + o.email : '';
  const summary = equipNames + (o.price ? ' — ' + o.price + '€' : '');
  const description = [
    equipNames + addonStr,
    o.address || 'Nenurodyta',
    o.customerName,
    phoneStr.trim(),
    emailStr.trim(),
    (o.price || 0) + '€' + priceVerif,
    tagStr.trim(),
    '--- Sinchronizuota iš Google Tasks ---',
    'Original task(s): ' + (o.mergedTaskIds || [o.taskId]).join(', '),
    'Title: ' + o.taskTitle,
  ].filter(Boolean).join('\n');

  return {
    equipment: o.primaryEquipment,
    equipmentList: o.equipment.map(e => e.name),
    addons: o.addons,
    customer_name: o.customerName,
    phone: o.phone,
    email: o.email,
    address: o.address,
    startDate: o.startDate,
    durationDays: o.durationDays || 1,
    price: o.price,
    tags: o.tags,
    priceCheck: o.priceCheck,
    summary: summary,
    description: description,
    notes: description,
    source: 'google_tasks',
    taskIds: o.mergedTaskIds || [o.taskId],
    taskTitle: o.taskTitle,
  };
});

return [{
  json: {
    hasTasks: bookings.length > 0,
    stats: {
      total: all.length,
      orders: orders.length,
      todos: todos.length,
      internals: internals.length,
      merged: mergedOrders.length,
    },
    bookings: bookings,
    skipped: {
      todos: todos.map(t => ({ taskId: t.taskId, title: t.taskTitle })),
      internals: internals.map(t => ({ taskId: t.taskId, title: t.taskTitle })),
    },
  }
}];
"""

SPLIT_BOOKINGS_CODE = r"""
// Split bookings AND pre-build the /api/webhook/n8n-tasks-import payload.
// n8n expression language chokes on nested ({...||[]}).join(...) inside
// HTTP jsonBody templates, so we construct the body here in plain JS.
const bookings = $input.first().json.bookings || [];
if (!bookings.length) return [];
return bookings.map(b => ({
  json: {
    ...b,
    apiBody: {
      flow_type: 'party',
      form_data: {
        vardas: b.customer_name,
        telefonas: b.phone,
        epastas: b.email || '',
        data: b.startDate,
        vieta: b.address,
        batutas: b.equipment,
        priedai: (b.addons || []).join(', '),
        source: 'google_tasks_sync',
        taskIds: b.taskIds,
        taskTitle: b.taskTitle,
        durationDays: b.durationDays,
        price: b.price,
        tags: b.tags,
        priceCheck: b.priceCheck,
        description: b.description,
      },
    },
  },
}));
"""

def build():
    nodes = []
    connections = {}

    def connect(from_name, to_name, from_idx=0, to_idx=0):
        if from_name not in connections:
            connections[from_name] = {"main": [[]]}
        while len(connections[from_name]["main"]) <= from_idx:
            connections[from_name]["main"].append([])
        connections[from_name]["main"][from_idx].append({
            "node": to_name, "type": "main", "index": to_idx
        })

    nodes.append({
        "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
        "id": uid(), "name": "Every 10 Minutes",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [240, Y]
    })

    nodes.append({
        "parameters": {
            "method": "GET",
            "url": "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=100",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleTasksOAuth2Api",
            "options": {"timeout": 15000}
        },
        "id": uid(), "name": "Fetch Uncompleted Tasks",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [460, Y],
        "credentials": {"googleTasksOAuth2Api": {"id": GTASKS_CRED_ID, "name": GTASKS_CRED_NAME}},
        "continueOnFail": True,
        "alwaysOutputData": True,
    })

    nodes.append({
        "parameters": {"jsCode": PARSE_TASKS_CODE},
        "id": uid(), "name": "Parse Tasks",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [680, Y]
    })

    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "combinator": "and",
                "conditions": [{
                    "id": uid(),
                    "leftValue": "={{ $json.hasTasks }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "equals"}
                }]
            },
            "options": {}
        },
        "id": uid(), "name": "Has Bookings?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [900, Y]
    })

    nodes.append({
        "parameters": {"jsCode": SPLIT_BOOKINGS_CODE},
        "id": uid(), "name": "Split Bookings",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, Y - 120]
    })

    nodes.append({
        "parameters": {
            "method": "POST",
            "url": DASHBOARD_ORDERS_URL,
            "sendHeaders": True,
            "specifyHeaders": "keypair",
            "headerParameters": {
                "parameters": [
                    {"name": "x-sync-secret", "value": N8N_SYNC_SECRET_VALUE},
                    {"name": "Content-Type", "value": "application/json"},
                ],
            },
            "sendBody": True,
            "specifyBody": "json",
            # Backend /api/webhook/n8n-tasks-import:
            # - Stores as status="confirmed" in MongoDB
            # - No email, no Telegram, no Calendar side-effect
            # - Idempotent on form_data.taskIds
            # Payload is pre-built in Split Bookings as $json.apiBody — keeps the
            # jsonBody expression simple and avoids n8n expression parser choking
            # on nested `||` defaults and `.join()` inside object literals.
            "jsonBody": "={{ JSON.stringify($json.apiBody) }}",
            "options": {"timeout": 15000}
        },
        "id": uid(), "name": "Create Pending Order",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1340, Y - 120],
        "continueOnFail": True,
        "alwaysOutputData": True,
    })

    # Fan Out code: one item per taskId for Complete Task, but ONLY if
    # Create Pending Order succeeded. FastAPI 4xx/5xx returns {detail: "..."}
    # (no .error field, no .id), so checking !createResult.id catches those
    # and we bail with [] instead of falsely completing the Google Task.
    fan_out_code = r"""
const booking = $('Split Bookings').item.json;
const createResult = $('Create Pending Order').first().json || {};
// Backend returns Order with .id on success (201) OR idempotent hit (200).
// On 401/400/500 FastAPI returns {detail: "..."} — no .id, no .error.
// On Calendar Bridge-style errors (legacy path): .error or .errorMessage.
const failed = !createResult.id || createResult.detail || createResult.error || createResult.errorMessage;
if (failed) return [];
const taskIds = booking.taskIds || [booking.taskId];
return taskIds.map(tid => ({
  json: {
    taskId: tid,
    orderId: createResult.id,
    summary: booking.summary,
    startDate: booking.startDate,
    mergedTaskCount: taskIds.length,
  }
}));
"""
    nodes.append({
        "parameters": {"jsCode": fan_out_code},
        "id": uid(), "name": "Fan Out Task IDs",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1560, Y - 120]
    })

    nodes.append({
        "parameters": {
            "method": "PATCH",
            "url": "=https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{{ $json.taskId }}",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleTasksOAuth2Api",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={"status": "completed"}',
            "options": {"timeout": 10000}
        },
        "id": uid(), "name": "Complete Task",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1780, Y - 120],
        "credentials": {"googleTasksOAuth2Api": {"id": GTASKS_CRED_ID, "name": GTASKS_CRED_NAME}},
        "continueOnFail": True,
        "alwaysOutputData": True,
    })

    notify_text = (
        "=Tasks -> Kalendorius sinchronizuota\n"
        "{{ $json.summary }}\n"
        "{{ $json.startDate }}\n"
        "{{ $json.address || 'Nenurodyta' }}\n"
        "{{ $json.price ? $json.price + '€' : '-' }}\n"
        "{{ $json.tags && $json.tags.length ? $json.tags.join(' · ') : '' }}\n"
        "{{ $json.priceCheck && $json.priceCheck.verified && !$json.priceCheck.match ? 'VERIFY: ' + $json.priceCheck.stated + '€ vs expected ' + $json.priceCheck.expected + '€' : '' }}"
    )

    nodes.append({
        "parameters": {
            "operation": "sendMessage",
            "chatId": OWNER_CHAT_ID,
            "text": notify_text,
            "additionalFields": {}
        },
        "id": uid(), "name": "Telegram Notify",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [2000, Y - 120],
        "credentials": {"telegramApi": {"id": TELEGRAM_CRED_ID, "name": TELEGRAM_CRED_NAME}},
        "continueOnFail": True,
        # Disabled per owner directive 2026-04-18 ("No Telegram messages yet").
        # Kept in the workflow so it can be re-enabled later by setting disabled: False.
        "disabled": True,
    })

    connect("Every 10 Minutes", "Fetch Uncompleted Tasks")
    connect("Fetch Uncompleted Tasks", "Parse Tasks")
    connect("Parse Tasks", "Has Bookings?")
    connect("Has Bookings?", "Split Bookings", 0)
    connect("Split Bookings", "Create Pending Order")
    connect("Create Pending Order", "Fan Out Task IDs")
    connect("Fan Out Task IDs", "Complete Task")
    connect("Complete Task", "Telegram Notify")

    workflow = {
        "name": "Batutynas: Tasks -> Calendar Sync v2",
        "nodes": nodes,
        "connections": connections,
        "settings": {
            "executionOrder": "v1",
            "saveManualExecutions": True,
            "callerPolicy": "workflowsFromSameOwner"
        }
    }
    return workflow


if __name__ == "__main__":
    wf = build()
    out_path = os.path.join(os.path.dirname(__file__), "tasks-sync-workflow.json")
    with open(out_path, "w") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("Generated: " + out_path)
    print("  Nodes: " + str(len(wf['nodes'])))
    print("  Flow: Schedule -> Fetch Tasks -> Parse (classify+merge) -> Has? -> Split -> Create Event -> Fan Out -> Complete Task -> Telegram")
    print("  Features: ORDER/TODO/INTERNAL classification, multi-day merging, address merging, per-item price verification, B2B tags")
