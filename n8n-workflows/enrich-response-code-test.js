// Browser-testable wrapper for enrich-response-code.js
function enrichResponse(response) {
if (!response || !response.trim()) return 'Atsiprašome, šiuo metu negaliu atsakyti.';
if (response.startsWith('{{HTML}}')) return response;

// --- Equipment data (categorized by use-case groups) ---
const TRAMPOLINES = [
  // --- big-park (for public events only) ---
  { name: 'Džiumandži parkas', icon: '🌴', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', type: 'Nuotykių parkas · 14x16 m', capacity: 'Iki 40 vaikų', price: 'pagal užklausą', bg: '#fef9f0', min: 15, max: 40, cat: 'big-park' },
  { name: 'Fantazijų parkas', icon: '🏰', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', type: 'Batutų parkas · 14x14 m', capacity: 'Iki 30 vaikų', price: 'pagal užklausą', bg: '#f5f0ff', min: 10, max: 30, cat: 'big-park' },
  { name: 'Giga ruožas', icon: '🏃', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', type: 'Kliūčių trasa 40 m · 45x8 m', capacity: '360 dalyvių/val.', price: 'pagal užklausą', bg: '#f0f9ff', min: 10, max: 100, cat: 'big-park' },

  // --- mega-trampoline (for birthdays + public) ---
  { name: 'Mega Waikiki', icon: '🌊', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', type: 'Aukščiausias 8,5 m · 16x4 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#e0f7fa', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega Rocket', icon: '🚀', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', type: '2 dalių batutas · 14x5 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#fff0f0', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega Ufonautai', icon: '🛸', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', type: '2 dalių batutas · 14x5 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#ede7f6', min: 5, max: 15, cat: 'mega-trampoline' },
  { name: 'Mega ruožas', icon: '🏃', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', type: 'Kliūčių trasa 21 m · 25x6 m', capacity: '240 dalyvių/val.', price: 'pagal užklausą', bg: '#e8f5e9', min: 8, max: 100, cat: 'mega-trampoline' },

  // --- standard-trampoline (for birthdays) ---
  { name: 'Monstrai', icon: '👾', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', type: 'Su Dart žaidimu · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#fce4ec', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Candy Pop', icon: '🍭', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', type: 'Spalvingas · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#fdf0ff', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Aštuonkojis', icon: '🐙', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', type: 'Jūros tema · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#e0f2f1', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Chameleonas', icon: '🦎', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', type: 'Su čiuožykla · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#f0fff4', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Vienaragiai', icon: '🦄', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', type: 'Su tuneliais · 9x4 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#f3e5f5', min: 4, max: 12, cat: 'standard-trampoline' },
  { name: 'Pilis mažiesiems', icon: '🏯', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', type: 'Iki 5 metų · 5x4 m', capacity: 'Iki 6 vaikų', price: 'pagal užklausą', bg: '#fff8e1', min: 2, max: 6, cat: 'standard-trampoline' },

  // --- addon (extras for any event) ---
  { name: 'Milžiniškas Dart', icon: '🎯', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', type: 'Interaktyvi pramoga · 5x4,5 m', capacity: '60 dalyvių/val.', price: 'pagal užklausą', bg: '#fffff0', min: 1, max: 999, cat: 'addon' },
  { name: 'Kamuolių medžioklė', icon: '⚽', img: '', type: 'Komandinis žaidimas · 8 m arena', capacity: '4 žaidėjai/raundas', price: 'pagal užklausą', bg: '#f0f9ff', min: 1, max: 999, cat: 'addon' },
  { name: 'Rodeo bulius', icon: '🤠', img: '', type: 'Mechaninis bulius · 5x5 m', capacity: 'Neribota', price: 'pagal užklausą', bg: '#fff3e0', min: 1, max: 999, cat: 'addon' },
  { name: 'Saldėsių aparatai', icon: '🍬', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: '1 NEMOKAMAI su batutu', capacity: 'Vata, popcorn, šerbetas', price: 'pagal užklausą', bg: '#fff5f0', min: 1, max: 999, cat: 'addon' },

  // --- party-equipment (party group only) ---
  { name: 'Disco paviljonas', icon: '🪩', img: '', type: 'LED apšvietimas · 4x4 m', capacity: 'Iki 20 žmonių', price: 'pagal užklausą', bg: '#f5f0ff', min: 1, max: 999, cat: 'party-equipment' },
  { name: 'Putų šou', icon: '🫧', img: '', type: 'Putų mašina + baseinas', capacity: 'Neribota', price: 'pagal užklausą', bg: '#e0f7fa', min: 1, max: 999, cat: 'party-equipment' },
  { name: 'Banketo stalai ir kėdės', icon: '🪑', img: '', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', price: 'pagal užklausą', bg: '#fff8e1', min: 1, max: 999, cat: 'party-equipment' }
];

// --- Render trampoline/equipment cards ---
function buildTrampolineCards(items, highlight) {
  let html = '<div class="chat-trampoline-grid">';
  for (const t of items) {
    const thumb = t.img
      ? '<img src="' + t.img + '" alt="' + t.name + '">'
      : t.icon;
    const border = highlight ? ';border:2px solid #4a6cf7' : '';
    html += '<div class="chat-trampoline-select" role="button" tabindex="0" data-chat-option="' + t.name + '" style="background:' + t.bg + border + '">';
    html += '<div class="chat-trampoline-thumb">' + thumb + '</div>';
    html += '<div class="chat-trampoline-info">';
    html += '<div class="t-name">' + t.name + '</div>';
    html += '<div class="t-meta">' + t.type + ' · ' + t.capacity + '</div>';
    html += '<div class="t-price">' + t.price + '</div>';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

// --- Group 1: Birthday equipment (standard + mega only, no big parks) ---
function buildGroupBirthdayEquipment(guestCount) {
  const standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
  const mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  const addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });
  const all = standard.concat(mega);

  let html = '';

  if (guestCount) {
    var recommended = all.filter(function(t) { return t.min <= guestCount && guestCount <= t.max; });
    var others = all.filter(function(t) { return !(t.min <= guestCount && guestCount <= t.max); });

    if (recommended.length > 0) {
      html += '<div style="font-size:14px;font-weight:600;color:#4a6cf7;margin-bottom:8px;padding:0 4px">Rekomenduojami jūsų šventei:</div>';
      html += buildTrampolineCards(recommended, true);
    }
    if (others.length > 0) {
      html += '<div style="font-size:13px;color:#888;margin:12px 0 8px;padding:0 4px">Kiti batutai:</div>';
      html += buildTrampolineCards(others, false);
    }
  } else {
    html += buildTrampolineCards(all, false);
  }

  if (addons.length > 0) {
    html += '<div style="font-size:13px;color:#888;margin:12px 0 8px;padding:0 4px">Papildomos pramogos:</div>';
    html += buildTrampolineCards(addons, false);
  }

  return html;
}

// --- Group 2: Public event equipment (ALL trampolines, biggest first) ---
function buildGroupPublicEquipment(guestCount) {
  const bigParks = TRAMPOLINES.filter(function(t) { return t.cat === 'big-park'; });
  const mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  const standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
  const addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });
  const all = bigParks.concat(mega).concat(standard);

  let html = '';

  if (guestCount) {
    var recommended = all.filter(function(t) { return t.min <= guestCount && guestCount <= t.max; });
    var others = all.filter(function(t) { return !(t.min <= guestCount && guestCount <= t.max); });

    if (recommended.length > 0) {
      html += '<div style="font-size:14px;font-weight:600;color:#4a6cf7;margin-bottom:8px;padding:0 4px">Rekomenduojami jūsų renginiui:</div>';
      html += buildTrampolineCards(recommended, true);
    }
    if (others.length > 0) {
      html += '<div style="font-size:13px;color:#888;margin:12px 0 8px;padding:0 4px">Kiti batutai:</div>';
      html += buildTrampolineCards(others, false);
    }
  } else {
    html += buildTrampolineCards(all, false);
  }

  if (addons.length > 0) {
    html += '<div style="font-size:13px;color:#888;margin:12px 0 8px;padding:0 4px">Papildomos pramogos:</div>';
    html += buildTrampolineCards(addons, false);
  }

  return html;
}

// --- Group 3: Party equipment only ---
function buildGroupPartyEquipment() {
  const party = TRAMPOLINES.filter(function(t) { return t.cat === 'party-equipment'; });
  let html = '<div style="font-size:14px;font-weight:600;color:#4a6cf7;margin-bottom:8px;padding:0 4px">Vakarėlio įranga:</div>';
  html += buildTrampolineCards(party, false);
  return html;
}

// --- Group 4: Purchase submenu ---
function buildPurchaseSubmenu() {
  let html = '<div class="chat-options">';
  html += '<button class="chat-option-btn" data-chat-option="Noriu gauti batutų katalogą el. paštu">📧 Gauti katalogą el. paštu</button>';
  html += '<button class="chat-option-btn" data-chat-option="Noriu individualios batuto gamybos">🎨 Individuali gamyba</button>';
  html += '</div>';
  return html;
}

// --- Group 4: Email input for catalog ---
function buildPurchaseEmailInput() {
  let html = '<div class="chat-email-form">';
  html += '<p style="font-size:13px;margin-bottom:8px">Įveskite savo el. pašto adresą ir atsiųsime batutų katalogą:</p>';
  html += '<input type="email" class="chat-email-input" data-chat-email placeholder="jusu@pastas.lt">';
  html += '<button class="chat-email-confirm" data-chat-email-confirm disabled>Siųsti katalogą</button>';
  html += '</div>';
  return html;
}

// --- Group 4: Custom manufacturing form ---
function buildPurchaseCustomForm() {
  let html = '<div class="chat-custom-form">';
  html += '<p style="font-size:13px;font-weight:600;margin-bottom:10px">Individualaus batuto užklausa:</p>';
  html += '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px">Pageidaujami matmenys (plotis x ilgis x aukštis):</label>';
  html += '<input type="text" class="chat-custom-input" data-custom-field="dimensions" placeholder="pvz. 8x5x4 m">';
  html += '<label style="font-size:12px;color:#555;display:block;margin:8px 0 4px">Spalvos:</label>';
  html += '<input type="text" class="chat-custom-input" data-custom-field="colors" placeholder="pvz. mėlyna, raudona, geltona">';
  html += '<label style="font-size:12px;color:#555;display:block;margin:8px 0 4px">Personažai / tema:</label>';
  html += '<input type="text" class="chat-custom-input" data-custom-field="characters" placeholder="pvz. Spiderman, dinozaurai">';
  html += '<label style="font-size:12px;color:#555;display:block;margin:8px 0 4px">Papildomi pageidavimai / eskizas:</label>';
  html += '<textarea class="chat-custom-textarea" data-custom-field="notes" placeholder="Aprašykite savo viziją..." rows="3"></textarea>';
  html += '<label style="font-size:12px;color:#555;display:block;margin:8px 0 4px">Kontaktinis el. paštas:</label>';
  html += '<input type="email" class="chat-custom-input" data-custom-field="email" placeholder="jusu@pastas.lt">';
  html += '<label style="font-size:12px;color:#555;display:block;margin:8px 0 4px">Telefono numeris:</label>';
  html += '<input type="text" class="chat-custom-input" data-custom-field="phone" placeholder="+370 600 00000">';
  html += '<button class="chat-custom-submit" data-chat-custom-submit>Pateikti užklausą</button>';
  html += '</div>';
  return html;
}

function buildDatePicker() {
  const days = [];
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  for (let i = 0; i < 4; i++) {
    const iso = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' });
    days.push('<button class="chat-option-btn" data-chat-option="' + iso + '">' + label + '</button>');
    d.setDate(d.getDate() + 7);
  }
  let html = '<div class="chat-options">' + days.join('') + '</div>';
  html += '<input type="date" class="chat-date-input" data-chat-date min="' + now.toISOString().split('T')[0] + '" placeholder="Kita data...">';
  html += '<button class="chat-date-confirm" data-chat-date-confirm disabled>Patvirtinti datą</button>';
  return html;
}

function buildLocationOptions() {
  const locs = ['Tauragė', 'Šilalė', 'Jurbarkas', 'Pagėgiai', 'Raseiniai', 'Kelmė', 'Rietavas', 'Kitas miestas'];
  let html = '<div class="chat-options">';
  for (const loc of locs) {
    html += '<button class="chat-option-btn" data-chat-option="' + loc + '">' + loc + '</button>';
  }
  html += '</div>';
  return html;
}

function buildGuestCountOptions() {
  const ranges = [
    { label: 'Iki 6 vaikų', value: 'Apie 6 svečių' },
    { label: '7–12 vaikų', value: 'Apie 10 svečių' },
    { label: '13–20 vaikų', value: 'Apie 15 svečių' },
    { label: 'Daugiau nei 20', value: 'Apie 30 svečių' }
  ];
  let html = '<div class="chat-options" data-step="guest-count">';
  for (const r of ranges) {
    html += '<button class="chat-option-btn" data-chat-option="' + r.value + '">' + r.label + '</button>';
  }
  html += '</div>';
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBookingConfirm(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { data = {}; }
  let html = '<div class="booking-confirm">';
  html += '<h4>✅ Užklausa pateikta!</h4>';
  if (data.group_type) html += '<p><strong>Tipas:</strong> ' + escapeHtml(data.group_type) + '</p>';
  if (data.date) html += '<p><strong>Data:</strong> ' + escapeHtml(data.date) + '</p>';
  if (data.location) html += '<p><strong>Vieta:</strong> ' + escapeHtml(data.location) + '</p>';
  if (data.event_type) html += '<p><strong>Renginys:</strong> ' + escapeHtml(data.event_type) + '</p>';
  if (data.guest_count) html += '<p><strong>Svečių:</strong> ' + escapeHtml(data.guest_count) + '</p>';
  if (data.contact_name) html += '<p><strong>Kontaktas:</strong> ' + escapeHtml(data.contact_name) + '</p>';
  if (data.contact_phone) html += '<p><strong>Telefonas:</strong> ' + escapeHtml(data.contact_phone) + '</p>';
  if (data.trampoline) html += '<p><strong>Batutas:</strong> ' + escapeHtml(data.trampoline) + '</p>';
  if (data.dimensions) html += '<p><strong>Matmenys:</strong> ' + escapeHtml(data.dimensions) + '</p>';
  if (data.colors) html += '<p><strong>Spalvos:</strong> ' + escapeHtml(data.colors) + '</p>';
  if (data.characters) html += '<p><strong>Personažai:</strong> ' + escapeHtml(data.characters) + '</p>';
  if (data.email) html += '<p><strong>El. paštas:</strong> ' + escapeHtml(data.email) + '</p>';
  html += '</div>';
  return html;
}

// --- Booking progress bar ---
function buildProgressBar(currentStep, totalSteps) {
  const total = totalSteps || 4;
  let html = '<div class="booking-progress">';
  for (let i = 1; i <= total; i++) {
    const cls = i < currentStep ? 'done' : (i === currentStep ? 'current' : '');
    html += '<div class="bp-step' + (cls ? ' ' + cls : '') + '"></div>';
  }
  html += '</div>';
  return html;
}

// --- Main menu (5 use-case groups) ---
function buildMainMenu() {
  const items = [
    { label: '🎂 Vaikų gimtadienis ar krikštynos', value: 'Planuoju vaikų gimtadienį arba krikštynas' },
    { label: '🎪 Viešas renginys ar įmonės sąskrydis', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
    { label: '🎉 Triukšmingas vakarėlis', value: 'Planuoju triukšmingą vakarėlį' },
    { label: '🛒 Noriu pirkti batutą', value: 'Noriu pirkti batutą' },
    { label: 'ℹ️ Saugumas, DUK ir kontaktai', value: 'Saugumas, DUK ir kontaktai' }
  ];
  let html = '<div class="chat-main-menu"><div class="chat-options chat-menu-options">';
  for (const item of items) {
    html += '<button class="chat-option-btn chat-menu-btn" data-chat-option="' + item.value + '">' + item.label + '</button>';
  }
  html += '</div></div>';
  return html;
}

// --- Suggestion chips (contextual quick replies) ---
function buildQuickReplies(buttons) {
  if (!buttons || !buttons.length) return '';
  let html = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06);display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
  for (const btn of buttons) {
    const label = typeof btn === 'string' ? btn : btn.label;
    const value = typeof btn === 'string' ? btn : (btn.value || btn.label);
    const isMenu = value === 'Pagrindinis meniu';
    const style = isMenu
      ? 'font-size:13px;padding:6px 14px;background:transparent;color:#888;border:1px solid #ddd;border-radius:16px;cursor:pointer'
      : 'font-size:13px;padding:6px 14px;background:#f0f4ff;color:#4a6cf7;border:1px solid #d0d8f0;border-radius:16px;cursor:pointer';
    html += '<button class="chat-option-btn" data-chat-option="' + value + '" style="' + style + '">' + label + '</button>';
  }
  html += '</div>';
  return html;
}

// --- Check for markers and replace ---
const markers = [
  { pattern: /\[DATE_PICKER\]/g, fn: () => buildProgressBar(1) + buildDatePicker() },
  { pattern: /\[LOCATION_OPTIONS\]/g, fn: () => buildProgressBar(2) + buildLocationOptions() },
  { pattern: /\[GUEST_COUNT\]/g, fn: () => buildProgressBar(3) + buildGuestCountOptions() },
  { pattern: /\[MAIN_MENU\]/g, fn: () => buildMainMenu() },
  { pattern: /\[PURCHASE_SUBMENU\]/g, fn: () => buildPurchaseSubmenu() },
  { pattern: /\[PURCHASE_EMAIL_INPUT\]/g, fn: () => buildPurchaseEmailInput() },
  { pattern: /\[PURCHASE_CUSTOM_FORM\]/g, fn: () => buildPurchaseCustomForm() }
];

let hasMarker = false;
let enriched = response;

for (const m of markers) {
  const before = enriched;
  enriched = enriched.replace(m.pattern, m.fn);
  if (enriched !== before) hasMarker = true;
}

// Handle MENU_GROUP_BIRTHDAY with guest count
const birthdayBefore = enriched;
enriched = enriched.replace(/\[MENU_GROUP_BIRTHDAY(?::(\d+))?\]/g, function(match, countStr) {
  const count = countStr ? parseInt(countStr) : null;
  return buildProgressBar(4, 4) + buildGroupBirthdayEquipment(count);
});
if (enriched !== birthdayBefore) hasMarker = true;

// Handle MENU_GROUP_PUBLIC with guest count
const publicBefore = enriched;
enriched = enriched.replace(/\[MENU_GROUP_PUBLIC(?::(\d+))?\]/g, function(match, countStr) {
  const count = countStr ? parseInt(countStr) : null;
  return buildProgressBar(4, 4) + buildGroupPublicEquipment(count);
});
if (enriched !== publicBefore) hasMarker = true;

// Handle MENU_GROUP_PARTY
const partyBefore = enriched;
enriched = enriched.replace(/\[MENU_GROUP_PARTY\]/g, function() {
  return buildProgressBar(4, 4) + buildGroupPartyEquipment();
});
if (enriched !== partyBefore) hasMarker = true;

// Handle BOOKING_CONFIRM separately (has capture group)
const confirmBefore = enriched;
enriched = enriched.replace(/\[BOOKING_CONFIRM:(\{[^\]]*\})\]/g, function(match, jsonStr) {
  return buildBookingConfirm(jsonStr);
});
if (enriched !== confirmBefore) hasMarker = true;

// --- Contextual quick replies (always appended) ---
const hadCatalog = enriched.includes('chat-trampoline-grid');
const hadDatePicker = enriched.includes('chat-date-input');
const hadLocationBtns = enriched.includes('data-chat-option="Tauragė"');
const hadGuestCount = enriched.includes('data-step="guest-count"');
const hadBookingConfirm = enriched.includes('booking-confirm');
const hadMainMenu = enriched.includes('chat-main-menu');
const hadPurchaseSubmenu = enriched.includes('Noriu gauti batutų katalogą');
const hadEmailInput = enriched.includes('chat-email-form');
const hadCustomForm = enriched.includes('chat-custom-form');
const isBookingStep = hadDatePicker || hadLocationBtns || hadGuestCount;

let quickReplies = [];

if (hadBookingConfirm) {
  quickReplies = [
    { label: 'Užsakyti dar vieną', value: 'Noriu užsakyti dar vieną batutą' },
    { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }
  ];
} else if (hadCatalog) {
  quickReplies = [
    { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }
  ];
} else if (hadEmailInput || hadCustomForm || hadPurchaseSubmenu) {
  quickReplies = [
    { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }
  ];
} else if (isBookingStep) {
  quickReplies = [
    { label: 'Atšaukti', value: 'Pagrindinis meniu' }
  ];
} else if (hadMainMenu) {
  quickReplies = [];
} else {
  quickReplies = [
    { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }
  ];
}

const quickHtml = buildQuickReplies(quickReplies);

// Convert to HTML if we have markers or quick replies
if (hasMarker || quickHtml) {
  enriched = enriched.replace(/\\n/g, '\n');
  enriched = enriched.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  enriched = enriched.replace(/\n/g, '<br>');
  enriched = '{{HTML}}<div class="chat-products">' + enriched + quickHtml + '</div>';
}

return enriched;
}
