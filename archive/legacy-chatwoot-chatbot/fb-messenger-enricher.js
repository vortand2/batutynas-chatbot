const agentOutput = $input.first().json || {};
const senderId = $('Extract & Route').item.json.senderId;
let response = agentOutput.output || agentOutput.text || '';

if (!response || !response.trim()) {
  response = 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt';
}

// FR-4.1 helper: local-timezone date formatting (avoids UTC midnight rollover)
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// --- Equipment data (categorized by use-case groups) ---
const TRAMPOLINES = [
  // --- big-park (for public events only) ---
  { name: 'Džiumandži parkas', type: 'Nuotykių parkas \u00b7 14x16 m', capacity: 'Iki 40 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', min: 15, max: 200, cat: 'big-park' },
  { name: 'Fantazijų parkas', type: 'Batutų parkas \u00b7 14x14 m', capacity: 'Iki 30 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', min: 10, max: 150, cat: 'big-park' },
  { name: 'Giga ruožas', type: 'Kliūčių trasa 40 m \u00b7 45x8 m', capacity: '360 dalyvių/val.', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', min: 10, max: 1000, cat: 'big-park' },

  // --- mega-trampoline (for birthdays + public) ---
  { name: 'Mega Waikiki', type: 'Aukščiausias 8,5 m \u00b7 16x4 m', capacity: 'Iki 15 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega Rocket', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega Ufonautai', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega ruožas', type: 'Kliūčių trasa 21 m \u00b7 25x6 m', capacity: '240 dalyvių/val.', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', min: 8, max: 600, cat: 'mega-trampoline' },

  // --- standard-trampoline (for birthdays) ---
  { name: 'Monstrai', type: 'Su Dart žaidimu \u00b7 8x5 m', capacity: 'Iki 12 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Candy Pop', type: 'Spalvingas \u00b7 8x5 m', capacity: 'Iki 12 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Aštuonkojis', type: 'Jūros tema \u00b7 8x5 m', capacity: 'Iki 12 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Chameleonas', type: 'Su čiuožykla \u00b7 8x5 m', capacity: 'Iki 12 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Vienaragiai', type: 'Su tuneliais \u00b7 9x4 m', capacity: 'Iki 12 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Pilis mažiesiems', type: 'Iki 5 metų \u00b7 5x4 m', capacity: 'Iki 6 vaikų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', min: 2, max: 6, cat: 'standard-trampoline' },

  // --- addon (extras for any event) ---
  { name: 'Milžiniškas Dart', type: 'Interaktyvi pramoga \u00b7 5x4,5 m', capacity: '60 dalyvių/val.', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', min: 1, max: 999, cat: 'addon' },
  { name: 'Kamuolių medžioklė', type: 'Komandinis žaidimas \u00b7 8 m arena', capacity: '4 žaidėjai/raundas', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250908-wa0000-OjvumGsbJUPEqY7H.jpg', min: 1, max: 999, cat: 'addon' },
  { name: 'Rodeo bulius', type: 'Mechaninis bulius \u00b7 5x5 m', capacity: 'Neribota', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_y02vw0y02vw0y02v-1UPI9AO2yIhGQbUk.png', min: 1, max: 999, cat: 'addon' },
  { name: 'Saldėsių aparatai', type: 'Vata, popcorn, šerbetas', capacity: 'Vata, popcorn, šerbetas', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_n0wezbn0wezbn0we-eBEHQuTVAV3qYVji.png', min: 1, max: 999, cat: 'addon' },

  // --- party-equipment (party group only) ---
  { name: 'Disco paviljonas', type: 'LED apšvietimas \u00b7 4x4 m', capacity: 'Iki 20 žmonių', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', min: 1, max: 999, cat: 'party-equipment' },
  { name: 'Putų šou', type: 'Putų mašina + baseinas', capacity: 'Neribota', img: '', min: 1, max: 999, cat: 'party-equipment' },
  { name: 'Banketo stalai ir kėdės', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_lmbogflmbogflmbo-yW8t5tAPn0eG8rIQ.png', min: 1, max: 999, cat: 'party-equipment' }
];

// Default placeholder for items without images
const DEFAULT_IMG = 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg';

// --- Build carousel from filtered items (max 10 per carousel) ---
function buildCarousels(items) {
  const msgs = [];
  const chunks = [];
  for (let i = 0; i < items.length; i += 10) {
    chunks.push(items.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    const elements = chunk.map(t => ({
      title: t.name,
      subtitle: t.type + ' \u00b7 ' + t.capacity,
      image_url: t.img || DEFAULT_IMG,
      buttons: [{ type: 'postback', title: 'Pasirinkti \u2713', payload: t.name }]
    }));
    msgs.push({
      recipient: { id: senderId },
      messaging_type: 'RESPONSE',
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements } } }
    });
  }
  return msgs;
}

// --- Build main menu quick replies ---
function buildMainMenuQuickReplies() {
  return [
    { content_type: 'text', title: '\u{1F382} Gimtadienis', payload: 'Planuoju vaikų gimtadienį arba krikštynas' },
    { content_type: 'text', title: '\u{1F3AA} Viešas renginys', payload: 'Planuoju viešą renginį arba įmonės sąskrydį' },
    { content_type: 'text', title: '\u{1F389} Vakarėlis', payload: 'Planuoju triukšmingą vakarėlį' },
    { content_type: 'text', title: '\u{1F6D2} Pirkti batutą', payload: 'Noriu pirkti batutą' }
  ];
}

// --- Build date quick replies (FR-4.1: local date parts, avoids UTC rollover) ---
function buildDateQuickReplies() {
  const days = [];
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  for (let i = 0; i < 4; i++) {
    // FR-4.1: Use local date parts instead of toISOString() to avoid UTC midnight rollover
    const iso = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const label = d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' });
    days.push({ content_type: 'text', title: label.substring(0, 20), payload: iso });
    d.setDate(d.getDate() + 7);
  }
  days.push({ content_type: 'text', title: 'Kita data \u270F\uFE0F', payload: 'CUSTOM_DATE' });
  return days;
}

// --- Build guest count quick replies ---
function buildGuestCountQuickReplies() {
  return [
    { content_type: 'text', title: 'Iki 6 vaikų', payload: 'Apie 6 vaikų' },
    { content_type: 'text', title: '7\u201312 vaikų', payload: 'Apie 10 vaikų' },
    { content_type: 'text', title: '13\u201320 vaikų', payload: 'Apie 15 vaikų' },
    { content_type: 'text', title: 'Daugiau nei 20', payload: 'Apie 30 vaikų' }
  ];
}

// --- Build guest count quick replies for public events ---
function buildGuestCountPublicQuickReplies() {
  return [
    { content_type: 'text', title: '20\u201350', payload: 'Apie 35 svečių' },
    { content_type: 'text', title: '50\u2013100', payload: 'Apie 75 svečių' },
    { content_type: 'text', title: '100\u2013200', payload: 'Apie 150 svečių' },
    { content_type: 'text', title: '200\u2013500', payload: 'Apie 350 svečių' },
    { content_type: 'text', title: '500+', payload: 'Apie 700 svečių' }
  ];
}

// --- Build purchase submenu quick replies (FR-8.2: labels ≤20 chars) ---
function buildPurchaseQuickReplies() {
  return [
    { content_type: 'text', title: '\u{1F4E7} Gauti katalogą', payload: 'Noriu gauti batutų katalogą el. paštu' },
    { content_type: 'text', title: '\u{1F3A8} Ind. gamyba', payload: 'Noriu individualios batuto gamybos' }
  ];
}

// --- Build addon upsell quick replies ---
function buildAddonQuickReplies() {
  const addons = TRAMPOLINES.filter(t => t.cat === 'addon');
  const qr = addons.map(t => ({
    content_type: 'text',
    title: t.name.substring(0, 20),
    payload: t.name
  }));
  qr.push({ content_type: 'text', title: '\u274C Be papildomų', payload: 'Tęsti be papildomų pramogų' });
  return qr;
}

// --- Build booking confirmation text (FR-6.1: out-of-hours qualifier) ---
function buildBookingConfirm(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch { data = {}; }

  // FR-3.2: if JSON.parse failed or produced empty object, show safe fallback
  if (!data || Object.keys(data).length === 0) {
    return '\u2705 Užklausa gauta!\n\nMūsų komanda susisieks su jumis per 2 darbo valandas.\n\u{1F4DE} +370 648 803 88\n\u{1F4E7} info@batutynas.lt';
  }

  let text = '\u2705 Užklausa pateikta!\n\n';
  if (data.group_type) text += 'Tipas: ' + data.group_type + '\n';
  if (data.date) text += '\u{1F4C5} Data: ' + data.date + '\n';
  if (data.location) text += '\u{1F4CD} Vieta: ' + data.location + '\n';
  if (data.address) text += 'Adresas: ' + data.address + '\n';
  if (data.event_type) text += '\u{1F389} Renginys: ' + data.event_type + '\n';
  if (data.guest_count) text += '\u{1F465} Svečių: ' + data.guest_count + '\n';
  if (data.contact_name) text += '\u{1F464} Kontaktas: ' + data.contact_name + '\n';
  if (data.contact_phone) text += '\u{1F4DE} Telefonas: ' + data.contact_phone + '\n';
  if (data.trampoline) text += '\u{1F3AA} Batutas: ' + data.trampoline + '\n';
  if (data.addons) text += 'Papildomos pramogos: ' + data.addons + '\n';
  if (data.dimensions) text += '\u{1F4D0} Matmenys: ' + data.dimensions + '\n';
  if (data.colors) text += '\u{1F3A8} Spalvos: ' + data.colors + '\n';
  if (data.characters) text += '\u{1F9F8} Personažai: ' + data.characters + '\n';
  if (data.email) text += '\u{1F4E7} El. paštas: ' + data.email + '\n';

  // FR-6.1: Out-of-hours qualifier
  try {
    const now = new Date();
    const lt = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }));
    const dayOfWeek = lt.getDay();
    const hourOfDay = lt.getHours();
    if (dayOfWeek === 0 || dayOfWeek === 6 || hourOfDay < 8 || hourOfDay >= 18) {
      text += '\n\u23F0 Užklausa bus apdorota artimiausią darbo dieną (I\u2013V, 8:00\u201318:00)';
    } else {
      text += '\nSusisieksime per 2 darbo valandas! \u{1F64F}';
    }
  } catch (e) {
    text += '\nSusisieksime per 2 darbo valandas! \u{1F64F}';
  }

  return text;
}

// --- Group-specific equipment builders ---
function getBirthdayItems(guestCount) {
  const standard = TRAMPOLINES.filter(t => t.cat === 'standard-trampoline');
  const mega = TRAMPOLINES.filter(t => t.cat === 'mega-trampoline');
  let items = standard.concat(mega);
  if (guestCount) {
    const rec = items.filter(t => t.min <= guestCount && guestCount <= t.max);
    const other = items.filter(t => !(t.min <= guestCount && guestCount <= t.max));
    items = rec.concat(other);
  }
  return items;
}

function getPublicItems(guestCount) {
  const bigParks = TRAMPOLINES.filter(t => t.cat === 'big-park');
  const mega = TRAMPOLINES.filter(t => t.cat === 'mega-trampoline');
  const standard = TRAMPOLINES.filter(t => t.cat === 'standard-trampoline');
  let items = bigParks.concat(mega).concat(standard);
  if (guestCount) {
    const rec = items.filter(t => t.min <= guestCount && guestCount <= t.max);
    const other = items.filter(t => !(t.min <= guestCount && guestCount <= t.max));
    items = rec.concat(other);
  }
  return items;
}

function getPartyItems() {
  return TRAMPOLINES.filter(t => t.cat === 'party-equipment');
}

function getAddonItems() {
  return TRAMPOLINES.filter(t => t.cat === 'addon');
}

// --- Process markers in response ---
const messages = [];
let remaining = response;

// Helper to push text message
function pushText(text, quickReplies) {
  if (!text || !text.trim()) return;
  // Strip markdown bold (Messenger doesn't support it)
  let plainText = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  // FR-3.1: Strip any unrecognized markers so raw [MARKER_NAME] text never leaks to user
  plainText = plainText.replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '').trim();
  if (!plainText) return;
  if (plainText.length > 2000) plainText = plainText.substring(0, 1997) + '...';
  const msg = { recipient: { id: senderId }, messaging_type: 'RESPONSE', message: { text: plainText } };
  if (quickReplies) msg.message.quick_replies = quickReplies;
  messages.push(msg);
}

// Check for booking confirm first (has capture group)
const confirmMatch = remaining.match(/\[BOOKING_CONFIRM:(\{[\s\S]*?\})\]/);
if (confirmMatch) {
  const beforeConfirm = remaining.substring(0, confirmMatch.index).trim();
  const afterConfirm = remaining.substring(confirmMatch.index + confirmMatch[0].length).trim();
  if (beforeConfirm) pushText(beforeConfirm);
  pushText(buildBookingConfirm(confirmMatch[1]));
  // Post-booking quick replies (FR-8.2: labels ≤20 chars)
  pushText('', [
    { content_type: 'text', title: '\u{1F501} Naujas užsakymas', payload: 'Noriu užsakyti dar vieną batutą' },
    { content_type: 'text', title: '\u{1F3E0} Pradžia', payload: 'Pagrindinis meniu' }
  ]);
  if (afterConfirm) pushText(afterConfirm);
  remaining = '';
}

// FR-3.2: Catch residual BOOKING_CONFIRM with malformed JSON
if (remaining && remaining.indexOf('BOOKING_CONFIRM') !== -1 && !confirmMatch) {
  const residualMatch = remaining.match(/\[BOOKING_CONFIRM[^\]]*\]/);
  if (residualMatch) {
    const beforeRes = remaining.substring(0, residualMatch.index).trim();
    const afterRes = remaining.substring(residualMatch.index + residualMatch[0].length).trim();
    if (beforeRes) pushText(beforeRes);
    pushText(buildBookingConfirm('{}'));
    pushText('', [
      { content_type: 'text', title: '\u{1F501} Naujas užsakymas', payload: 'Noriu užsakyti dar vieną batutą' },
      { content_type: 'text', title: '\u{1F3E0} Pradžia', payload: 'Pagrindinis meniu' }
    ]);
    if (afterRes) pushText(afterRes);
    remaining = '';
  }
}

// Marker handlers
const markerDefs = [
  { pattern: /\[MAIN_MENU\]/, qr: () => buildMainMenuQuickReplies(), fallback: 'Pasirinkite kategoriją \u{1F447}' },
  { pattern: /\[DATE_PICKER\]/, qr: () => buildDateQuickReplies(), fallback: 'Pasirinkite datą \u{1F447}' },
  { pattern: /\[GUEST_COUNT\]/, qr: () => buildGuestCountQuickReplies(), fallback: 'Kiek svečių planuojate?' },
  { pattern: /\[GUEST_COUNT_PUBLIC\]/, qr: () => buildGuestCountPublicQuickReplies(), fallback: 'Kiek dalyvių planuojate?' },
  { pattern: /\[ADDON_UPSELL\]/, qr: () => buildAddonQuickReplies(), fallback: 'Papildykite savo šventę:' },
  { pattern: /\[PURCHASE_SUBMENU\]/, qr: () => buildPurchaseQuickReplies(), fallback: 'Ką norėtumėte?' },
  { pattern: /\[PURCHASE_EMAIL_INPUT\]/, qr: null, fallback: null, textReplace: 'Parašykite savo el. pašto adresą ir atsiųsime batutų katalogą \u{1F4E7}' },
  { pattern: /\[PURCHASE_CUSTOM_FORM\]/, qr: null, fallback: null, textReplace: 'Aprašykite savo pageidavimus:\n1. Pageidaujami matmenys (plotis x ilgis x aukštis)\n2. Spalvos\n3. Personažai / tema\n4. Papildomi pageidavimai\n5. Kontaktinis el. paštas\n6. Telefono numeris' }
];

// Group equipment markers (with optional guest count)
const groupMarkers = [
  { pattern: /\[MENU_GROUP_BIRTHDAY(?::(\d+))?\]/, items: (count) => getBirthdayItems(count) },
  { pattern: /\[MENU_GROUP_PUBLIC(?::(\d+))?\]/, items: (count) => getPublicItems(count) },
  { pattern: /\[MENU_GROUP_PARTY\]/, items: () => getPartyItems() }
];

if (remaining) {
  let found = false;

  // Check group equipment markers first (they produce carousels)
  for (const gm of groupMarkers) {
    const match = remaining.match(gm.pattern);
    if (match) {
      const textBefore = remaining.substring(0, match.index).trim();
      const textAfter = remaining.substring(match.index + match[0].length).trim();
      const count = match[1] ? parseInt(match[1]) : null;
      if (textBefore) pushText(textBefore);
      const items = gm.items(count);
      const carousels = buildCarousels(items);
      messages.push(...carousels);
      if (textAfter) {
        // Strip remaining markers from trailing text
        const cleaned = textAfter
          .replace(/\[MENU_GROUP_BIRTHDAY(?::\d+)?\]/g, '')
          .replace(/\[MENU_GROUP_PUBLIC(?::\d+)?\]/g, '')
          .replace(/\[MENU_GROUP_PARTY\]/g, '')
          .replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '')
          .trim();
        if (cleaned) pushText(cleaned);
      }
      found = true;
      break;
    }
  }

  // Check quick-reply markers
  if (!found) {
    for (const md of markerDefs) {
      const match = remaining.match(md.pattern);
      if (match) {
        const textBefore = remaining.substring(0, match.index).trim();
        const textAfter = remaining.substring(match.index + match[0].length).trim();

        if (md.textReplace) {
          if (textBefore) pushText(textBefore);
          pushText(md.textReplace);
        } else if (md.qr) {
          const promptText = textBefore || md.fallback;
          pushText(promptText, md.qr());
        }

        if (textAfter) {
          // FR-3.1: Strip any remaining markers
          const cleaned = textAfter.replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '').trim();
          if (cleaned) pushText(cleaned);
        }
        found = true;
        break;
      }
    }
  }

  // No markers — plain text
  if (!found) {
    pushText(remaining);
  }
}

// Fallback
if (messages.length === 0) {
  pushText('Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite: +370 648 803 88');
}

return [{ json: { messages } }];
