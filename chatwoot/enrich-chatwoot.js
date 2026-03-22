// Chatwoot Enrichment Engine v2
// Converts AI marker-based responses into Chatwoot message objects
// Features: progressive disclosure, clean cards, no-image fallback,
//   contextual quick replies, typing indicator, warm conversational tone

var agentOutput = $input.first().json || {};
var response = agentOutput.output || agentOutput.text || '';
var isMessenger = $('Filter & Extract').item.json.isMessenger || false;
var conversationId = $('Filter & Extract').item.json.conversationId;

if (!conversationId) {
  return [{ json: { _skip: true, _error: 'No conversationId — cannot send messages' } }];
}

// Use n8n workflow variable — set CHATWOOT_BASE_URL in Settings → Variables
// Fallback to hardcoded URL if variable not set (for backwards compatibility)
var chatwootBase = (typeof $vars !== 'undefined' && $vars.CHATWOOT_BASE_URL) ? $vars.CHATWOOT_BASE_URL : 'https://batutynas-chatwoot-chatwoot.0uvai5.easypanel.host/api/v1/accounts/1';

// Telegram notification — same bot + owner as booking-notify-workflow
var TELEGRAM_BOT_URL = 'https://api.telegram.org/bot__TELEGRAM_BOT_TOKEN__/sendMessage';
var TELEGRAM_OWNER_CHAT = '8258463322';

function formatOutput(msgs, extraItems) {
  var url = chatwootBase + '/conversations/' + conversationId + '/messages';
  var typingUrl = chatwootBase + '/conversations/' + conversationId + '/toggle_typing_status';
  var result = [];

  // Typing indicator before card/form bursts — makes bot feel like it's "looking things up"
  var hasHeavyContent = msgs.some(function(m) {
    return m.content_type === 'cards' || m.content_type === 'form';
  });

  if (hasHeavyContent) {
    result.push({ json: {
      _url: typingUrl,
      _body: JSON.stringify({ typing_status: 'on' })
    }});
  }

  var filtered = msgs.filter(function(m) { return m.content_type !== '_image'; });

  for (var i = 0; i < filtered.length; i++) {
    var m = filtered[i];
    result.push({ json: {
      _url: url,
      _body: JSON.stringify({
        content: m.content,
        content_type: m.content_type,
        message_type: m.message_type || 'outgoing',
        content_attributes: m.content_attributes || {}
      })
    }});
  }

  // Turn off typing indicator after sending all messages
  if (hasHeavyContent) {
    result.push({ json: {
      _url: typingUrl,
      _body: JSON.stringify({ typing_status: 'off' })
    }});
  }

  // Append extra items (e.g. Telegram notifications) — bypass normal message formatting
  if (extraItems && extraItems.length) {
    for (var ei = 0; ei < extraItems.length; ei++) {
      result.push({ json: extraItems[ei] });
    }
  }

  return result;
}

if (!response || !response.trim()) {
  return formatOutput([{
    content: 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt',
    content_type: 'text',
    message_type: 'outgoing'
  }]);
}

// Fix #4 helper: local-timezone date formatting (avoids UTC midnight rollover bug)
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// --- Equipment data ---
var TRAMPOLINES = [
  // --- big-park (for public events only) ---
  { name: 'Džiumandži parkas', icon: '\u{1F334}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', type: 'Nuotykių parkas \u00b7 14x16 m', capacity: 'Iki 40 vaikų', bg: '#fef9f0', min: 15, max: 200, cat: 'big-park', popular: true, shortDesc: 'Iki 40 vaikų \u00b7 nuo 4 m.' },
  { name: 'Fantazijų parkas', icon: '\u{1F3F0}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', type: 'Batutų parkas \u00b7 14x14 m', capacity: 'Iki 30 vaikų', bg: '#f5f0ff', min: 10, max: 150, cat: 'big-park', shortDesc: 'Iki 30 vaikų \u00b7 nuo 4 m.' },
  { name: 'Giga ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', type: 'Kliūčių trasa 40 m \u00b7 45x8 m', capacity: '360 dalyvių/val.', bg: '#f0f9ff', min: 10, max: 1000, cat: 'big-park', popular: true, shortDesc: '360 dalyvių/val. \u00b7 6+ m.' },

  // --- mega-trampoline (for birthdays + public) ---
  { name: 'Mega Waikiki', icon: '\u{1F30A}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', type: 'Aukščiausias 8,5 m \u00b7 16x4 m', capacity: 'Iki 15 vaikų', bg: '#e0f7fa', min: 5, max: 15, cat: 'mega-trampoline', popular: true, shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega Rocket', icon: '\u{1F680}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#fff0f0', min: 5, max: 15, cat: 'mega-trampoline', shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega Ufonautai', icon: '\u{1F6F8}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#ede7f6', min: 5, max: 15, cat: 'mega-trampoline', shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', type: 'Kliūčių trasa 21 m \u00b7 25x6 m', capacity: '240 dalyvių/val.', bg: '#e8f5e9', min: 8, max: 600, cat: 'mega-trampoline', shortDesc: '240 dalyvių/val. \u00b7 6+ m.' },

  // --- standard-trampoline (for birthdays) ---
  { name: 'Monstrai', icon: '\u{1F47E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', type: 'Su Dart žaidimu \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fce4ec', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Candy Pop', icon: '\u{1F36D}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', type: 'Spalvingas \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fdf0ff', min: 4, max: 12, cat: 'standard-trampoline', popular: true, shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Aštuonkojis', icon: '\u{1F419}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', type: 'Jūros tema \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#e0f2f1', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Chameleonas', icon: '\u{1F98E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', type: 'Su čiuožykla \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#f0fff4', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Vienaragiai', icon: '\u{1F984}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', type: 'Su tuneliais \u00b7 9x4 m', capacity: 'Iki 12 vaikų', bg: '#f3e5f5', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Pilis mažiesiems', icon: '\u{1F3EF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', type: 'Iki 5 metų \u00b7 5x4 m', capacity: 'Iki 6 vaikų', bg: '#fff8e1', min: 2, max: 6, cat: 'standard-trampoline', shortDesc: 'Iki 6 vaikų \u00b7 2\u20135 m.' },

  // --- addon (extras for any event) ---
  { name: 'Milžiniškas Dart', icon: '\u{1F3AF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', type: 'Interaktyvi pramoga \u00b7 5x4,5 m', capacity: '60 dalyvių/val.', bg: '#fffff0', min: 1, max: 999, cat: 'addon', shortDesc: '60 dalyvių/val. \u00b7 Papildomas mokestis' },
  { name: 'Kamuolių medžioklė', icon: '\u26BD', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250908-wa0000-OjvumGsbJUPEqY7H.jpg', type: 'Komandinis žaidimas \u00b7 8 m arena', capacity: '4 žaidėjai/raundas', bg: '#f0f9ff', min: 1, max: 999, cat: 'addon', shortDesc: '4 žaidėjai/raundas \u00b7 Papildomas mokestis' },
  { name: 'Rodeo bulius', icon: '\u{1F920}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_y02vw0y02vw0y02v-1UPI9AO2yIhGQbUk.png', type: 'Mechaninis bulius \u00b7 5x5 m', capacity: 'Neribota', bg: '#fff3e0', min: 1, max: 999, cat: 'addon', shortDesc: 'Neribota dalyvių \u00b7 Papildomas mokestis' },
  { name: 'Saldėsių aparatai', icon: '\u{1F36C}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_n0wezbn0wezbn0we-eBEHQuTVAV3qYVji.png', type: '1 NEMOKAMAI su batutu', capacity: 'Vata, popcorn, šerbetas', bg: '#fff5f0', min: 1, max: 999, cat: 'addon', shortDesc: '1 NEMOKAMAI su batutu' },

  // --- party-equipment (party group only) ---
  { name: 'Disco paviljonas', icon: '\u{1FAA9}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: 'LED apšvietimas \u00b7 4x4 m', capacity: 'Iki 20 žmonių', bg: '#f5f0ff', min: 1, max: 999, cat: 'party-equipment', popular: true, shortDesc: 'Iki 20 žmonių \u00b7 Nemokama' },
  { name: 'Putų šou', icon: '\u{1FAE7}', img: '', type: 'Putų mašina + baseinas', capacity: 'Neribota', bg: '#e0f7fa', min: 1, max: 999, cat: 'party-equipment', shortDesc: 'Neribota dalyvių \u00b7 Nemokama' },
  { name: 'Banketo stalai ir kėdės', messengerName: 'Stalai ir kėdės', icon: '\u{1FA91}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_lmbogflmbogflmbo-yW8t5tAPn0eG8rIQ.png', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', bg: '#fff8e1', min: 1, max: 999, cat: 'party-equipment', shortDesc: 'Iki 50 vietų \u00b7 Papildomas mokestis' }
];

// --- Build trampoline cards for Chatwoot (works on web widget + Messenger via Generic Template) ---
// Items without images → input_select fallback (no broken card placeholders)
function buildTrampolineCards(items, buttonText) {
  var btn = buttonText || '\u2713 Noriu šio';
  var withImg = [];
  var noImg = [];
  items.forEach(function(t) {
    if (t.img) { withImg.push(t); } else { noImg.push(t); }
  });

  var cards = withImg.map(function(t) {
    var pop = t.popular ? ' \u{1F525}' : '';
    return {
      media_url: t.img,
      title: t.icon + ' ' + t.name + pop,
      description: t.shortDesc || (t.capacity),
      actions: [{ type: 'postback', text: btn, payload: t.name }]
    };
  });

  return { cards: cards, noImgItems: noImg };
}

// --- Build input_select items from trampoline list ---
function buildTrampolineSelectItems(items) {
  return items.map(function(t) {
    var name = (isMessenger && t.messengerName) ? t.messengerName : t.name;
    var title = t.icon + ' ' + name;
    if (t.popular && (title.length + 3) <= 20) title += ' \u{1F525}';
    return { title: title, value: t.name };
  });
}

// --- Group builders: return array of Chatwoot messages ---

function buildGroupEquipment(items, headerText, guestCount, btnText) {
  var messages = [];
  var recommended = [];
  var others = [];

  if (guestCount) {
    recommended = items.filter(function(t) { return t.min <= guestCount && guestCount <= t.max; });
    others = items.filter(function(t) { return !(t.min <= guestCount && guestCount <= t.max); });
  } else {
    recommended = items;
  }

  if (guestCount && recommended.length === 0 && others.length > 0) {
    var sorted = others.slice().sort(function(a, b) { return b.max - a.max; });
    recommended = sorted.slice(0, 3);
    others = sorted.slice(3);
    headerText = '\u{1F3AA} Dideliam renginiui geriausiai tinka';
  }

  // Cards work on both web widget and Messenger (Chatwoot translates to Generic Template)
  // Messenger Generic Templates max 10 elements — overflow to dropdown
  if (recommended.length > 0) {
    var result = buildTrampolineCards(recommended, btnText || '\u2713 Noriu šio');
    var cardItems = result.cards;
    var overflowCards = [];
    if (isMessenger && cardItems.length > 10) {
      overflowCards = cardItems.slice(10);
      cardItems = cardItems.slice(0, 10);
    }
    if (cardItems.length > 0) {
      messages.push({
        content: headerText + ':',
        content_type: 'cards',
        content_attributes: { items: cardItems },
        message_type: 'outgoing'
      });
    }
    // Convert overflow cards to select items
    var overflowSelectItems = overflowCards.map(function(c) {
      var t = c.title;
      return { title: t.length > 20 ? t.substring(0, 19) + '\u2026' : t, value: c.actions[0].payload };
    });
    // Merge no-image recommended items + others + overflow into one dropdown
    var extraItems = buildTrampolineSelectItems(result.noImgItems.concat(others)).concat(overflowSelectItems);
    if (extraItems.length > 0) {
      messages.push({
        content: result.noImgItems.length > 0 ? 'Ir dar:' : 'Turime ir daugiau:',
        content_type: 'input_select',
        content_attributes: { items: extraItems },
        message_type: 'outgoing'
      });
    }
  } else if (others.length > 0) {
    // No recommended — show all as dropdown
    messages.push({
      content: headerText + ':',
      content_type: 'input_select',
      content_attributes: { items: buildTrampolineSelectItems(others) },
      message_type: 'outgoing'
    });
  }

  return messages;
}

function buildGroupBirthdayEquipment(guestCount) {
  var standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
  var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  var all = standard.concat(mega);
  // Fix #6: for very large groups, suggest the public event package instead
  var header = '\u{1F382} Rekomenduojami jūsų šventei';
  if (guestCount && guestCount > 15) {
    header = '\u{1F382} Didelei šventei — galbūt norėtumėte apsvarstyti viešo renginio paketą?';
  }
  var msgs = buildGroupEquipment(all, header, guestCount);
  // M-4: Add a CTA button for large birthday groups to switch to public event flow
  if (guestCount && guestCount > 15) {
    // Messenger quick reply titles are capped at 20 chars
    var ctaItems = isMessenger ? [
      { title: '\u{1F3AA} Viešas renginys', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
      { title: '\u27A1\uFE0F Tęsti gimtadienį', value: 'Tęsti gimtadienio užsakymą' }
    ] : [
      { title: '\u{1F3AA} Viešo renginio paketas', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
      { title: '\u27A1\uFE0F Tęsti su gimtadieniu', value: 'Tęsti gimtadienio užsakymą' }
    ];
    msgs.push({
      content: '',
      content_type: 'input_select',
      content_attributes: { items: ctaItems },
      message_type: 'outgoing'
    });
  }
  return msgs;
}

function buildGroupPublicEquipment(guestCount) {
  var bigParks = TRAMPOLINES.filter(function(t) { return t.cat === 'big-park'; });
  var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  var all = bigParks.concat(mega);
  var messages = [];
  if (guestCount && guestCount > 100) {
    messages.push({
      content: 'Dideliam renginiui rekomenduojame derinti kelias atrakcijas \u2014 m\u016bs\u0173 komanda pad\u0117s sud\u0117lioti geriausią derin\u012f! Pasirinkite vieną ar keletą:',
      content_type: 'text',
      message_type: 'outgoing'
    });
  }
  var equipmentMsgs = buildGroupEquipment(all, '\u{1F3AA} Rekomenduojami j\u016bs\u0173 renginiui', guestCount);
  messages.push.apply(messages, equipmentMsgs);
  return messages;
}

function buildGroupPartyEquipment() {
  var party = TRAMPOLINES.filter(function(t) { return t.cat === 'party-equipment'; });

  // Cards work on both web widget and Messenger
  var result = buildTrampolineCards(party, '\u2713 Noriu');
  var messages = [];
  if (result.cards.length > 0) {
    messages.push({
      content: '\u{1F389} Vakarėlio įranga:',
      content_type: 'cards',
      content_attributes: { items: result.cards },
      message_type: 'outgoing'
    });
  }
  if (result.noImgItems.length > 0) {
    var selectItems = result.noImgItems.map(function(t) {
      var pop = t.popular ? ' \u{1F525}' : '';
      return { title: t.icon + ' ' + t.name + pop + ' \u2014 ' + (t.shortDesc || t.capacity), value: t.name };
    });
    messages.push({
      content: result.cards.length > 0 ? 'Taip pat turime:' : '\u{1F389} Vakarėlio įranga:',
      content_type: 'input_select',
      content_attributes: { items: selectItems },
      message_type: 'outgoing'
    });
  }
  return messages;
}

// --- Main Menu ---
function buildMainMenu() {
  // Fix #5: Messenger quick-reply titles are capped at 20 chars — use shorter titles there
  var items;
  if (isMessenger) {
    items = [
      { title: '\u{1F382} Gimtadienis', value: 'Planuoju vaikų gimtadienį arba krikštynas' },
      { title: '\u{1F3AA} Viešas renginys', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
      { title: '\u{1F389} Vakarėlis', value: 'Planuoju triukšmingą vakarėlį' },
      { title: '\u{1F6D2} Pirkti batutą', value: 'Noriu pirkti batutą' },
      { title: '\u2139\uFE0F DUK / Kontaktai', value: 'Saugumas, DUK ir kontaktai' },
      { title: '\u{1F4DE} Susisiekti', value: 'Noriu susisiekti su \u017emogumi' }
    ];
  } else {
    items = [
      { title: '\u{1F382} Vaikų gimtadienis ar krikštynos', value: 'Planuoju vaikų gimtadienį arba krikštynas' },
      { title: '\u{1F3AA} Viešas renginys ar įmonės sąskrydis', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
      { title: '\u{1F389} Triukšmingas vakarėlis', value: 'Planuoju triukšmingą vakarėlį' },
      { title: '\u{1F6D2} Noriu pirkti batutą', value: 'Noriu pirkti batutą' },
      { title: '\u2139\uFE0F Saugumas, DUK ir kontaktai', value: 'Saugumas, DUK ir kontaktai' }
    ];
  }
  return [{
    content: 'Kuo galiu padėti? \u{1F60A}',
    content_type: 'input_select',
    content_attributes: { items: items },
    message_type: 'outgoing'
  }];
}

// --- Date Picker ---
function buildDatePicker() {
  var dates = [];
  var d = new Date();
  // Find next Saturday
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  dates.push(new Date(d));
  // The Sunday right after
  var sun = new Date(d);
  sun.setDate(sun.getDate() + 1);
  dates.push(sun);
  // Next Saturday
  d.setDate(d.getDate() + 7);
  dates.push(new Date(d));
  // Next Sunday
  var sun2 = new Date(d);
  sun2.setDate(sun2.getDate() + 1);
  dates.push(sun2);

  var days = dates.map(function(dt) {
    // Use local date parts to avoid UTC midnight rollover (Lithuania is UTC+2/+3)
    var iso = dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
    var label = dt.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' });
    return { title: label, value: iso };
  });

  return [{
    content: 'Populiariausi laikai \u2014 savaitgaliai:\n(galite ir parašyti savo datą)',
    content_type: 'input_select',
    content_attributes: { items: days },
    message_type: 'outgoing'
  }];
}

// --- Guest Count ---
function buildGuestCountOptions() {
  return [{
    content: 'Kiek svečių planuojate? \u{1F465}',
    content_type: 'input_select',
    content_attributes: {
      items: [
        { title: 'Iki 6', value: 'Apie 6 vaikų' },
        { title: '7\u201312', value: 'Apie 10 vaikų' },
        { title: '13\u201320', value: 'Apie 15 vaikų' },
        { title: '21\u201350', value: 'Apie 35 vaikų' },
        { title: '50+', value: 'Daugiau nei 50 vaikų' }
      ]
    },
    message_type: 'outgoing'
  }];
}

// --- Guest Count (Public events — larger buckets) ---
function buildGuestCountOptionsPublic() {
  return [{
    content: 'Kiek dalyvių planuojate? \u{1F465}\u{1F465}',
    content_type: 'input_select',
    content_attributes: {
      items: [
        { title: '20\u201350',   value: 'Apie 35 svečių' },
        { title: '50\u2013100',  value: 'Apie 75 svečių' },
        { title: '100\u2013200', value: 'Apie 150 svečių' },
        { title: '200\u2013500', value: 'Apie 350 svečių' },
        { title: '500+',    value: 'Apie 700 svečių' }
      ]
    },
    message_type: 'outgoing'
  }];
}

// --- Addon Upsell ---
function buildAddonUpsell() {
  var addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });

  // Cards work on both web widget and Messenger
  var result = buildTrampolineCards(addons, '\u2713 Pridėti');
  var messages = [];

  if (result.cards.length > 0) {
    messages.push({
      content: '\u{1F381} Gal dar kažko pridėti?',
      content_type: 'cards',
      content_attributes: { items: result.cards },
      message_type: 'outgoing'
    });
  }

  // Only show no-image addons as select (don't duplicate what's already in cards)
  var skipItems = [];
  if (result.noImgItems.length > 0) {
    result.noImgItems.forEach(function(t) {
      skipItems.push({ title: t.icon + ' ' + t.name, value: t.name });
    });
  }
  skipItems.push({ title: '\u27A1\uFE0F Viskas, tęsime!', value: 'Tęsti be papildomų pramogų' });

  messages.push({
    content: result.noImgItems.length > 0 ? 'Taip pat turime:' : '',
    content_type: 'input_select',
    content_attributes: { items: skipItems },
    message_type: 'outgoing'
  });

  return messages;
}

// --- Purchase Submenu ---
function buildPurchaseSubmenu() {
  // Messenger quick reply titles are capped at 20 chars
  var items = isMessenger ? [
    { title: '\u{1F4E7} Gauti katalogą', value: 'Noriu gauti batutų katalogą el. paštu' },
    { title: '\u{1F3A8} Ind. gamyba', value: 'Noriu individualios batuto gamybos' }
  ] : [
    { title: '\u{1F4E7} Gauti katalogą', value: 'Noriu gauti batutų katalogą el. paštu' },
    { title: '\u{1F3A8} Individuali gamyba', value: 'Noriu individualios batuto gamybos' }
  ];
  return [{
    content: 'Ką norėtumėte?',
    content_type: 'input_select',
    content_attributes: { items: items },
    message_type: 'outgoing'
  }];
}

// --- Purchase Email Input ---
function buildPurchaseEmailInput() {
  if (isMessenger) {
    return [{ content: 'Įrašykite savo el. pašto adresą ir atsiųsime batutų katalogą:', content_type: 'text', message_type: 'outgoing' }];
  }
  return [{
    content: 'Įveskite savo el. pašto adresą:',
    content_type: 'form',
    content_attributes: {
      items: [
        { name: 'email', placeholder: 'jusu@pastas.lt', type: 'email', label: 'El. paštas' }
      ]
    },
    message_type: 'outgoing'
  }];
}

// --- Purchase Custom Form with setup text ---
function buildPurchaseCustomForm() {
  if (isMessenger) {
    return [{
      content: 'Individualaus batuto užklausa\n\nPrašau nurodyti:\n1. Pageidaujamus matmenis (pvz. 8x5x4 m)\n2. Spalvas\n3. Personažus / temą\n4. Pastabas (neprivaloma)\n5. Kontaktinį el. paštą\n6. Telefono numerį\n\nGalite parašyti visą informaciją vienu pranešimu.',
      content_type: 'text',
      message_type: 'outgoing'
    }];
  }
  return [
    {
      content: '\u{1F3A8} Puiku! Užpildykite trumpą formą ir mūsų dizaineriai susisieks per 24 val.',
      content_type: 'text',
      message_type: 'outgoing'
    },
    {
      content: 'Individualaus batuto užklausa:',
      content_type: 'form',
      content_attributes: {
        items: [
          { name: 'dimensions', placeholder: 'pvz. 8x5x4 m', type: 'text', label: 'Pageidaujami matmenys' },
          { name: 'colors', placeholder: 'pvz. mėlyna, raudona, geltona', type: 'text', label: 'Spalvos' },
          { name: 'characters', placeholder: 'pvz. Spiderman, dinozaurai', type: 'text', label: 'Personažai / tema' },
          { name: 'notes', placeholder: 'Papildoma informacija (neprivaloma)', type: 'text', label: 'Pastabos' },
          { name: 'email', placeholder: 'jusu@pastas.lt', type: 'email', label: 'Kontaktinis el. paštas' },
          { name: 'phone', placeholder: '+370 600 00000', type: 'text', label: 'Telefono numeris' }
        ]
      },
      message_type: 'outgoing'
    }
  ];
}

// --- Booking Confirm ---
function buildBookingConfirm(jsonStr) {
  var data;
  try { data = JSON.parse(jsonStr); } catch (e) { data = null; }

  // Fix #3: if JSON.parse failed or produced empty object, show a safe fallback
  if (!data || Object.keys(data).length === 0) {
    return [{
      content: '\u2705 Užklausa gauta!\n\nMūsų komanda susisieks su jumis per 2 darbo valandas.\n\u{1F4DE} +370 648 803 88\n\u{1F4E7} info@batutynas.lt',
      content_type: 'text',
      message_type: 'outgoing'
    }];
  }

  // H-2 guard: if contact info is missing, append a note so the team follows up
  var hasContact = data.contact_phone || data.email || data.contact_name;
  if (!hasContact) {
    data._missingContact = true;
  }

  // Fix #7: asterisks render as literal * on Messenger — use plain text there
  var text = isMessenger
    ? '\u2705 Užklausa pateikta!\n\n'
    : '\u2705 *Užklausa pateikta!*\n\n';

  // Event details
  if (data.date) text += '\u{1F4C5} ' + data.date + '\n';
  if (data.location) text += '\u{1F4CD} ' + data.location + '\n';
  if (data.address) text += '\u{1F3E0} ' + data.address + '\n';
  if (data.group_type || data.event_type) text += '\u{1F389} ' + (data.event_type || data.group_type) + '\n';
  if (data.guest_count) text += '\u{1F465} ' + data.guest_count + ' svečių\n';

  // Equipment
  if (data.trampolines) text += '\u{1F3AA} ' + data.trampolines + '\n';
  else if (data.trampoline) text += '\u{1F3AA} ' + data.trampoline + '\n';
  if (data.addons) text += '\u{1F381} ' + data.addons + '\n';

  // Custom order details
  if (data.dimensions) text += '\u{1F4D0} ' + data.dimensions + '\n';
  if (data.colors) text += '\u{1F3A8} ' + data.colors + '\n';
  if (data.characters) text += '\u2B50 ' + data.characters + '\n';

  // Contact
  text += '\n';
  if (data.contact_name) text += '\u{1F464} ' + data.contact_name + '\n';
  if (data.contact_phone) text += '\u{1F4DE} ' + data.contact_phone + '\n';
  if (data.email) text += '\u{1F4E7} ' + data.email + '\n';

  if (data._missingContact) {
    text += '\n⚠️ Kad galėtume susisiekti, prašome nurodyti savo vardą ir telefono numerį.\n';
  }

  // FR-6.1: Out-of-hours qualifier
  try {
    var now = new Date();
    var lt = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }));
    var dayOfWeek = lt.getDay();
    var hourOfDay = lt.getHours();
    if (hourOfDay < 8 || hourOfDay >= 21) {
      text += '\n\u23F0 U\u017eklausa bus apdorota artimiausiu metu (darbo laikas: 8:00\u201321:00 kasdien)';
    } else {
      text += '\nSusisieksime per 2 darbo valandas! \u{1F64F}';
    }
  } catch (e) {
    text += '\nSusisieksime per 2 darbo valandas! \u{1F64F}';
  }

  return [{ content: text, content_type: 'text', message_type: 'outgoing' }];
}

// --- Quick Replies (contextual header) ---
function buildQuickReplies(buttons, headerText) {
  if (!buttons || !buttons.length) return [];
  var header = headerText || (buttons.length > 1 ? 'Ką norėtumėte daryti toliau?' : '');
  return [{
    content: header,
    content_type: 'input_select',
    content_attributes: {
      items: buttons.map(function(btn) {
        return { title: btn.label, value: btn.value };
      })
    },
    message_type: 'outgoing'
  }];
}

// --- Human Handoff (Messenger → Telegram alert to owner) ---
function buildHumanHandoff() {
  var contactName = '';
  try { contactName = $('Filter & Extract').item.json.contactName || ''; } catch(e) {}

  var customerMsg = {
    content: 'M\u016bs\u0173 komanda netrukus su jumis susisieks! Jei skubu \u2014 skambinkite:\n\n\u{1F4DE} +370 648 803 88\n\u{1F4E7} info@batutynas.lt\n\n\u23F0 Darbo laikas: 8:00\u201321:00 kasdien',
    content_type: 'text',
    message_type: 'outgoing'
  };

  var label = contactName ? contactName : 'Ne\u017einomas klientas';
  var channel = isMessenger ? 'Facebook Messenger' : 'Svetain\u0117s widget';
  var telegramText = '\u{1F4DE} <b>Klientas nori kalb\u0117ti!</b>\n\n'
    + '\u{1F464} ' + label + '\n'
    + '\u{1F4AC} ' + channel + '\n\n'
    + '\u{1F4A1} <i>' + (isMessenger ? 'Atidarykite Facebook Page Inbox ir atsakykite.' : 'Atidarykite Chatwoot ir atsakykite.') + '</i>';

  var telegramItem = {
    _url: TELEGRAM_BOT_URL,
    _body: JSON.stringify({
      chat_id: TELEGRAM_OWNER_CHAT,
      text: telegramText,
      parse_mode: 'HTML'
    })
  };

  return { messages: [customerMsg], telegram: telegramItem };
}

// ============================================================
// MARKER PROCESSING
// ============================================================

var allMessages = [];

// Quick check: does the response contain any markers?
var hasMarker = /\[(?:DATE_PICKER|GUEST_COUNT|GUEST_COUNT_PUBLIC|MAIN_MENU|ADDON_UPSELL|PURCHASE_SUBMENU|PURCHASE_EMAIL_INPUT|PURCHASE_CUSTOM_FORM|MENU_GROUP_PARTY|MENU_GROUP_BIRTHDAY|MENU_GROUP_PUBLIC|HUMAN_HANDOFF|BOOKING_CONFIRM:)/.test(response);

if (!hasMarker) {
  var cleanText = response.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, isMessenger ? '$1' : '*$1*');
  if (isMessenger) { cleanText = cleanText.replace(/\*(.+?)\*/g, '$1'); }
  // FR-3.1: Strip any unrecognized markers from plain text path too
  cleanText = cleanText.replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '').trim();
  return formatOutput([{ content: cleanText, content_type: 'text', message_type: 'outgoing' }]);
}

var enriched = response;

// Fix #1: BOOKING_CONFIRM regex — handle one level of nested braces so arrays/objects in
// values (e.g. "addons":"Dart, Rodeo") don't cause premature termination at the first '}'.
var allMarkerRegex = /\[(?:DATE_PICKER|GUEST_COUNT|GUEST_COUNT_PUBLIC|MAIN_MENU|ADDON_UPSELL|PURCHASE_SUBMENU|PURCHASE_EMAIL_INPUT|PURCHASE_CUSTOM_FORM|MENU_GROUP_PARTY|HUMAN_HANDOFF|MENU_GROUP_BIRTHDAY(?::[^\]]*)?|MENU_GROUP_PUBLIC(?::[^\]]*)?|BOOKING_CONFIRM:\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g;

var lastIndex = 0;
var match;
var segments = [];

while ((match = allMarkerRegex.exec(enriched)) !== null) {
  if (match.index > lastIndex) {
    segments.push({ type: 'text', content: enriched.substring(lastIndex, match.index) });
  }
  segments.push({ type: 'marker', content: match[0] });
  lastIndex = match.index + match[0].length;
}
if (lastIndex < enriched.length) {
  segments.push({ type: 'text', content: enriched.substring(lastIndex) });
}

var contextFlags = { hadCatalog: false, hadDatePicker: false, hadGuestCount: false, hadBookingConfirm: false, hadMainMenu: false, hadAddonUpsell: false, hadPurchaseSubmenu: false, hadEmailInput: false, hadCustomForm: false, hadHandoff: false, handoffTelegram: null };

try {
for (var si = 0; si < segments.length; si++) {
  var seg = segments[si];
  if (seg.type === 'text') {
    var trimmed = seg.content.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, isMessenger ? '$1' : '*$1*').trim();
    if (isMessenger) { trimmed = trimmed.replace(/\*(.+?)\*/g, '$1'); }
    // FR-3.1: Strip any unrecognized markers so raw [MARKER_NAME] text never leaks to user
    trimmed = trimmed.replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '').trim();
    // Fix L5: catch trailing malformed BOOKING_CONFIRM without closing ] (e.g. [BOOKING_CONFIRM:{...)
    trimmed = trimmed.replace(/\[BOOKING_CONFIRM:[^\]]*$/, '').trim();
    if (trimmed) {
      allMessages.push({ content: trimmed, content_type: 'text', message_type: 'outgoing' });
    }
  } else {
    var marker = seg.content;

    if (marker === '[MAIN_MENU]') {
      allMessages.push.apply(allMessages, buildMainMenu());
      contextFlags.hadMainMenu = true;
    } else if (marker === '[DATE_PICKER]') {
      allMessages.push.apply(allMessages, buildDatePicker());
      contextFlags.hadDatePicker = true;
    } else if (marker === '[GUEST_COUNT]') {
      allMessages.push.apply(allMessages, buildGuestCountOptions());
      contextFlags.hadGuestCount = true;
    } else if (marker === '[GUEST_COUNT_PUBLIC]') {
      allMessages.push.apply(allMessages, buildGuestCountOptionsPublic());
      contextFlags.hadGuestCount = true;
    } else if (marker === '[ADDON_UPSELL]') {
      allMessages.push.apply(allMessages, buildAddonUpsell());
      contextFlags.hadAddonUpsell = true;
    } else if (marker === '[PURCHASE_SUBMENU]') {
      allMessages.push.apply(allMessages, buildPurchaseSubmenu());
      contextFlags.hadPurchaseSubmenu = true;
    } else if (marker === '[PURCHASE_EMAIL_INPUT]') {
      allMessages.push.apply(allMessages, buildPurchaseEmailInput());
      contextFlags.hadEmailInput = true;
    } else if (marker === '[PURCHASE_CUSTOM_FORM]') {
      allMessages.push.apply(allMessages, buildPurchaseCustomForm());
      contextFlags.hadCustomForm = true;
    } else if (marker === '[MENU_GROUP_PARTY]') {
      allMessages.push.apply(allMessages, buildGroupPartyEquipment());
      contextFlags.hadCatalog = true;
    } else if (marker === '[HUMAN_HANDOFF]') {
      var handoffResult = buildHumanHandoff();
      allMessages.push.apply(allMessages, handoffResult.messages);
      contextFlags.hadHandoff = true;
      contextFlags.handoffTelegram = handoffResult.telegram;
    } else {
      // Fix #2: all three checks are independent — no else chaining between them.
      // Previously BOOKING_CONFIRM was nested inside the else of MENU_GROUP_PUBLIC,
      // so a response containing both MENU_GROUP_PUBLIC and BOOKING_CONFIRM would
      // silently drop the booking confirmation.
      var bMatch = marker.match(/\[MENU_GROUP_BIRTHDAY(?::([^\]]+))?\]/);
      if (bMatch) {
        var rawB = bMatch[1] ? parseInt(bMatch[1]) : null;
        var countB = (rawB && !isNaN(rawB) && rawB > 0) ? rawB : null;
        allMessages.push.apply(allMessages, buildGroupBirthdayEquipment(countB));
        contextFlags.hadCatalog = true;
      }
      var pMatch = marker.match(/\[MENU_GROUP_PUBLIC(?::([^\]]+))?\]/);
      if (pMatch) {
        var rawP = pMatch[1] ? parseInt(pMatch[1]) : null;
        var countP = (rawP && !isNaN(rawP) && rawP > 0) ? rawP : null;
        allMessages.push.apply(allMessages, buildGroupPublicEquipment(countP));
        contextFlags.hadCatalog = true;
      }
      // Fix #1 + #2: BOOKING_CONFIRM is its own independent check (not else of MENU_GROUP_PUBLIC)
      // and uses the balanced-brace regex that handles one level of nested objects.
      var cMatch = marker.match(/\[BOOKING_CONFIRM:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/);
      if (cMatch) {
        allMessages.push.apply(allMessages, buildBookingConfirm(cMatch[1]));
        contextFlags.hadBookingConfirm = true;
      }
      // FR-3.2: Catch residual BOOKING_CONFIRM with malformed JSON — show generic confirmation
      if (!cMatch && !bMatch && !pMatch && marker.indexOf('BOOKING_CONFIRM') !== -1) {
        allMessages.push.apply(allMessages, buildBookingConfirm('{}'));
        contextFlags.hadBookingConfirm = true;
      }
    }
  }
}
} catch (enricherError) {
  allMessages.push({
    content: 'Atsiprašome, įvyko klaida. Pabandykite dar kartą arba skambinkite: +370 648 803 88',
    content_type: 'text',
    message_type: 'outgoing'
  });
}

// --- Post-booking navigation only ---
// Only show buttons after booking confirmation (flow complete).
// All other steps: no trailing button — user types "meniu" to go back.
if (contextFlags.hadBookingConfirm) {
  // Messenger quick reply titles are capped at 20 chars
  var postBookingBtns = isMessenger ? [
    { label: '\u{1F501} Naujas užsakymas', value: 'Noriu užsakyti dar vieną batutą' },
    { label: '\u{1F3E0} Pradžia', value: 'Pagrindinis meniu' }
  ] : [
    { label: '\u{1F501} Užsakyti dar vieną', value: 'Noriu užsakyti dar vieną batutą' },
    { label: '\u{1F3E0} Pradžia', value: 'Pagrindinis meniu' }
  ];
  allMessages.push.apply(allMessages, buildQuickReplies(postBookingBtns));
}

// H-4: empty allMessages fallback — prevents silent n8n failure
if (allMessages.length === 0) {
  allMessages.push({
    content: 'Atsiprašome, kažkas nutiko. Rašykite dar kartą arba skambinkite +370 648 803 88.',
    content_type: 'text',
    message_type: 'outgoing'
  });
}

var extras = [];
if (contextFlags.hadHandoff && contextFlags.handoffTelegram) {
  extras.push(contextFlags.handoffTelegram);
}
return formatOutput(allMessages, extras);
