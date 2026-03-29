/**
 * Batutynas.lt Chat Widget Enricher
 * Converts AI marker-based responses ([DATE_PICKER], [MENU_GROUP_BIRTHDAY:10], etc.)
 * into interactive HTML cards, buttons, and forms.
 * Include AFTER chat-widget.js and chat-widget.css.
 *
 * Usage: <script src="chat-enricher.js" data-webhook="https://..."></script>
 */
(function() {
  "use strict";
  var _realFetch = window.fetch;

  const TRAMPOLINES = [
    // --- big-park (for public events only) ---
    { name: 'Džiumandži parkas', icon: '🌴', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.18-Rc7QdQX9UPx5Qii4.jpeg', type: 'Nuotykių parkas · 14x16 m', capacity: 'Iki 40 vaikų', price: 'pagal užklausą', bg: '#fef9f0', min: 15, max: 200, cat: 'big-park', popular: true, detail: 'Amžius: 4–14 m. · Surinkimas: ~60 min · Reikia: lygios 16x14 m aikštelės · Įeina: batutas, generatorius, prižiūrėtojas' },
    { name: 'Fantazijų parkas', icon: '🏰', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183358_615_1752852849151_photo_optimized-1-Su0yn2ubUUAdRTaM.jpg', type: 'Batutų parkas · 14x14 m', capacity: 'Iki 30 vaikų', price: 'pagal užklausą', bg: '#f5f0ff', min: 10, max: 150, cat: 'big-park', detail: 'Amžius: 4–14 m. · Surinkimas: ~50 min · Reikia: lygios 14x14 m aikštelės · Įeina: batutas, generatorius, prižiūrėtojas' },
    { name: 'Giga ruožas', icon: '🏃', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg', type: 'Kliūčių trasa 40 m · 45x8 m', capacity: '360 dalyvių/val.', price: 'pagal užklausą', bg: '#f0f9ff', min: 10, max: 1000, cat: 'big-park', popular: true, detail: 'Amžius: 6+ m. · Surinkimas: ~90 min · Reikia: 45x8 m aikštelės · Įeina: trasa, generatorius, 2 prižiūrėtojai' },

    // --- mega-trampoline (for birthdays + public) ---
    { name: 'Mega Waikiki', icon: '🌊', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2026-01-19-at-08.02.20-1-qKrIjl8vIiaDDEeJ.jpeg', type: 'Aukščiausias 8,5 m · 16x4 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#e0f7fa', min: 5, max: 15, cat: 'mega-trampoline', popular: true, detail: 'Amžius: 4–14 m. · Aukštis: 8,5 m · Surinkimas: ~40 min · Čiuožykla + šokinėjimo zona · Įeina: generatorius' },
    { name: 'Mega Rocket', icon: '🚀', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg', type: '2 dalių batutas · 14x5 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#fff0f0', min: 5, max: 15, cat: 'mega-trampoline', detail: 'Amžius: 4–14 m. · 2 dalys: čiuožykla + arena · Surinkimas: ~40 min · Įeina: generatorius' },
    { name: 'Mega Ufonautai', icon: '🛸', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-k77GausjdJtLgsxH.jpeg', type: '2 dalių batutas · 14x5 m', capacity: 'Iki 15 vaikų', price: 'pagal užklausą', bg: '#ede7f6', min: 5, max: 15, cat: 'mega-trampoline', detail: 'Amžius: 4–14 m. · 2 dalys: čiuožykla + šokinėjimo zona · Surinkimas: ~40 min · Įeina: generatorius' },
    { name: 'Mega ruožas', icon: '🏃', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg', type: 'Kliūčių trasa 21 m · 25x6 m', capacity: '240 dalyvių/val.', price: 'pagal užklausą', bg: '#e8f5e9', min: 8, max: 600, cat: 'mega-trampoline', detail: 'Amžius: 6+ m. · 21 m kliūčių trasa · Surinkimas: ~45 min · Įeina: generatorius, prižiūrėtojas' },

    // --- standard-trampoline (for birthdays) ---
    { name: 'Monstrai', icon: '👾', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png', type: 'Su Dart žaidimu · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#fce4ec', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3–12 m. · Su velcro Dart žaidimu · Surinkimas: ~25 min · Idealus gimtadieniams' },
    { name: 'Candy Pop', icon: '🍭', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-6FZ64pJgz45vxYSk.png', type: 'Spalvingas · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#fdf0ff', min: 4, max: 12, cat: 'standard-trampoline', popular: true, detail: 'Amžius: 3–12 m. · Spalvingas dizainas · Surinkimas: ~25 min · Šokinėjimo zona + čiuožykla' },
    { name: 'Aštuonkojis', icon: '🐙', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-guBAxfjAKUTQkefw.png', type: 'Jūros tema · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#e0f2f1', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3–12 m. · Jūros tematika · Surinkimas: ~25 min · Šokinėjimo zona + čiuožykla' },
    { name: 'Chameleonas', icon: '🦎', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png', type: 'Su čiuožykla · 8x5 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#f0fff4', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3–12 m. · Su didele čiuožykla · Surinkimas: ~25 min · Spalvų keitimo dizainas' },
    { name: 'Vienaragiai', icon: '🦄', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/vienaragiai_live1-WinCFPxPLvD4Bvpp.jpg', type: 'Su tuneliais · 9x4 m', capacity: 'Iki 12 vaikų', price: 'pagal užklausą', bg: '#f3e5f5', min: 4, max: 12, cat: 'standard-trampoline', detail: 'Amžius: 3–10 m. · Su tuneliais ir čiuožykla · Surinkimas: ~25 min · Vienaragių tema' },
    { name: 'Pilis mažiesiems', icon: '🏯', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-Vr2HXTPMFyM6szXt.jpg', type: 'Iki 5 metų · 5x4 m', capacity: 'Iki 6 vaikų', price: 'pagal užklausą', bg: '#fff8e1', min: 2, max: 6, cat: 'standard-trampoline', detail: 'Amžius: 2–5 m. · Mažiausias batutas · Surinkimas: ~15 min · Saugus mažiausiems' },

    // --- addon (paid extras) ---
    { name: 'Milžiniškas Dart', icon: '🎯', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-1-KNKOwGZxrP8Qotu0.jpg', type: 'Interaktyvi pramoga · 5x4,5 m', capacity: '60 dalyvių/val.', price: 'pagal užklausą', bg: '#fffff0', min: 1, max: 999, cat: 'addon', detail: 'Velcro kamuoliai + pripučiamas taikinys · Visos amžiaus grupės · Surinkimas: ~15 min' },
    { name: 'Kamuolių medžioklė', icon: '⚽', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/img-20250908-wa0000-OjvumGsbJUPEqY7H.jpg', type: 'Komandinis žaidimas · 8 m arena', capacity: '4 žaidėjai/raundas', price: 'pagal užklausą', bg: '#f0f9ff', min: 1, max: 999, cat: 'addon', detail: 'Pripučiama arena · 4 žaidėjai vienu metu · Komandinis žaidimas · Surinkimas: ~20 min' },
    { name: 'Rodeo bulius', icon: '🤠', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_y02vw0y02vw0y02v-1UPI9AO2yIhGQbUk.png', type: 'Mechaninis bulius · 5x5 m', capacity: 'Neribota', price: 'pagal užklausą', bg: '#fff3e0', min: 1, max: 999, cat: 'addon', detail: 'Mechaninis bulius su saugiu pripučiamu kilimėliu · Reguliuojamas greitis · Amžius: 6+' },
    { name: 'Saldėsių aparatai', icon: '🍬', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_n0wezbn0wezbn0we-eBEHQuTVAV3qYVji.png', type: '1 NEMOKAMAI su batutu', capacity: 'Vata, popcorn, šerbetas', price: '1 NEMOKAMAI', bg: '#fff5f0', min: 1, max: 999, cat: 'addon', detail: 'Cukraus vata + popcorn + šerbetas · 1 aparatas NEMOKAMAI su batutu · Papildomi aparatai už papildomą mokestį' },

    // --- party-equipment (party group only) ---
    { name: 'Disco paviljonas', icon: '🪩', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: 'LED apšvietimas · 4x4 m', capacity: 'Iki 20 žmonių', price: 'pagal užklausą', bg: '#f5f0ff', min: 1, max: 999, cat: 'party-equipment', popular: true, detail: 'LED apšvietimas + garso sistema · 4x4 m palapinė · Tinka vakarėliams ir šokiams' },
    { name: 'Putų šou', icon: '🫧', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/unnamed-2-DZswbmOPQZ24Gc8b.jpg', type: 'Putų mašina + baseinas', capacity: 'Neribota', price: 'pagal užklausą', bg: '#e0f7fa', min: 1, max: 999, cat: 'party-equipment', detail: 'Putų mašina + pripučiamas baseinas · Neriboti dalyviai · Vasaros pramoga' },
    { name: 'Banketo stalai ir kėdės', icon: '🪑', img: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=600,h=400,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_lmbogflmbogflmbo-yW8t5tAPn0eG8rIQ.png', type: 'Stalai + kėdės komplektas', capacity: 'Iki 50 vietų', price: 'pagal užklausą', bg: '#fff8e1', min: 1, max: 999, cat: 'party-equipment', detail: 'Banketo stalai + kėdės · Iki 50 vietų · Pristatymas ir surinkimas įskaičiuota' }
  ];

  // 2. Helper functions
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function localIso(dt) { return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()); }

  // FR-6.1: Check if current time is outside Lithuanian business hours
  function isOutOfHours() {
    try {
      const now = new Date();
      const lt = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }));
      const day = lt.getDay(); // 0=Sun, 6=Sat
      const hour = lt.getHours();
      if (hour < 8 || hour >= 21) return true;
      return false;
    } catch (e) { return false; }
  }

  // 3. Builder functions

  // compact=true → 2-column grid for secondary items; false → full-width featured cards
  function buildTrampolineCards(items, highlight, multiSelect, compact) {
    const gridClass = compact ? 'chat-trampoline-grid t-grid-compact' : 'chat-trampoline-grid';
    let html = '<div class="' + gridClass + '">';
    for (const t of items) {
      const thumb = t.img
        ? '<img src="' + escapeHtml(t.img) + '" alt="' + escapeHtml(t.name) + '" loading="lazy" data-chat-zoom>'
        : escapeHtml(t.icon);
      const bgClass = ' t-bg-' + t.cat;
      const recClass = highlight ? ' t-recommended' : '';
      const selectAttr = multiSelect
        ? 'data-chat-addon="' + escapeHtml(t.name) + '" aria-pressed="false"'
        : 'data-chat-option="' + escapeHtml(t.name) + '"';
      html += '<div class="chat-trampoline-select' + bgClass + recClass + '" role="button" tabindex="0" ' + selectAttr + '>';
      if (t.popular) html += '<div class="chat-popular-badge">Populiariausias</div>';
      html += '<div class="chat-trampoline-thumb">' + thumb + '</div>';
      html += '<div class="chat-trampoline-info">';
      html += '<div class="t-name">' + escapeHtml(t.name) + '</div>';
      html += '<div class="t-meta">' + escapeHtml(t.type) + ' · ' + escapeHtml(t.capacity) + '</div>';
      html += '<div class="t-price">' + escapeHtml(t.price) + '</div>';
      html += '</div>';
      if (t.detail) {
        html += '<div class="t-detail-btn" role="button" tabindex="0" aria-label="Daugiau informacijos" data-chat-detail-toggle>ℹ</div>';
        html += '<div class="t-detail">' + escapeHtml(t.detail) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // Group 1: Birthday equipment (standard + mega only, no big parks)
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
        html += '<div class="chat-section-title">Rekomenduojami jūsų šventei:</div>';
        html += buildTrampolineCards(recommended, true, false, false);
      }
      if (others.length > 0) {
        html += '<div class="chat-section-subtitle">Kiti batutai:</div>';
        html += buildTrampolineCards(others, false, false, true);
      }
    } else {
      html += buildTrampolineCards(all, false);
    }

    // FR-3.4: When guest count exceeds typical birthday capacity, suggest public event flow
    if (guestCount && guestCount > 15) {
      html += '<div class="chat-birthday-cta">';
      html += '<strong>💡 Dideliam būriui</strong> — turime dar didesnius nuotykių parkus ir kliūčių trasas!';
      html += '<br><button type="button" class="chat-option-btn chat-cta-btn" data-chat-option="Planuoju viešą renginį arba įmonės sąskrydį">🎪 Peržiūrėti didesnius batutus</button>';
      html += '</div>';
    }

    if (addons.length > 0) {
      html += '<div class="chat-section-subtitle">Papildomos pramogos:</div>';
      html += buildTrampolineCards(addons, false, true, true);
      html += '<button type="button" class="chat-addon-continue" data-chat-addon-continue>Tęsti →</button>';
    }

    return html;
  }

  // Group 2: Public event equipment (ALL trampolines, biggest first)
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
        html += '<div class="chat-section-title">Rekomenduojami jūsų renginiui:</div>';
        html += buildTrampolineCards(recommended, true, false, false);
      }
      if (others.length > 0) {
        html += '<div class="chat-section-subtitle">Kiti batutai:</div>';
        html += buildTrampolineCards(others, false, false, true);
      }
    } else {
      html += buildTrampolineCards(all, false);
    }

    if (addons.length > 0) {
      html += '<div class="chat-section-subtitle">Papildomos pramogos:</div>';
      html += buildTrampolineCards(addons, false, true, true);
      html += '<button type="button" class="chat-addon-continue" data-chat-addon-continue>Tęsti →</button>';
    }

    return html;
  }

  // Group 3: Party equipment only
  function buildGroupPartyEquipment() {
    const party = TRAMPOLINES.filter(function(t) { return t.cat === 'party-equipment'; });
    let html = '<div class="chat-section-title">Vakarėlio įranga:</div>';
    html += buildTrampolineCards(party, false, true, false);
    html += '<button type="button" class="chat-addon-continue" data-chat-addon-continue>Tęsti →</button>';
    return html;
  }

  // Addon upsell (multi-select)
  function buildAddonUpsell() {
    const addons = TRAMPOLINES.filter(function(t) { return t.cat === 'addon'; });
    let html = '<div class="chat-section-title">Papildykite savo šventę:</div>';
    html += buildTrampolineCards(addons, false, true, false);
    html += '<button type="button" class="chat-addon-continue" data-chat-addon-continue>Tęsti →</button>';
    return html;
  }

  // Purchase submenu
  function buildPurchaseSubmenu() {
    let html = '<div class="chat-options">';
    html += '<button type="button" class="chat-option-btn" data-chat-option="Noriu gauti batutų katalogą el. paštu">📧 Gauti katalogą el. paštu</button>';
    html += '<button type="button" class="chat-option-btn" data-chat-option="Noriu individualios batuto gamybos">🎨 Individuali gamyba</button>';
    html += '</div>';
    return html;
  }

  // Email input for catalog
  function buildPurchaseEmailInput() {
    let html = '<div class="chat-email-form">';
    html += '<label class="chat-form-text" for="catalog-email">Įveskite savo el. pašto adresą ir atsiųsime batutų katalogą:</label>';
    html += '<input type="email" id="catalog-email" class="chat-email-input" data-chat-email placeholder="jusu@pastas.lt" autocomplete="email">';
    html += '<button type="button" class="chat-email-confirm" data-chat-email-confirm disabled>Siųsti katalogą</button>';
    html += '</div>';
    return html;
  }

  // Custom manufacturing form
  function buildPurchaseCustomForm() {
    let html = '<div class="chat-custom-form">';
    html += '<p class="chat-form-title">Individualaus batuto užklausa:</p>';
    html += '<label class="chat-form-label" for="custom-dimensions">Pageidaujami matmenys (plotis x ilgis x aukštis):</label>';
    html += '<input type="text" id="custom-dimensions" class="chat-custom-input" data-custom-field="dimensions" placeholder="pvz. 8x5x4 m">';
    html += '<label class="chat-form-label" for="custom-colors">Spalvos:</label>';
    html += '<input type="text" id="custom-colors" class="chat-custom-input" data-custom-field="colors" placeholder="pvz. mėlyna, raudona, geltona">';
    html += '<label class="chat-form-label" for="custom-characters">Personažai / tema:</label>';
    html += '<input type="text" id="custom-characters" class="chat-custom-input" data-custom-field="characters" placeholder="pvz. Spiderman, dinozaurai">';
    html += '<label class="chat-form-label" for="custom-notes">Papildomi pageidavimai / eskizas:</label>';
    html += '<textarea id="custom-notes" class="chat-custom-textarea" data-custom-field="notes" placeholder="Aprašykite savo viziją..." rows="3"></textarea>';
    html += '<label class="chat-form-label" for="custom-email">Kontaktinis el. paštas:</label>';
    html += '<input type="email" id="custom-email" class="chat-custom-input" data-custom-field="email" placeholder="jusu@pastas.lt" autocomplete="email">';
    html += '<label class="chat-form-label" for="custom-phone">Telefono numeris:</label>';
    html += '<input type="tel" id="custom-phone" class="chat-custom-input" data-custom-field="phone" placeholder="+370 600 00000" autocomplete="tel">';
    html += '<button type="button" class="chat-custom-submit" data-chat-custom-submit disabled>Pateikti užklausą</button>';
    html += '</div>';
    return html;
  }

  // FR-4.1: local date helper avoids UTC midnight rollover (Lithuania is UTC+2/+3)
  function buildDatePicker() {
    const days = [];
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    for (let i = 0; i < 4; i++) {
      const iso = localIso(d);
      const label = d.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', weekday: 'short' });
      days.push('<button type="button" class="chat-option-btn" data-chat-option="' + escapeHtml(iso) + '">' + escapeHtml(label) + '</button>');
      d.setDate(d.getDate() + 7);
    }
    const nowIso = escapeHtml(localIso(now));
    let html = '<div class="chat-options">' + days.join('') + '</div>';
    html += '<input type="date" class="chat-date-input" data-chat-date min="' + nowIso + '" placeholder="Kita data..." aria-label="Pasirinkti datą">';
    html += '<button type="button" class="chat-date-confirm" data-chat-date-confirm disabled>Patvirtinti datą</button>';
    return html;
  }

  function buildLocationOptions() {
    const locs = ['Tauragė', 'Šilalė', 'Jurbarkas', 'Pagėgiai', 'Raseiniai', 'Kelmė', 'Rietavas', 'Kitas miestas'];
    let html = '<div class="chat-options">';
    for (const loc of locs) {
      html += '<button type="button" class="chat-option-btn" data-chat-address-fill="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</button>';
    }
    html += '</div>';
    html += '<div class="chat-address-form">';
    html += '<input type="text" class="chat-address-input" data-chat-address placeholder="pvz. Tauragė, Žemaitės g. 15" aria-label="Adresas" aria-describedby="address-hint">';
    html += '<div id="address-hint" class="chat-address-hint">💡 Galite įvesti pilną adresą su gatve</div>';
    html += '<button type="button" class="chat-address-confirm" data-chat-address-confirm disabled>Patvirtinti vietą</button>';
    html += '</div>';
    return html;
  }

  function buildGuestCountOptions() {
    const ranges = [
      { label: 'Iki 6', value: 'Apie 6 vaikų' },
      { label: '7–12', value: 'Apie 10 vaikų' },
      { label: '13–20', value: 'Apie 15 vaikų' },
      { label: '21–50', value: 'Apie 35 vaikų' },
      { label: '50+', value: 'Daugiau nei 50 vaikų' }
    ];
    let html = '<div class="chat-options" data-step="guest-count">';
    for (const r of ranges) {
      html += '<button type="button" class="chat-option-btn" data-chat-option="' + escapeHtml(r.value) + '">' + escapeHtml(r.label) + '</button>';
    }
    html += '</div>';
    return html;
  }

  function buildGuestCountOptionsPublic() {
    const ranges = [
      { label: 'Apie 35 svečių', value: 'Apie 35 svečių' },
      { label: 'Apie 75 svečių', value: 'Apie 75 svečių' },
      { label: 'Apie 150 svečių', value: 'Apie 150 svečių' },
      { label: 'Apie 350 svečių', value: 'Apie 350 svečių' },
      { label: 'Apie 700 svečių', value: 'Apie 700 svečių' }
    ];
    let html = '<div class="chat-options" data-step="guest-count">';
    for (const r of ranges) {
      html += '<button type="button" class="chat-option-btn" data-chat-option="' + escapeHtml(r.value) + '">' + escapeHtml(r.label) + '</button>';
    }
    html += '</div>';
    return html;
  }

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
      html += '<button type="button" class="chat-option-btn chat-menu-btn" data-chat-option="' + escapeHtml(item.value) + '">' + escapeHtml(item.label) + '</button>';
    }
    html += '</div></div>';
    return html;
  }

  function buildQuickReplies(buttons) {
    if (!buttons || !buttons.length) return '';
    let html = '<div class="chat-quick-replies">';
    for (const btn of buttons) {
      const label = typeof btn === 'string' ? btn : btn.label;
      const value = typeof btn === 'string' ? btn : (btn.value || btn.label);
      const isMenu = value === 'Pagrindinis meniu';
      const btnClass = isMenu ? 'chat-option-btn chat-quick-reply-menu' : 'chat-option-btn';
      html += '<button type="button" class="' + btnClass + '" data-chat-option="' + escapeHtml(value) + '">' + escapeHtml(label) + '</button>';
    }
    html += '</div>';
    return html;
  }

  function buildBookingConfirm(jsonStr) {
    let data;
    try { data = JSON.parse(jsonStr); } catch (e) { data = {}; }
    let html = '<div class="booking-confirm">';
    html += '<h4>✅ Užklausa pateikta!</h4>';
    if (data.group_type) html += '<p><strong>Tipas:</strong> ' + escapeHtml(data.group_type) + '</p>';
    if (data.date) html += '<p><strong>Data:</strong> ' + escapeHtml(data.date) + '</p>';
    if (data.location) html += '<p><strong>Vieta:</strong> ' + escapeHtml(data.location) + '</p>';
    if (data.address) html += '<p><strong>Adresas:</strong> ' + escapeHtml(data.address) + '</p>';
    if (data.event_type) html += '<p><strong>Renginys:</strong> ' + escapeHtml(data.event_type) + '</p>';
    if (data.guest_count) html += '<p><strong>Svečių:</strong> ' + escapeHtml(data.guest_count) + '</p>';
    if (data.contact_name) html += '<p><strong>Kontaktas:</strong> ' + escapeHtml(data.contact_name) + '</p>';
    if (data.contact_phone) html += '<p><strong>Telefonas:</strong> ' + escapeHtml(data.contact_phone) + '</p>';
    if (data.trampoline_preference || data.trampoline) html += '<p><strong>Batutas:</strong> ' + escapeHtml(data.trampoline_preference || data.trampoline) + '</p>';
    if (data.addons) html += '<p><strong>Papildomos pramogos:</strong> ' + escapeHtml(data.addons) + '</p>';
    if (data.dimensions) html += '<p><strong>Matmenys:</strong> ' + escapeHtml(data.dimensions) + '</p>';
    if (data.colors) html += '<p><strong>Spalvos:</strong> ' + escapeHtml(data.colors) + '</p>';
    if (data.characters) html += '<p><strong>Personažai:</strong> ' + escapeHtml(data.characters) + '</p>';
    if (data.email) html += '<p><strong>El. paštas:</strong> ' + escapeHtml(data.email) + '</p>';
    // FR-6.1: Out-of-hours qualifier
    if (isOutOfHours()) {
      html += '<p class="booking-confirm-hours">⏰ Užklausa bus apdorota artimiausiu metu (darbo laikas: 8:00–21:00 kasdien)</p>';
    }
    html += '</div>';
    return html;
  }

  function buildProgressBar(currentStep, totalSteps) {
    const total = totalSteps || 3;
    let html = '<div class="booking-progress">';
    for (let i = 1; i <= total; i++) {
      const cls = i < currentStep ? 'done' : (i === currentStep ? 'current' : '');
      html += '<div class="bp-step' + (cls ? ' ' + cls : '') + '"></div>';
    }
    html += '</div>';
    return html;
  }


  function enrichResponse(response) {
    if (!response || !response.trim()) {
      return 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt';
    }

    // Idempotency: skip if already enriched
    if (response.startsWith('{{HTML}}')) {
      return response;
    }

    // Check for markers and replace
    const markers = [
      { pattern: /\[DATE_PICKER\]/g, fn: () => buildProgressBar(1) + buildDatePicker() },
      { pattern: /\[GUEST_COUNT\]/g, fn: () => buildProgressBar(2) + buildGuestCountOptions() },
      { pattern: /\[GUEST_COUNT_PUBLIC\]/g, fn: () => buildProgressBar(2) + buildGuestCountOptionsPublic() },
      { pattern: /\[MAIN_MENU\]/g, fn: () => buildMainMenu() },
      { pattern: /\[ADDON_UPSELL\]/g, fn: () => buildAddonUpsell() },
      { pattern: /\[PURCHASE_SUBMENU\]/g, fn: () => buildPurchaseSubmenu() },
      { pattern: /\[PURCHASE_EMAIL_INPUT\]/g, fn: () => buildPurchaseEmailInput() },
      { pattern: /\[PURCHASE_CUSTOM_FORM\]/g, fn: () => buildPurchaseCustomForm() },
      { pattern: /\[LOCATION_OPTIONS\]/g, fn: () => buildLocationOptions() },
      { pattern: /\[HUMAN_HANDOFF\]/g, fn: () => '<div class="chat-handoff-notice">Šį klausimą geriau išspręs mūsų komanda tiesiogiai.<br><br>📞 <strong>+370 648 803 88</strong><br>✉️ <strong>info@batutynas.lt</strong><br>🕐 Darbo laikas: <strong>8:00–21:00</strong></div>' }
    ];

    let hasMarker = false;
    let enriched = escapeHtml(response);

    for (const m of markers) {
      const before = enriched;
      enriched = enriched.replace(m.pattern, m.fn);
      if (enriched !== before) hasMarker = true;
    }

    // Handle MENU_GROUP_BIRTHDAY with guest count
    const birthdayBefore = enriched;
    enriched = enriched.replace(/\[MENU_GROUP_BIRTHDAY(?::(\d+))?\]/g, function(match, countStr) {
      const count = countStr ? parseInt(countStr) : null;
      return buildProgressBar(3, 3) + buildGroupBirthdayEquipment(count);
    });
    if (enriched !== birthdayBefore) hasMarker = true;

    // Handle MENU_GROUP_PUBLIC with guest count
    const publicBefore = enriched;
    enriched = enriched.replace(/\[MENU_GROUP_PUBLIC(?::(\d+))?\]/g, function(match, countStr) {
      const count = countStr ? parseInt(countStr) : null;
      return buildProgressBar(3, 3) + buildGroupPublicEquipment(count);
    });
    if (enriched !== publicBefore) hasMarker = true;

    // Handle MENU_GROUP_PARTY
    const partyBefore = enriched;
    enriched = enriched.replace(/\[MENU_GROUP_PARTY\]/g, function() {
      return buildProgressBar(3, 3) + buildGroupPartyEquipment();
    });
    if (enriched !== partyBefore) hasMarker = true;

    // Handle BOOKING_CONFIRM separately (has capture group)
    // Regex supports nested braces via: \{[^}]*(?:\{[^}]*\}[^}]*)*\}
    const confirmBefore = enriched;
    enriched = enriched.replace(/\[BOOKING_CONFIRM:(\{[^}]*(?:\{[^}]*\}[^}]*)*\})\]/g, function(match, jsonStr) {
      // Un-escape HTML entities that escapeHtml applied before marker processing
      var decoded = jsonStr.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      // FIX: Send structured booking data to real webhook for DB persistence
      try {
        var bookingObj = JSON.parse(decoded);
        _submitBookingToWebhook(bookingObj);
      } catch(e) { /* parse failed — non-critical */ }
      return buildBookingConfirm(decoded);
    });
    if (enriched !== confirmBefore) hasMarker = true;

    // FR-3.2: Catch residual BOOKING_CONFIRM markers that the primary regex missed (malformed JSON)
    const confirmResidual = enriched;
    enriched = enriched.replace(/\[BOOKING_CONFIRM:[^\]]*\]/g, function() {
      return buildBookingConfirm('{}');
    });
    if (enriched !== confirmResidual) hasMarker = true;

    // FR-3.1: Strip any unrecognized markers so raw [MARKER_NAME] text never leaks to user
    enriched = enriched.replace(/\[[A-Z][A-Z0-9_]*(?::[^\]]*?)?\]/g, '');

    // Contextual quick replies (always appended)
    const hadDatePicker = enriched.includes('chat-date-input');
    const hadLocationBtns = enriched.includes('chat-address-form');
    const hadGuestCount = enriched.includes('data-step="guest-count"');
    const hadBookingConfirm = enriched.includes('booking-confirm');
    const hadMainMenu = enriched.includes('chat-main-menu');
    const hadAddonUpsell = enriched.includes('chat-addon-continue');
    const isBookingStep = hadDatePicker || hadLocationBtns || hadGuestCount || hadAddonUpsell;

    let quickReplies = [];

    if (hadBookingConfirm) {
      quickReplies = [
        { label: '🔁 Užsakyti dar vieną', value: 'Noriu užsakyti dar vieną batutą' },
        { label: '🏠 Pradžia', value: 'Pagrindinis meniu' }
      ];
    } else if (isBookingStep) {
      quickReplies = [
        { label: 'Atšaukti', value: 'Pagrindinis meniu' }
      ];
    } else if (!hadMainMenu) {
      quickReplies = [
        { label: 'Pagrindinis meniu', value: 'Pagrindinis meniu' }
      ];
    }

    const quickHtml = buildQuickReplies(quickReplies);

    // FR-3.3: If enriched is empty after marker stripping, show fallback
    if (!enriched.trim() && !quickHtml) {
      return 'Atsiprašome, šiuo metu negaliu atsakyti. Susisiekite tiesiogiai: +370 648 803 88 arba info@batutynas.lt';
    }

    // Convert to HTML if we have markers or quick replies
    if (hasMarker || quickHtml) {
      enriched = enriched.replace(/\\n/g, '\n');
      enriched = enriched.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      enriched = enriched.replace(/\n/g, '<br>');
      enriched = '{{HTML}}<div class="chat-products">' + enriched + quickHtml + '</div>';
    }

    return enriched;
  }

  // Submit structured booking data to real webhook
  var _lastBookingHash = (function() { try { return sessionStorage.getItem('_bk_hash') || ''; } catch(e) { return ''; } })();
  function _submitBookingToWebhook(bookingObj) {
    var hash = JSON.stringify(bookingObj);
    if (hash === _lastBookingHash) { return; }
    _lastBookingHash = hash;
    try { sessionStorage.setItem('_bk_hash', hash); } catch(e) {}
    var payload = {
      group_type: bookingObj.group_type || 'rental',
      date: bookingObj.date || '',
      location: bookingObj.location || '',
      address: bookingObj.address || '',
      event_type: bookingObj.event_type || '',
      guest_count: bookingObj.guest_count || '',
      contact_name: bookingObj.contact_name || '',
      contact_phone: bookingObj.contact_phone || '',
      trampoline_preference: bookingObj.trampoline || bookingObj.trampoline_preference || '',
      addons: bookingObj.addons || '',
      notes: bookingObj.notes || '',
      request_type: 'booking'
    };
    var ac = new AbortController();
    var tid = setTimeout(function() { ac.abort(); }, 15000);
    _realFetch('https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-booking-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal
    }).then(function() {}).catch(function() {}).finally(function() { clearTimeout(tid); });
  }

  // Production fetch interceptor — enrich real AI responses
  var _webhookUrl = document.currentScript && document.currentScript.getAttribute("data-webhook")
    || "https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-widget-chat";
  window.fetch = function(url, opts) {
    if (typeof url === "string" && url === _webhookUrl) {
      return _realFetch.apply(this, arguments).then(function(res) {
        return res.clone().json().then(function(data) {
          var raw = data.response || data.output || data.text || "";
          var enriched = enrichResponse(raw);
          var enrichedData = { output: enriched, session_id: data.session_id || "" };
          return new Response(JSON.stringify(enrichedData), {
            status: 200, headers: { "Content-Type": "application/json" }
          });
        }).catch(function() { return res; });
      });
    }
    return _realFetch.apply(this, arguments);
  };
})();
