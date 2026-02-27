// Chatwoot Enrichment Engine v2
// Converts AI marker-based responses into Chatwoot message objects
// Features: progressive disclosure, clean cards, no-image fallback,
//   contextual quick replies, typing indicator, warm conversational tone

var agentOutput = $input.first().json || {};
var response = agentOutput.output || agentOutput.text || '';
var isMessenger = $('Filter & Extract').item.json.isMessenger || false;
var conversationId = $('Filter & Extract').item.json.conversationId;
var chatwootBase = 'https://batutynas-chatwoot-chatwoot.0uvai5.easypanel.host/api/v1/accounts/1';

function formatOutput(msgs) {
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

  return result;
}

if (!response || !response.trim()) {
  return formatOutput([{
    content: 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt',
    content_type: 'text',
    message_type: 'outgoing'
  }]);
}

// --- Equipment data ---
var TRAMPOLINES = [
  // --- big-park (for public events only) ---
  { name: 'Džiumandži parkas', icon: '\u{1F334}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', type: 'Nuotykių parkas \u00b7 14x16 m', capacity: 'Iki 40 vaikų', bg: '#fef9f0', min: 15, max: 40, cat: 'big-park', popular: true, shortDesc: 'Iki 40 vaikų \u00b7 nuo 4 m.' },
  { name: 'Fantazijų parkas', icon: '\u{1F3F0}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', type: 'Batutų parkas \u00b7 14x14 m', capacity: 'Iki 30 vaikų', bg: '#f5f0ff', min: 10, max: 30, cat: 'big-park', shortDesc: 'Iki 30 vaikų \u00b7 nuo 4 m.' },
  { name: 'Giga ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', type: 'Kliūčių trasa 40 m \u00b7 45x8 m', capacity: '360 dalyvių/val.', bg: '#f0f9ff', min: 10, max: 100, cat: 'big-park', popular: true, shortDesc: '360 dalyvių/val. \u00b7 6+ m.' },

  // --- mega-trampoline (for birthdays + public) ---
  { name: 'Mega Waikiki', icon: '\u{1F30A}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', type: 'Aukščiausias 8,5 m \u00b7 16x4 m', capacity: 'Iki 15 vaikų', bg: '#e0f7fa', min: 5, max: 15, cat: 'mega-trampoline', popular: true, shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega Rocket', icon: '\u{1F680}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#fff0f0', min: 5, max: 15, cat: 'mega-trampoline', shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega Ufonautai', icon: '\u{1F6F8}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#ede7f6', min: 5, max: 15, cat: 'mega-trampoline', shortDesc: 'Iki 15 vaikų \u00b7 nuo 4 m.' },
  { name: 'Mega ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', type: 'Kliūčių trasa 21 m \u00b7 25x6 m', capacity: '240 dalyvių/val.', bg: '#e8f5e9', min: 8, max: 100, cat: 'mega-trampoline', shortDesc: '240 dalyvių/val. \u00b7 6+ m.' },

  // --- standard-trampoline (for birthdays) ---
  { name: 'Monstrai', icon: '\u{1F47E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', type: 'Su Dart žaidimu \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fce4ec', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Candy Pop', icon: '\u{1F36D}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', type: 'Spalvingas \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fdf0ff', min: 4, max: 12, cat: 'standard-trampoline', popular: true, shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Aštuonkojis', icon: '\u{1F419}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', type: 'Jūros tema \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#e0f2f1', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Chameleonas', icon: '\u{1F98E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', type: 'Su čiuožykla \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#f0fff4', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Vienaragiai', icon: '\u{1F984}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', type: 'Su tuneliais \u00b7 9x4 m', capacity: 'Iki 12 vaikų', bg: '#f3e5f5', min: 4, max: 12, cat: 'standard-trampoline', shortDesc: 'Iki 12 vaikų \u00b7 nuo 3 m.' },
  { name: 'Pilis mažiesiems', icon: '\u{1F3EF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', type: 'Iki 5 metų \u00b7 5x4 m', capacity: 'Iki 6 vaikų', bg: '#fff8e1', min: 2, max: 6, cat: 'standard-trampoline', shortDesc: 'Iki 6 vaikų \u00b7 2\u20135 m.' },

  // --- addon (extras for any event) ---
  { name: 'Milžiniškas Dart', icon: '\u{1F3AF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', type: 'Interaktyvi pramoga \u00b7 5x4,5 m', capacity: '60 dalyvių/val.', bg: '#fffff0', min: 1, max: 999, cat: 'addon', shortDesc: '60 dalyvių/val. \u00b7 visos amžiaus grupės' },
  { name: 'Kamuolių medžioklė', icon: '\u26BD', img: '', type: 'Komandinis žaidimas \u00b7 8 m arena', capacity: '4 žaidėjai/raundas', bg: '#f0f9ff', min: 1, max: 999, cat: 'addon', shortDesc: '4 žaidėjai/raundas \u00b7 komandinis' },
  { name: 'Rodeo bulius', icon: '\u{1F920}', img: '', type: 'Mechaninis bulius \u00b7 5x5 m', capacity: 'Neribota', bg: '#fff3e0', min: 1, max: 999, cat: 'addon', shortDesc: 'Neribota dalyvių \u00b7 nuo 6 m.' },
  { name: 'Saldėsių aparatai', icon: '\u{1F36C}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: '1 NEMOKAMAI su batutu', capacity: 'Vata, popcorn, šerbetas', bg: '#fff5f0', min: 1, max: 999, cat: 'addon', shortDesc: '1 NEMOKAMAI su batutu' },

  // --- party-equipment (party group only) ---
  { name: 'Disco paviljonas', icon: '\u{1FAA9}', img: '', type: 'LED apšvietimas \u00b7 4x4 m', capacity: 'Iki 20 žmonių', bg: '#f5f0ff', min: 1, max: 999, cat: 'party-equipment', popular: true, shortDesc: 'Iki 20 žmonių \u00b7 LED + garsas' },
  { name: 'Putų šou', icon: '\u{1FAE7}', img: '', type: 'Putų mašina + baseinas', capacity: 'Neribota', bg: '#e0f7fa', min: 1, max: 999, cat: 'party-equipment', shortDesc: 'Neribota dalyvių \u00b7 vasaros hit' },
  { name: 'Banketo stalai ir kėdės', icon: '\u{1FA91}', img: '', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', bg: '#fff8e1', min: 1, max: 999, cat: 'party-equipment', shortDesc: 'Iki 50 vietų \u00b7 pristatymas įskaičiuotas' }
];

// --- Helper: format item for text (Messenger fallback) ---
function formatItemText(t) {
  var pop = t.popular ? ' \u{1F525}' : '';
  var line = t.icon + ' *' + t.name + '*' + pop + '\n';
  line += t.shortDesc || (t.type + ' \u00b7 ' + t.capacity);
  return line;
}

// --- Build trampoline cards for Chatwoot web widget ---
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
    var pop = t.popular ? ' \u{1F525}' : '';
    return { title: t.icon + ' ' + t.name + pop, value: t.name };
  });
}

// --- Build trampoline text list for Messenger ---
function buildTrampolineTextList(items) {
  return items.map(formatItemText).join('\n\n');
}

// --- Build image messages for Messenger ---
function buildImageMessages(items, maxImages) {
  var withImages = items.filter(function(t) { return t.img; });
  var limited = withImages.slice(0, maxImages || 5);
  return limited.map(function(t) {
    var pop = t.popular ? ' \u{1F525}' : '';
    return {
      content: t.icon + ' ' + t.name + pop + ' \u2014 ' + t.type,
      content_type: '_image',
      message_type: 'outgoing',
      _imageUrl: t.img
    };
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

  if (isMessenger) {
    if (recommended.length > 0) {
      messages.push.apply(messages, buildImageMessages(recommended, 5));
    }
    var text = '';
    if (recommended.length > 0) {
      text += headerText + ':\n\n' + buildTrampolineTextList(recommended);
    }
    if (others.length > 0) {
      text += '\n\n\u2014\nKiti batutai:\n\n' + buildTrampolineTextList(others);
    }
    messages.push({ content: text, content_type: 'text', message_type: 'outgoing' });
    var allSelectItems = buildTrampolineSelectItems(recommended.concat(others));
    messages.push({
      content: 'Pasirinkite batutą:',
      content_type: 'input_select',
      content_attributes: { items: allSelectItems },
      message_type: 'outgoing'
    });
  } else {
    // Web widget: cards + single dropdown for everything else
    if (recommended.length > 0) {
      var result = buildTrampolineCards(recommended, btnText || '\u2713 Noriu šio');
      if (result.cards.length > 0) {
        messages.push({
          content: headerText + ':',
          content_type: 'cards',
          content_attributes: { items: result.cards },
          message_type: 'outgoing'
        });
      }
      // Merge no-image recommended items + others into one dropdown
      var extraItems = buildTrampolineSelectItems(result.noImgItems.concat(others));
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
  }

  return messages;
}

function buildGroupBirthdayEquipment(guestCount) {
  var standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
  var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  var all = standard.concat(mega);
  return buildGroupEquipment(all, '\u{1F382} Rekomenduojami jūsų šventei', guestCount);
}

function buildGroupPublicEquipment(guestCount) {
  var bigParks = TRAMPOLINES.filter(function(t) { return t.cat === 'big-park'; });
  var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
  var standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
  var all = bigParks.concat(mega).concat(standard);
  return buildGroupEquipment(all, '\u{1F3AA} Rekomenduojami jūsų renginiui', guestCount);
}

function buildGroupPartyEquipment() {
  var party = TRAMPOLINES.filter(function(t) { return t.cat === 'party-equipment'; });

  if (isMessenger) {
    return [
      { content: 'Vakarėlio įranga:\n\n' + buildTrampolineTextList(party), content_type: 'text', message_type: 'outgoing' },
      {
        content: 'Pasirinkite įrangą:',
        content_type: 'input_select',
        content_attributes: { items: buildTrampolineSelectItems(party) },
        message_type: 'outgoing'
      }
    ];
  }

  // Party items mostly have no images — use input_select with descriptions
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
  return [{
    content: 'Kuo galiu padėti? \u{1F60A}',
    content_type: 'input_select',
    content_attributes: {
      items: [
        { title: '\u{1F382} Vaikų gimtadienis ar krikštynos', value: 'Planuoju vaikų gimtadienį arba krikštynas' },
        { title: '\u{1F3AA} Viešas renginys ar įmonės sąskrydis', value: 'Planuoju viešą renginį arba įmonės sąskrydį' },
        { title: '\u{1F389} Triukšmingas vakarėlis', value: 'Planuoju triukšmingą vakarėlį' },
        { title: '\u{1F6D2} Noriu pirkti batutą', value: 'Noriu pirkti batutą' },
        { title: '\u2139\uFE0F Saugumas, DUK ir kontaktai', value: 'Saugumas, DUK ir kontaktai' }
      ]
    },
    message_type: 'outgoing'
  }];
}

// --- Date Picker ---
function buildDatePicker() {
  var days = [];
  var now = new Date();
  var d = new Date(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  for (var i = 0; i < 4; i++) {
    var iso = d.toISOString().split('T')[0];
    var label = d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' });
    days.push({ title: label, value: iso });
    d.setDate(d.getDate() + 7);
  }

  return [{
    content: 'Populiariausi laikai \u2014 šeštadieniai:\n(galite ir parašyti savo datą)',
    content_type: 'input_select',
    content_attributes: { items: days },
    message_type: 'outgoing'
  }];
}

// --- Guest Count ---
function buildGuestCountOptions() {
  return [{
    content: 'Kiek mažųjų svečių bus? \u{1F466}\u{1F467}',
    content_type: 'input_select',
    content_attributes: {
      items: [
        { title: 'Iki 6 vaikų', value: 'Apie 6 svečių' },
        { title: '7\u201312 vaikų', value: 'Apie 10 svečių' },
        { title: '13\u201320 vaikų', value: 'Apie 15 svečių' },
        { title: 'Daugiau nei 20', value: 'Apie 30 svečių' }
      ]
    },
    message_type: 'outgoing'
  }];
}

// --- Addon Upsell ---
function buildAddonUpsell() {
  var addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });

  if (isMessenger) {
    var selectItems = addons.map(function(t) {
      return { title: t.icon + ' ' + t.name, value: t.name };
    });
    selectItems.push({ title: '\u27A1\uFE0F Tęsti toliau', value: 'Tęsti be papildomų pramogų' });
    return [{
      content: 'Gal dar kažko pridėti?',
      content_type: 'input_select',
      content_attributes: { items: selectItems },
      message_type: 'outgoing'
    }];
  }

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
  return [{
    content: 'Ką norėtumėte?',
    content_type: 'input_select',
    content_attributes: {
      items: [
        { title: '\u{1F4E7} Gauti katalogą el. paštu', value: 'Noriu gauti batutų katalogą el. paštu' },
        { title: '\u{1F3A8} Individuali gamyba', value: 'Noriu individualios batuto gamybos' }
      ]
    },
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
      content: 'Individualaus batuto užklausa\n\nPrašau nurodyti:\n1. Pageidaujamus matmenis (pvz. 8x5x4 m)\n2. Spalvas\n3. Personažus / temą\n4. Kontaktinį el. paštą\n5. Telefono numerį\n\nGalite parašyti visa informacija vienu pranešimu.',
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
  try { data = JSON.parse(jsonStr); } catch (e) { data = {}; }

  var text = '\u2705 *Užklausa pateikta!*\n\n';

  // Event details
  if (data.date) text += '\u{1F4C5} ' + data.date + '\n';
  if (data.location) text += '\u{1F4CD} ' + data.location + '\n';
  if (data.address) text += '\u{1F3E0} ' + data.address + '\n';
  if (data.group_type || data.event_type) text += '\u{1F389} ' + (data.event_type || data.group_type) + '\n';
  if (data.guest_count) text += '\u{1F465} ' + data.guest_count + ' svečių\n';

  // Equipment
  if (data.trampoline) text += '\u{1F3AA} ' + data.trampoline + '\n';
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

  text += '\nSusisieksime per 2 darbo valandas! \u{1F64F}';

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

// ============================================================
// MARKER PROCESSING
// ============================================================

var enriched = response;
var allMessages = [];
var hasMarker = false;

var markerDefs = [
  { pattern: /\[DATE_PICKER\]/g, fn: function() { return buildDatePicker(); } },
  { pattern: /\[GUEST_COUNT\]/g, fn: function() { return buildGuestCountOptions(); } },
  { pattern: /\[MAIN_MENU\]/g, fn: function() { return buildMainMenu(); } },
  { pattern: /\[ADDON_UPSELL\]/g, fn: function() { return buildAddonUpsell(); } },
  { pattern: /\[PURCHASE_SUBMENU\]/g, fn: function() { return buildPurchaseSubmenu(); } },
  { pattern: /\[PURCHASE_EMAIL_INPUT\]/g, fn: function() { return buildPurchaseEmailInput(); } },
  { pattern: /\[PURCHASE_CUSTOM_FORM\]/g, fn: function() { return buildPurchaseCustomForm(); } },
  { pattern: /\[MENU_GROUP_PARTY\]/g, fn: function() { return buildGroupPartyEquipment(); } }
];

for (var mi = 0; mi < markerDefs.length; mi++) {
  var m = markerDefs[mi];
  if (m.pattern.test(enriched)) {
    hasMarker = true;
    enriched = enriched.replace(m.pattern, '\n<<MARKER>>\n');
  }
}

var birthdayMatch = enriched.match(/\[MENU_GROUP_BIRTHDAY(?::[^\]]+)?\]/);
var publicMatch = enriched.match(/\[MENU_GROUP_PUBLIC(?::[^\]]+)?\]/);
var confirmMatch = enriched.match(/\[BOOKING_CONFIRM:(\{[^\]]*\})\]/);

if (birthdayMatch || publicMatch || confirmMatch) hasMarker = true;

if (!hasMarker) {
  var cleanText = response.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '*$1*');
  // Plain text — just send it. No trailing button.
  // User can always type "meniu" to get back to the main menu.
  return formatOutput([{ content: cleanText, content_type: 'text', message_type: 'outgoing' }]);
}

enriched = response;

var allMarkerRegex = /\[(?:DATE_PICKER|GUEST_COUNT|MAIN_MENU|ADDON_UPSELL|PURCHASE_SUBMENU|PURCHASE_EMAIL_INPUT|PURCHASE_CUSTOM_FORM|MENU_GROUP_PARTY|MENU_GROUP_BIRTHDAY(?::[^\]]+)?|MENU_GROUP_PUBLIC(?::[^\]]+)?|LOCATION_OPTIONS|BOOKING_CONFIRM:\{[^\]]*\})\]/g;

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

var contextFlags = { hadCatalog: false, hadDatePicker: false, hadGuestCount: false, hadBookingConfirm: false, hadMainMenu: false, hadAddonUpsell: false, hadPurchaseSubmenu: false, hadEmailInput: false, hadCustomForm: false };

for (var si = 0; si < segments.length; si++) {
  var seg = segments[si];
  if (seg.type === 'text') {
    var trimmed = seg.content.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '*$1*').trim();
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
    } else if (marker === '[LOCATION_OPTIONS]') {
      // Chatwoot: location handled as plain text by AI — skip silently
    } else {
      var bMatch = marker.match(/\[MENU_GROUP_BIRTHDAY(?::([^\]]+))?\]/);
      if (bMatch) {
        var rawB = bMatch[1] ? parseInt(bMatch[1]) : null;
        var countB = (rawB && !isNaN(rawB)) ? rawB : null;
        allMessages.push.apply(allMessages, buildGroupBirthdayEquipment(countB));
        contextFlags.hadCatalog = true;
        continue;
      }
      var pMatch = marker.match(/\[MENU_GROUP_PUBLIC(?::([^\]]+))?\]/);
      if (pMatch) {
        var rawP = pMatch[1] ? parseInt(pMatch[1]) : null;
        var countP = (rawP && !isNaN(rawP)) ? rawP : null;
        allMessages.push.apply(allMessages, buildGroupPublicEquipment(countP));
        contextFlags.hadCatalog = true;
        continue;
      }
      var cMatch = marker.match(/\[BOOKING_CONFIRM:(\{[^\]]*\})\]/);
      if (cMatch) {
        allMessages.push.apply(allMessages, buildBookingConfirm(cMatch[1]));
        contextFlags.hadBookingConfirm = true;
        continue;
      }
    }
  }
}

// --- Post-booking navigation only ---
// Only show buttons after booking confirmation (flow complete).
// All other steps: no trailing button — user types "meniu" to go back.
if (contextFlags.hadBookingConfirm) {
  allMessages.push.apply(allMessages, buildQuickReplies([
    { label: '\u{1F501} Užsakyti dar vieną', value: 'Noriu užsakyti dar vieną batutą' },
    { label: '\u{1F3E0} Pradžia', value: 'Pagrindinis meniu' }
  ]));
}

return formatOutput(allMessages);
