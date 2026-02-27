// Browser-testable wrapper for enrich-chatwoot.js
// Usage: enrichChatwootResponse(responseText, isMessenger) => { messages: [...] }

function enrichChatwootResponse(response, isMessenger) {
  if (!response || !response.trim()) {
    return { messages: [{
      content: 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt',
      content_type: 'text',
      message_type: 'outgoing'
    }]};
  }

  // --- Equipment data ---
  const TRAMPOLINES = [
    { name: 'Džiumandži parkas', icon: '\u{1F334}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', type: 'Nuotykių parkas \u00b7 14x16 m', capacity: 'Iki 40 vaikų', bg: '#fef9f0', min: 15, max: 40, cat: 'big-park', popular: true, detail: 'Amžius: 4\u201314 m. \u00b7 Surinkimas: ~60 min \u00b7 Reikia: lygios 16x14 m aikštelės \u00b7 Įeina: batutas, generatorius, prižiūrėtojas' },
    { name: 'Fantazijų parkas', icon: '\u{1F3F0}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', type: 'Batutų parkas \u00b7 14x14 m', capacity: 'Iki 30 vaikų', bg: '#f5f0ff', min: 10, max: 30, cat: 'big-park', detail: 'Amžius: 4\u201314 m. \u00b7 Surinkimas: ~50 min \u00b7 Reikia: lygios 14x14 m aikštelės \u00b7 Įeina: batutas, generatorius, prižiūrėtojas' },
    { name: 'Giga ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', type: 'Kliūčių trasa 40 m \u00b7 45x8 m', capacity: '360 dalyvių/val.', bg: '#f0f9ff', min: 10, max: 100, cat: 'big-park', popular: true, detail: 'Amžius: 6+ m. \u00b7 Surinkimas: ~90 min \u00b7 Reikia: 45x8 m aikštelės \u00b7 Įeina: trasa, generatorius, 2 prižiūrėtojai' },
    { name: 'Mega Waikiki', icon: '\u{1F30A}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', type: 'Aukščiausias 8,5 m \u00b7 16x4 m', capacity: 'Iki 15 vaikų', bg: '#e0f7fa', min: 5, max: 15, cat: 'mega-trampoline', popular: true, detail: 'Amžius: 4\u201314 m. \u00b7 Aukštis: 8,5 m \u00b7 Surinkimas: ~40 min \u00b7 Čiuožykla + šokinėjimo zona \u00b7 Įeina: generatorius' },
    { name: 'Mega Rocket', icon: '\u{1F680}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#fff0f0', min: 5, max: 15, cat: 'mega-trampoline', detail: 'Amžius: 4\u201314 m. \u00b7 2 dalys: čiuožykla + arena \u00b7 Surinkimas: ~40 min \u00b7 Įeina: generatorius' },
    { name: 'Mega Ufonautai', icon: '\u{1F6F8}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', type: '2 dalių batutas \u00b7 14x5 m', capacity: 'Iki 15 vaikų', bg: '#ede7f6', min: 5, max: 15, cat: 'mega-trampoline', detail: 'Amžius: 4\u201314 m. \u00b7 2 dalys: čiuožykla + šokinėjimo zona \u00b7 Surinkimas: ~40 min \u00b7 Įeina: generatorius' },
    { name: 'Mega ruožas', icon: '\u{1F3C3}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', type: 'Kliūčių trasa 21 m \u00b7 25x6 m', capacity: '240 dalyvių/val.', bg: '#e8f5e9', min: 8, max: 100, cat: 'mega-trampoline', detail: 'Amžius: 6+ m. \u00b7 21 m kliūčių trasa \u00b7 Surinkimas: ~45 min \u00b7 Įeina: generatorius, prižiūrėtojas' },
    { name: 'Monstrai', icon: '\u{1F47E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', type: 'Su Dart žaidimu \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fce4ec', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3\u201312 m. \u00b7 Su velcro Dart žaidimu \u00b7 Surinkimas: ~25 min \u00b7 Idealus gimtadieniams' },
    { name: 'Candy Pop', icon: '\u{1F36D}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', type: 'Spalvingas \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#fdf0ff', min: 4, max: 12, cat: 'standard-trampoline', popular: true, detail: 'Amžius: 3\u201312 m. \u00b7 Spalvingas dizainas \u00b7 Surinkimas: ~25 min \u00b7 Šokinėjimo zona + čiuožykla' },
    { name: 'Aštuonkojis', icon: '\u{1F419}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', type: 'Jūros tema \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#e0f2f1', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3\u201312 m. \u00b7 Jūros tematika \u00b7 Surinkimas: ~25 min \u00b7 Šokinėjimo zona + čiuožykla' },
    { name: 'Chameleonas', icon: '\u{1F98E}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', type: 'Su čiuožykla \u00b7 8x5 m', capacity: 'Iki 12 vaikų', bg: '#f0fff4', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3\u201312 m. \u00b7 Su didele čiuožykla \u00b7 Surinkimas: ~25 min \u00b7 Spalvų keitimo dizainas' },
    { name: 'Vienaragiai', icon: '\u{1F984}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', type: 'Su tuneliais \u00b7 9x4 m', capacity: 'Iki 12 vaikų', bg: '#f3e5f5', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3\u201310 m. \u00b7 Su tuneliais ir čiuožykla \u00b7 Surinkimas: ~25 min \u00b7 Vienaragių tema' },
    { name: 'Pilis mažiesiems', icon: '\u{1F3EF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', type: 'Iki 5 metų \u00b7 5x4 m', capacity: 'Iki 6 vaikų', bg: '#fff8e1', min: 2, max: 6, cat: 'standard-trampoline', detail: 'Amžius: 2\u20135 m. \u00b7 Mažiausias batutas \u00b7 Surinkimas: ~15 min \u00b7 Saugus mažiausiems' },
    { name: 'Milžiniškas Dart', icon: '\u{1F3AF}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', type: 'Interaktyvi pramoga \u00b7 5x4,5 m', capacity: '60 dalyvių/val.', bg: '#fffff0', min: 1, max: 999, cat: 'addon', detail: 'Velcro kamuoliai + pripučiamas taikinys \u00b7 Visos amžiaus grupės \u00b7 Surinkimas: ~15 min' },
    { name: 'Kamuolių medžioklė', icon: '\u26BD', img: '', type: 'Komandinis žaidimas \u00b7 8 m arena', capacity: '4 žaidėjai/raundas', bg: '#f0f9ff', min: 1, max: 999, cat: 'addon', detail: 'Pripučiama arena \u00b7 4 žaidėjai vienu metu \u00b7 Komandinis žaidimas \u00b7 Surinkimas: ~20 min' },
    { name: 'Rodeo bulius', icon: '\u{1F920}', img: '', type: 'Mechaninis bulius \u00b7 5x5 m', capacity: 'Neribota', bg: '#fff3e0', min: 1, max: 999, cat: 'addon', detail: 'Mechaninis bulius su saugiu pripučiamu kilimėliu \u00b7 Reguliuojamas greitis \u00b7 Amžius: 6+' },
    { name: 'Saldėsių aparatai', icon: '\u{1F36C}', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=300,h=200,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: '1 NEMOKAMAI su batutu', capacity: 'Vata, popcorn, šerbetas', bg: '#fff5f0', min: 1, max: 999, cat: 'addon', detail: 'Cukraus vata + popcorn + šerbetas \u00b7 1 aparatas NEMOKAMAI su batutu \u00b7 Papildomi aparatai už papildomą mokestį' },
    { name: 'Disco paviljonas', icon: '\u{1FAA9}', img: '', type: 'LED apšvietimas \u00b7 4x4 m', capacity: 'Iki 20 žmonių', bg: '#f5f0ff', min: 1, max: 999, cat: 'party-equipment', popular: true, detail: 'LED apšvietimas + garso sistema \u00b7 4x4 m palapinė \u00b7 Tinka vakarėliams ir šokiams' },
    { name: 'Putų šou', icon: '\u{1FAE7}', img: '', type: 'Putų mašina + baseinas', capacity: 'Neribota', bg: '#e0f7fa', min: 1, max: 999, cat: 'party-equipment', detail: 'Putų mašina + pripučiamas baseinas \u00b7 Neriboti dalyviai \u00b7 Vasaros pramoga' },
    { name: 'Banketo stalai ir kėdės', icon: '\u{1FA91}', img: '', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', bg: '#fff8e1', min: 1, max: 999, cat: 'party-equipment', detail: 'Banketo stalai + kėdės \u00b7 Iki 50 vietų \u00b7 Pristatymas ir surinkimas įskaičiuota' }
  ];

  // --- Helper functions ---
  function buildCleanDetail(t) {
    if (!t.detail) return '';
    var parts = [];
    var ageMatch = t.detail.match(/Amžius:\s*[^·]+/);
    if (ageMatch) parts.push(ageMatch[0].trim());
    var setupMatch = t.detail.match(/Surinkimas:\s*[^·]+/);
    if (setupMatch) parts.push(setupMatch[0].trim());
    return parts.join(' \u00b7 ');
  }

  function formatItemText(t) {
    var pop = t.popular ? ' \u{1F525}' : '';
    var line = t.icon + ' *' + t.name + '*' + pop + '\n';
    line += t.type + ' \u00b7 ' + t.capacity;
    var cleanDetail = buildCleanDetail(t);
    if (cleanDetail) line += '\n' + cleanDetail;
    return line;
  }

  function buildTrampolineCards(items) {
    return items.map(function(t) {
      var pop = t.popular ? ' \u{1F525}' : '';
      var cleanDetail = buildCleanDetail(t);
      return {
        media_url: t.img || '',
        title: t.icon + ' ' + t.name + pop,
        description: t.type + ' \u00b7 ' + t.capacity + (cleanDetail ? '\n' + cleanDetail : ''),
        actions: [{ type: 'postback', text: 'Pasirinkti', payload: t.name }]
      };
    });
  }

  function buildTrampolineTextList(items) {
    return items.map(formatItemText).join('\n\n');
  }

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

  function buildTrampolineSelectItems(items) {
    return items.map(function(t) {
      var pop = t.popular ? ' \u{1F525}' : '';
      return { title: t.icon + ' ' + t.name + pop, value: t.name };
    });
  }

  function buildGroupEquipment(items, headerText, guestCount) {
    var messages = [];
    var recommended = [];
    var others = [];

    if (guestCount) {
      recommended = items.filter(function(t) { return t.min <= guestCount && guestCount <= t.max; });
      others = items.filter(function(t) { return !(t.min <= guestCount && guestCount <= t.max); });
    } else {
      recommended = items;
    }

    var addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });

    if (isMessenger) {
      // Send photos first so user sees the trampolines visually
      if (recommended.length > 0) {
        messages = messages.concat(buildImageMessages(recommended, 5));
      }

      var text = '';
      if (recommended.length > 0) {
        text += headerText + ':\n\n' + buildTrampolineTextList(recommended);
      }
      if (others.length > 0) {
        text += '\n\n\u2014\nKiti batutai:\n\n' + buildTrampolineTextList(others);
      }
      if (addons.length > 0) {
        text += '\n\n\u2014\nPapildomos pramogos:\n\n' + buildTrampolineTextList(addons);
      }
      messages.push({ content: text, content_type: 'text', message_type: 'outgoing' });
      messages.push({
        content: 'Pasirinkite batutą:',
        content_type: 'input_select',
        content_attributes: { items: buildTrampolineSelectItems(recommended.concat(others)) },
        message_type: 'outgoing'
      });
    } else {
      if (recommended.length > 0) {
        messages.push({
          content: headerText + ':',
          content_type: 'cards',
          content_attributes: { items: buildTrampolineCards(recommended) },
          message_type: 'outgoing'
        });
      }
      if (others.length > 0) {
        messages.push({
          content: 'Kiti batutai:',
          content_type: 'cards',
          content_attributes: { items: buildTrampolineCards(others) },
          message_type: 'outgoing'
        });
      }
      if (addons.length > 0) {
        messages.push({
          content: 'Papildomos pramogos:',
          content_type: 'cards',
          content_attributes: { items: buildTrampolineCards(addons) },
          message_type: 'outgoing'
        });
      }
    }
    return messages;
  }

  function buildGroupBirthdayEquipment(guestCount) {
    var standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
    var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
    return buildGroupEquipment(standard.concat(mega), 'Rekomenduojami jūsų šventei', guestCount);
  }

  function buildGroupPublicEquipment(guestCount) {
    var bigParks = TRAMPOLINES.filter(function(t) { return t.cat === 'big-park'; });
    var mega = TRAMPOLINES.filter(function(t) { return t.cat === 'mega-trampoline'; });
    var standard = TRAMPOLINES.filter(function(t) { return t.cat === 'standard-trampoline'; });
    return buildGroupEquipment(bigParks.concat(mega).concat(standard), 'Rekomenduojami jūsų renginiui', guestCount);
  }

  function buildGroupPartyEquipment() {
    var party = TRAMPOLINES.filter(function(t) { return t.cat === 'party-equipment'; });
    if (isMessenger) {
      return [
        { content: 'Vakarėlio įranga:\n\n' + buildTrampolineTextList(party), content_type: 'text', message_type: 'outgoing' },
        { content: 'Pasirinkite įrangą:', content_type: 'input_select', content_attributes: { items: buildTrampolineSelectItems(party) }, message_type: 'outgoing' }
      ];
    }
    return [{ content: 'Vakarėlio įranga:', content_type: 'cards', content_attributes: { items: buildTrampolineCards(party) }, message_type: 'outgoing' }];
  }

  function buildMainMenu() {
    return [{
      content: 'Kuo galiu padėti?',
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
    return [
      { content: 'Artimiausi šeštadieniai:', content_type: 'input_select', content_attributes: { items: days }, message_type: 'outgoing' },
      { content: 'Arba tiesiog parašykite savo datą (pvz. 2026-04-05 arba "balandžio 5 d.")', content_type: 'text', message_type: 'outgoing' }
    ];
  }

  function buildGuestCountOptions() {
    return [{
      content: 'Kiek svečių ar vaikų planuojate?',
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

  function buildAddonUpsell() {
    var addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });
    var selectItems = addons.map(function(t) { return { title: t.icon + ' ' + t.name, value: t.name }; });
    selectItems.push({ title: '\u274C Ne, tęsti be papildomų', value: 'Tęsti be papildomų pramogų' });

    if (isMessenger) {
      return [
        { content: 'Papildomos pramogos:\n\n' + buildTrampolineTextList(addons), content_type: 'text', message_type: 'outgoing' },
        { content: 'Pasirinkite papildomą pramogą arba tęskite:', content_type: 'input_select', content_attributes: { items: selectItems }, message_type: 'outgoing' }
      ];
    }
    return [
      { content: 'Papildykite savo šventę:', content_type: 'cards', content_attributes: { items: buildTrampolineCards(addons) }, message_type: 'outgoing' },
      { content: 'Pasirinkite pramogą arba tęskite:', content_type: 'input_select', content_attributes: { items: selectItems }, message_type: 'outgoing' }
    ];
  }

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

  function buildPurchaseEmailInput() {
    if (isMessenger) {
      return [{ content: 'Įrašykite savo el. pašto adresą ir atsiųsime batutų katalogą:', content_type: 'text', message_type: 'outgoing' }];
    }
    return [{
      content: 'Įveskite savo el. pašto adresą:',
      content_type: 'form',
      content_attributes: { items: [{ name: 'email', placeholder: 'jusu@pastas.lt', type: 'email', label: 'El. paštas' }] },
      message_type: 'outgoing'
    }];
  }

  function buildPurchaseCustomForm() {
    if (isMessenger) {
      return [{ content: 'Individualaus batuto užklausa\n\nPrašau nurodyti:\n1. Pageidaujamus matmenis (pvz. 8x5x4 m)\n2. Spalvas\n3. Personažus / temą\n4. Kontaktinį el. paštą\n5. Telefono numerį\n\nGalite parašyti visa informacija vienu pranešimu.', content_type: 'text', message_type: 'outgoing' }];
    }
    return [{
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
    }];
  }

  function buildBookingConfirm(jsonStr) {
    var data;
    try { data = JSON.parse(jsonStr); } catch (e) { data = {}; }
    var text = '\u2705 *Užklausa pateikta!*\n\n';
    if (data.group_type) text += 'Tipas: ' + data.group_type + '\n';
    if (data.date) text += 'Data: ' + data.date + '\n';
    if (data.location) text += 'Vieta: ' + data.location + '\n';
    if (data.address) text += 'Adresas: ' + data.address + '\n';
    if (data.event_type) text += 'Renginys: ' + data.event_type + '\n';
    if (data.guest_count) text += 'Svečių: ' + data.guest_count + '\n';
    if (data.contact_name) text += 'Kontaktas: ' + data.contact_name + '\n';
    if (data.contact_phone) text += 'Telefonas: ' + data.contact_phone + '\n';
    if (data.trampoline) text += 'Batutas: ' + data.trampoline + '\n';
    if (data.addons) text += 'Papildomos pramogos: ' + data.addons + '\n';
    if (data.dimensions) text += 'Matmenys: ' + data.dimensions + '\n';
    if (data.colors) text += 'Spalvos: ' + data.colors + '\n';
    if (data.characters) text += 'Personažai: ' + data.characters + '\n';
    if (data.email) text += 'El. paštas: ' + data.email + '\n';
    text += '\nMūsų komanda susisieks per 2 darbo valandas! \u{1F64F}';
    return [{ content: text, content_type: 'text', message_type: 'outgoing' }];
  }

  function buildQuickReplies(buttons) {
    if (!buttons || !buttons.length) return [];
    return [{
      content: '\u2195\uFE0F',
      content_type: 'input_select',
      content_attributes: { items: buttons.map(function(btn) { return { title: btn.label, value: btn.value }; }) },
      message_type: 'outgoing'
    }];
  }

  // --- Marker processing ---
  var allMarkerRegex = /\[(?:DATE_PICKER|GUEST_COUNT|MAIN_MENU|ADDON_UPSELL|PURCHASE_SUBMENU|PURCHASE_EMAIL_INPUT|PURCHASE_CUSTOM_FORM|MENU_GROUP_PARTY|MENU_GROUP_BIRTHDAY(?::\d+)?|MENU_GROUP_PUBLIC(?::\d+)?|LOCATION_OPTIONS|BOOKING_CONFIRM:\{[^\]]*\})\]/g;

  var hasMarker = allMarkerRegex.test(response);
  allMarkerRegex.lastIndex = 0; // reset after test()

  if (!hasMarker) {
    var cleanText = response.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '*$1*');
    var msgs = [{ content: cleanText, content_type: 'text', message_type: 'outgoing' }];
    msgs = msgs.concat(buildQuickReplies([{ label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }]));
    return { messages: msgs };
  }

  var allMessages = [];
  var lastIndex = 0;
  var match;
  var segments = [];

  while ((match = allMarkerRegex.exec(response)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: response.substring(lastIndex, match.index) });
    }
    segments.push({ type: 'marker', content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < response.length) {
    segments.push({ type: 'text', content: response.substring(lastIndex) });
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
      if (marker === '[MAIN_MENU]') { allMessages = allMessages.concat(buildMainMenu()); contextFlags.hadMainMenu = true; }
      else if (marker === '[DATE_PICKER]') { allMessages = allMessages.concat(buildDatePicker()); contextFlags.hadDatePicker = true; }
      else if (marker === '[GUEST_COUNT]') { allMessages = allMessages.concat(buildGuestCountOptions()); contextFlags.hadGuestCount = true; }
      else if (marker === '[ADDON_UPSELL]') { allMessages = allMessages.concat(buildAddonUpsell()); contextFlags.hadAddonUpsell = true; }
      else if (marker === '[PURCHASE_SUBMENU]') { allMessages = allMessages.concat(buildPurchaseSubmenu()); contextFlags.hadPurchaseSubmenu = true; }
      else if (marker === '[PURCHASE_EMAIL_INPUT]') { allMessages = allMessages.concat(buildPurchaseEmailInput()); contextFlags.hadEmailInput = true; }
      else if (marker === '[PURCHASE_CUSTOM_FORM]') { allMessages = allMessages.concat(buildPurchaseCustomForm()); contextFlags.hadCustomForm = true; }
      else if (marker === '[MENU_GROUP_PARTY]') { allMessages = allMessages.concat(buildGroupPartyEquipment()); contextFlags.hadCatalog = true; }
      else if (marker === '[LOCATION_OPTIONS]') { /* skip in Chatwoot */ }
      else {
        var bMatch = marker.match(/\[MENU_GROUP_BIRTHDAY(?::(\d+))?\]/);
        if (bMatch) { allMessages = allMessages.concat(buildGroupBirthdayEquipment(bMatch[1] ? parseInt(bMatch[1]) : null)); contextFlags.hadCatalog = true; continue; }
        var pMatch = marker.match(/\[MENU_GROUP_PUBLIC(?::(\d+))?\]/);
        if (pMatch) { allMessages = allMessages.concat(buildGroupPublicEquipment(pMatch[1] ? parseInt(pMatch[1]) : null)); contextFlags.hadCatalog = true; continue; }
        var cMatch = marker.match(/\[BOOKING_CONFIRM:(\{[^\]]*\})\]/);
        if (cMatch) { allMessages = allMessages.concat(buildBookingConfirm(cMatch[1])); contextFlags.hadBookingConfirm = true; continue; }
      }
    }
  }

  // Quick replies
  var isBookingStep = contextFlags.hadDatePicker || contextFlags.hadGuestCount || contextFlags.hadAddonUpsell;
  var quickReplies = [];
  if (contextFlags.hadBookingConfirm) {
    quickReplies = [{ label: 'Užsakyti dar vieną', value: 'Noriu užsakyti dar vieną batutą' }, { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }];
  } else if (contextFlags.hadCatalog) {
    quickReplies = [{ label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }];
  } else if (contextFlags.hadEmailInput || contextFlags.hadCustomForm || contextFlags.hadPurchaseSubmenu) {
    quickReplies = [{ label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }];
  } else if (isBookingStep) {
    quickReplies = [{ label: 'Atšaukti', value: 'Pagrindinis meniu' }];
  } else if (contextFlags.hadMainMenu) {
    quickReplies = [];
  } else {
    quickReplies = [{ label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }];
  }

  if (quickReplies.length > 0) {
    allMessages = allMessages.concat(buildQuickReplies(quickReplies));
  }

  return { messages: allMessages };
}
