#!/usr/bin/env python3
"""
Build Telegram Bot V3 — Executive Assistant workflow.
Reads/writes via Calendar Bridge API (Google Calendar source of truth).

Generates: telegram-bot-v3-workflow.json

Commands:
  /siandien, /today         — Today's bookings
  /rytoj, /tomorrow         — Tomorrow's bookings
  /savaite, /week           — This week's bookings
  /laisvi [date], /available— Equipment availability
  /stats, /statistika       — Month stats
  /surask [query], /search  — Search bookings
  /perkelk [id] [date]      — Move booking (conflict check)
  /pratesek [id] [days]     — Extend to multi-day
  /atsaukti [id]            — Cancel booking
  Voice message             — Query OR create booking
"""

import json, uuid, os

# ── Credentials ──────────────────────────────────────────────────────────────

TELEGRAM_CRED = {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}
GROQ_CRED     = {"id": "yf0G3FBiIj8uxM4N", "name": "Groq Whisper API"}
XAI_CRED      = {"id": "3o4JPVqz73RdiO0Q", "name": "xAI Grok API"}

# IMPORTANT: Set BATUTYNAS_BOT_TOKEN env var. Rotate token if repo goes public.
BOT_TOKEN = os.environ.get('BATUTYNAS_BOT_TOKEN', '__TELEGRAM_BOT_TOKEN__')

# ── Calendar Bridge API URLs ─────────────────────────────────────────────────

API_BASE        = "https://n8n-n8n.0uvai5.easypanel.host/webhook"
API_DASHBOARD   = f"{API_BASE}/batutynas-dashboard-v2"
API_AVAILABILITY = f"{API_BASE}/batutynas-availability"
API_CREATE      = f"{API_BASE}/batutynas-calendar-create"
API_UPDATE      = f"{API_BASE}/batutynas-calendar-update"
API_DELETE      = f"{API_BASE}/batutynas-calendar-delete"
API_NEXT_FREE   = f"{API_BASE}/batutynas-next-free"

# ── Equipment list (for voice extraction prompt) ─────────────────────────────

EQUIPMENT_NAMES = [
    "Fantazijų parkas", "Džiumandži parkas", "Giga ruožas", "Mega ruožas",
    "Mega Rocket", "Mega Ufonautai", "Mega Waikiki", "Monstrai",
    "Chameleonas", "Candy Pop", "Aštuonkojis", "Vienaragiai",
    "Pilis mažiesiems", "Milžiniškas Dart", "Kamuolių medžioklė", "Rodeo bulius"
]

ADDON_NAMES = [
    "Cukraus vata", "Popcorn", "Šerbetas", "Putų šou",
    "Disco paviljonas", "JBL kolonėlė", "VR sistema",
    "Burbulų mašina", "Instax fotoaparatas", "Sumo kostiumai"
]

# ══════════════════════════════════════════════════════════════════════════════
# CODE BLOCKS
# ══════════════════════════════════════════════════════════════════════════════

CLASSIFY_CODE = r"""
// Webhook wraps Telegram payload in body
const raw = $input.first().json;
const update = raw.body || raw;

// Callback query (inline keyboard press)
if (update.callback_query) {
  const cb = update.callback_query;
  return [{ json: {
    msgType: 'callback',
    callbackData: cb.data || '',
    callbackQueryId: cb.id,
    chatId: String(cb.message?.chat?.id || ''),
    messageId: cb.message?.message_id
  }}];
}

const message = update.message || {};
const chatId = String(message.chat?.id || '');

// Voice message
if (message.voice || message.audio) {
  const voice = message.voice || message.audio;
  return [{ json: {
    msgType: 'voice',
    chatId,
    fileId: voice.file_id,
    duration: voice.duration || 0
  }}];
}

// Text message
return [{ json: {
  msgType: 'text',
  chatId,
  text: (message.text || '').trim()
}}];
""".strip()

# ── Parse Intent (maps text → intent + API call parameters) ──────────────────

PARSE_INTENT_CODE = r"""
const item = $input.first().json;
const text = (item.text || '').trim();
const chatId = item.chatId || '';

if (!text || !chatId) {
  return [{ json: { intent: 'ignore', chatId, apiType: 'none' } }];
}

let intent = 'unknown';
let args = {};
let apiType = 'none';  // 'fetch_dashboard', 'fetch_availability', 'action_update', 'action_delete', 'none'
let apiUrl = '';
let apiBody = {};

const cleanText = text.replace(/@[A-Za-z_]+bot/i, '').trim();
const parts = cleanText.split(/\s+/);
const cmd = parts[0]?.toLowerCase() || '';
const arg1 = parts[1] || '';
const arg2 = parts[2] || '';
const lowerText = cleanText.toLowerCase();

// Helper: parse Lithuanian date like "06-15", "2026-06-15", "birzelio 6", "rytoj"
function parseDate(str) {
  const s = str.toLowerCase().trim();
  const now = new Date();

  if (/^(siandien|šiandien|šiandie)$/.test(s)) return now.toISOString().substring(0, 10);
  if (/^(rytoj|ryt)$/.test(s)) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    return t.toISOString().substring(0, 10);
  }
  if (/^(poryt|porytoj)$/.test(s)) {
    const t = new Date(now); t.setDate(t.getDate() + 2);
    return t.toISOString().substring(0, 10);
  }

  // ISO date: 2026-06-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Short date: 06-15 or 06.15
  const shortMatch = s.match(/^(\d{1,2})[-.](\d{1,2})$/);
  if (shortMatch) {
    const mm = shortMatch[1].padStart(2, '0');
    const dd = shortMatch[2].padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  // Lithuanian month names (genitive form)
  const LT_MONTHS = {
    'sausio':1,'vasario':2,'kovo':3,'balandzio':4,'balandžio':4,
    'gegužės':5,'geguzes':5,'birželio':6,'birzelio':6,
    'liepos':7,'rugpjūčio':8,'rugpjucio':8,'rugsėjo':9,'rugsejo':9,
    'spalio':10,'lapkričio':11,'lapkricio':11,'gruodžio':12,'gruodzio':12
  };
  const ltMatch = s.match(/^([a-ząčęėįšųūž]+)\s+(\d{1,2})$/);
  if (ltMatch && LT_MONTHS[ltMatch[1]]) {
    const mm = String(LT_MONTHS[ltMatch[1]]).padStart(2,'0');
    const dd = ltMatch[2].padStart(2,'0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  return null;
}

const today = new Date().toISOString().substring(0, 10);
const now = new Date();

// === COMMAND PARSING ===
if (cleanText.startsWith('/')) {
  switch(cmd) {
    case '/start': case '/help': case '/pagalba':
      intent = 'help'; break;

    case '/today': case '/siandien':
      intent = 'today';
      apiType = 'fetch_dashboard';
      apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
      args.filterDate = today;
      break;

    case '/tomorrow': case '/rytoj': {
      intent = 'tomorrow';
      const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
      const tmrwStr = tmrw.toISOString().substring(0, 10);
      apiType = 'fetch_dashboard';
      apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${tmrw.getFullYear()}&month=${tmrw.getMonth() + 1}`;
      args.filterDate = tmrwStr;
      break;
    }

    case '/week': case '/savaite': {
      intent = 'week';
      apiType = 'fetch_dashboard';
      apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
      const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 6);
      args.filterDateFrom = today;
      args.filterDateTo = weekEnd.toISOString().substring(0, 10);
      // Cross-month detection: if week end is in different month, fetch both
      if (weekEnd.getMonth() !== now.getMonth() || weekEnd.getFullYear() !== now.getFullYear()) {
        args.crossMonth = true;
        args.secondApiUrl = '""" + API_DASHBOARD + r"""' + `?year=${weekEnd.getFullYear()}&month=${weekEnd.getMonth() + 1}`;
      }
      break;
    }

    case '/available': case '/laisvi': {
      intent = 'available';
      const dateArg = arg1 ? parseDate(arg1) : today;
      apiType = 'fetch_availability';
      apiUrl = '""" + API_AVAILABILITY + r"""' + `?date=${dateArg || today}`;
      args.date = dateArg || today;
      break;
    }

    case '/stats': case '/statistika':
      intent = 'stats';
      apiType = 'fetch_dashboard';
      apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
      break;

    case '/search': case '/surask': case '/rask': {
      intent = 'search';
      const query = parts.slice(1).join(' ');
      if (!query) {
        intent = 'error'; args.msg = '⚠️ Nurodykite paieškos žodį, pvz: /surask Rita';
        break;
      }
      apiType = 'fetch_dashboard';
      apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
      args.searchQuery = query.toLowerCase();
      break;
    }

    case '/cancel': case '/atsaukti': {
      if (!arg1) {
        intent = 'error'; args.msg = '⚠️ Nurodykite event ID, pvz: /atsaukti abc123';
        break;
      }
      // Support: /atsaukti <id> force — to force-delete manual events
      const forceDelete = (arg2 || '').toLowerCase() === 'force';
      intent = 'cancel';
      apiType = 'action_delete';
      apiUrl = '""" + API_DELETE + r"""';
      apiBody = { event_id: arg1, force: forceDelete };
      break;
    }

    case '/nauja': case '/naujas': case '/new': {
      // Format: /nauja <equipment> <name> <date> [price] [phone] [location]
      const rawArgs = parts.slice(1);
      if (rawArgs.length < 3) {
        intent = 'error';
        args.msg = '⚠️ Formatas: /nauja &lt;įranga&gt; &lt;vardas&gt; &lt;data&gt; [kaina] [tel] [vietovė]\nPvz: /nauja CandyPop Rita 06-15 185';
        break;
      }

      // Parse arguments by pattern matching
      let eqName = null, custName = null, dateStr = null, price = null, phone = null, location = null;

      for (const a of rawArgs) {
        const parsedDate = parseDate(a);
        if (parsedDate && !dateStr) { dateStr = parsedDate; continue; }
        if (/^\+?\d{8,}$/.test(a.replace(/[\s-]/g, '')) && !phone) { phone = a; continue; }
        if (/^\d{2,4}$/.test(a) && parseInt(a) < 5000 && !price) { price = parseInt(a); continue; }
        if (!eqName) { eqName = a; continue; }
        if (!custName) { custName = a; continue; }
        if (!location) { location = a; continue; }
        // Extra words append to location
        if (location) { location += ' ' + a; }
      }

      if (!eqName || !dateStr) {
        intent = 'error';
        args.msg = '⚠️ Neatpažinta įranga arba data.\nPvz: /nauja CandyPop Rita 06-15 185';
        break;
      }

      intent = 'quick_create';
      apiType = 'action_create';
      apiUrl = '""" + API_CREATE + r"""';
      apiBody = {
        equipment: eqName,
        date: dateStr,
        customer_name: custName || 'Klientas',
        customer_phone: phone || null,
        delivery_address: location || null,
        price: price || null
      };
      break;
    }

    case '/kada': case '/laisva': {
      const equipQuery = parts.slice(1).join(' ');
      if (!equipQuery) {
        intent = 'error'; args.msg = '⚠️ Nurodykite įrangą: /kada Candy Pop';
        break;
      }
      intent = 'next_free';
      apiType = 'fetch_next_free';
      apiUrl = '""" + API_NEXT_FREE + r"""' + `?equipment=${encodeURIComponent(equipQuery)}&days=30`;
      args.equipQuery = equipQuery;
      break;
    }

    default:
      intent = 'unknown';
  }
} else {
  // === NATURAL LANGUAGE (Lithuanian) ===
  if (/\b(siandien|šiandien|šiandie|kas siandien|kas šiandien)\b/i.test(lowerText)) {
    intent = 'today';
    apiType = 'fetch_dashboard';
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
    args.filterDate = today;
  } else if (/\b(rytoj|ryt\b)/i.test(lowerText)) {
    intent = 'tomorrow';
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    apiType = 'fetch_dashboard';
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${tmrw.getFullYear()}&month=${tmrw.getMonth() + 1}`;
    args.filterDate = tmrw.toISOString().substring(0, 10);
  } else if (/(savait|savaite|savaitė|šią savaitę|sia savaite)/i.test(lowerText)) {
    intent = 'week';
    apiType = 'fetch_dashboard';
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 6);
    args.filterDateFrom = today;
    args.filterDateTo = weekEnd.toISOString().substring(0, 10);
    if (weekEnd.getMonth() !== now.getMonth() || weekEnd.getFullYear() !== now.getFullYear()) {
      args.crossMonth = true;
      args.secondApiUrl = '""" + API_DASHBOARD + r"""' + `?year=${weekEnd.getFullYear()}&month=${weekEnd.getMonth() + 1}`;
    }
  } else if (/(laisv|turimos|kiek laisv|kas laisva)/i.test(lowerText)) {
    intent = 'available';
    // Try to extract date from NL
    let nlDate = today;
    const dateMatch = lowerText.match(/(\d{1,2})[-.](\d{1,2})/);
    if (dateMatch) nlDate = `${now.getFullYear()}-${dateMatch[1].padStart(2,'0')}-${dateMatch[2].padStart(2,'0')}`;
    if (/rytoj/i.test(lowerText)) { const t = new Date(now); t.setDate(t.getDate()+1); nlDate = t.toISOString().substring(0,10); }
    apiType = 'fetch_availability';
    apiUrl = '""" + API_AVAILABILITY + r"""' + `?date=${nlDate}`;
    args.date = nlDate;
  } else if (/(statistik|apzvalga|apžvalga)/i.test(lowerText)) {
    intent = 'stats';
    apiType = 'fetch_dashboard';
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  } else if (/(pagalb|komand)/i.test(lowerText)) {
    intent = 'help';
  } else if (/(surask|rask|iesk|iešk|kur|koks|kokia)/i.test(lowerText)) {
    intent = 'search';
    apiType = 'fetch_dashboard';
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
    // Use the whole text as search query (remove trigger words)
    args.searchQuery = lowerText.replace(/(surask|rask|iesk|iešk|kur|koks|kokia)\s*/gi, '').trim();
  }
}

return [{ json: { intent, args, apiType, apiUrl, apiBody, chatId } }];
""".strip()

# ── Format Response (unified for all intents) ────────────────────────────────

FORMAT_RESPONSE_CODE = r"""
const parsed = $('Parse Intent').first().json;
const { intent, args, chatId, apiType } = parsed;
let data = {};

// Get API response — $input has data from whichever HTTP node fed us
if (apiType !== 'none') {
  try {
    data = $input.first().json;
  } catch(e) {
    data = {};
  }
}

let reply = '';
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const monthNames = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];

function fmtDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr + 'T00:00:00');
  return `${monthNames[d.getMonth()]} ${d.getDate()} (${dayNames[d.getDay()]})`;
}

function fmtBooking(b) {
  const equip = Array.isArray(b.equipment) && b.equipment.length > 0
    ? b.equipment.map(e => `${e.icon || '🎪'} ${e.name}`).join(', ')
    : (b.raw_summary || '?');

  let line = `📌 <b>${equip}</b>`;
  if (b.duration_days > 1) line += ` (${b.duration_days}d)`;
  line += '\n';
  if (b.customer_name) line += `   👤 ${b.customer_name}`;
  if (b.customer_phone) line += ` | 📞 ${b.customer_phone}`;
  if (b.customer_name || b.customer_phone) line += '\n';
  if (b.delivery_address) line += `   📍 ${b.delivery_address}\n`;
  if (b.price) line += `   💰 €${b.price}`;
  if (b.addons && b.addons.length > 0) line += ` + ${b.addons.join(', ')}`;
  if (b.price || (b.addons && b.addons.length > 0)) line += '\n';
  // Show event ID (shortened) for reference in commands
  if (b.calendarEventId) {
    const shortId = b.calendarEventId.substring(0, 8);
    line += `   🆔 <code>${shortId}</code>\n`;
  }
  return line;
}

switch(intent) {
  case 'help':
    reply = `🤖 <b>Batutynas Asistentas</b>\n\n` +
      `📋 <b>Peržiūra:</b>\n` +
      `/today — Šiandienos užsakymai\n` +
      `/tomorrow — Rytojaus užsakymai\n` +
      `/week — Savaitės užsakymai\n` +
      `/available [data] — Laisva įranga\n` +
      `/stats — Mėnesio statistika\n` +
      `/search &lt;žodis&gt; — Ieškoti užsakymo\n` +
      `/kada &lt;įranga&gt; — Laisvos datos\n\n` +
      `✏️ <b>Veiksmai:</b>\n` +
      `/nauja &lt;įranga&gt; &lt;vardas&gt; &lt;data&gt; — Sukurti\n` +
      `/cancel &lt;id&gt; — Atšaukti\n\n` +
      `🎙️ <b>Balsas:</b>\n` +
      `Atsiųskite balso žinutę!\n` +
      `• Klausimas → atsakys iškart\n` +
      `• Naujas užsakymas → sukurs kalendoriuje\n\n` +
      `💬 <b>Arba rašykite lietuviškai:</b>\n` +
      `"šiandien", "rytoj", "kas laisva?", "surask Rita"`;
    break;

  case 'today': case 'tomorrow': {
    const bookings = (data.bookings || []).filter(b => {
      if (!args.filterDate) return true;
      return b.event_date === args.filterDate;
    });
    const label = intent === 'today' ? '📅 Šiandien' : '📅 Rytoj';
    const dateLabel = args.filterDate ? ` (${fmtDate(args.filterDate)})` : '';
    if (bookings.length === 0) {
      reply = `${label}${dateLabel}: Užsakymų nėra 🎉`;
    } else {
      reply = `${label}${dateLabel} — ${bookings.length} užs.:\n\n`;
      bookings.forEach(b => { reply += fmtBooking(b) + '\n'; });
    }
    break;
  }

  case 'week': {
    const from = args.filterDateFrom;
    const to = args.filterDateTo;
    const bookings = (data.bookings || []).filter(b => {
      if (!from || !to) return true;
      return b.event_date >= from && b.event_date <= to;
    });
    if (bookings.length === 0) {
      reply = `📅 Ši savaitė: Užsakymų nėra 🎉`;
    } else {
      reply = `📅 Ši savaitė — ${bookings.length} užs.:\n`;
      // Group by date
      const byDate = {};
      bookings.forEach(b => {
        const d = (b.event_date || '').substring(0, 10);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(b);
      });
      for (const [date, bks] of Object.entries(byDate).sort()) {
        reply += `\n📆 <b>${fmtDate(date)}</b>\n`;
        bks.forEach(b => { reply += fmtBooking(b); });
      }
    }
    break;
  }

  case 'available': {
    const avail = data.available || [];
    const booked = data.booked || [];
    const dateLabel = args.date ? fmtDate(args.date) : 'šiandien';
    reply = `🎪 <b>Įranga — ${dateLabel}</b>\n\n`;
    if (avail.length === 0) {
      reply += `⚠️ Visa įranga užimta!\n`;
    } else {
      reply += `✅ <b>Laisva (${avail.length}):</b>\n`;
      avail.forEach(e => { reply += `  ${e.icon || '🎪'} ${e.name}\n`; });
    }
    if (booked.length > 0) {
      reply += `\n🔒 <b>Užimta (${booked.length}):</b>\n`;
      booked.forEach(e => {
        reply += `  ${e.icon || '🎪'} ${e.name}`;
        if (e.customer) reply += ` → ${e.customer}`;
        reply += '\n';
      });
    }
    break;
  }

  case 'stats': {
    const stats = data.stats || {};
    const now = new Date();
    reply = `📊 <b>${monthNames[now.getMonth()]} statistika</b>\n\n` +
      `📅 Šį mėnesį: ${stats.total_bookings || 0} užs.\n` +
      `💰 Pajamos: €${stats.total_revenue || 0}\n` +
      `📈 Vid. kaina: €${stats.avg_price || 0}\n` +
      `🎪 Populiariausia: ${stats.top_equipment || '—'}\n`;
    if (stats.busiest_date) reply += `🔥 Daugiausiai: ${fmtDate(stats.busiest_date)}\n`;
    break;
  }

  case 'search': {
    const query = args.searchQuery || '';
    const bookings = (data.bookings || []).filter(b => {
      const text = [
        b.customer_name, b.customer_phone, b.delivery_address,
        b.raw_summary, (b.equipment || []).map(e => e.name).join(' ')
      ].join(' ').toLowerCase();
      return text.includes(query);
    });
    if (bookings.length === 0) {
      reply = `🔍 Paieška "${query}" — nieko nerasta`;
    } else {
      reply = `🔍 Paieška "${query}" — ${bookings.length} rezultatai:\n\n`;
      bookings.slice(0, 10).forEach(b => {
        reply += `📆 ${fmtDate(b.event_date)}\n` + fmtBooking(b) + '\n';
      });
      if (bookings.length > 10) reply += `\n... ir dar ${bookings.length - 10}`;
    }
    break;
  }

  case 'cancel': {
    if (data.blocked) {
      // Manual event — blocked without force flag
      const evId = parsed.apiBody?.event_id || '';
      reply = `⚠️ <b>Negalima ištrinti</b>\n` +
        `📌 Šis įvykis sukurtas rankiniu būdu:\n` +
        `<i>${data.event_summary || '?'}</i>`;
      if (data.event_date) reply += `\n📅 ${fmtDate(data.event_date)}`;
      reply += `\n\n💡 Jei tikrai norite ištrinti:\n` +
        `<code>/atsaukti ${evId} force</code>`;
    } else if (data.error) {
      reply = `⚠️ ${data.error}`;
    } else {
      reply = `❌ <b>Atšaukta</b>\n📌 ${data.summary || 'Užsakymas pašalintas iš kalendoriaus'}`;
    }
    break;
  }

  case 'quick_create': {
    if (data.conflict) {
      reply = `⚠️ <b>Konfliktas!</b> ${data.conflict_equipment || parsed.apiBody?.equipment || 'Įranga'} jau užimta ${fmtDate(parsed.apiBody?.date || '')}.\n` +
        `Naudokite /kada ${parsed.apiBody?.equipment || ''} rasti laisvą datą.`;
    } else if (data.error) {
      reply = `⚠️ ${data.error}`;
    } else {
      const b = parsed.apiBody || {};
      reply = `✅ <b>Užsakymas sukurtas!</b>\n\n`;
      if (b.equipment) reply += `🎪 ${b.equipment}\n`;
      if (b.customer_name) reply += `👤 ${b.customer_name}\n`;
      if (b.date) reply += `📅 ${fmtDate(b.date)}\n`;
      if (b.delivery_address) reply += `📍 ${b.delivery_address}\n`;
      if (b.price) reply += `💰 €${b.price}\n`;
      if (data.eventId || data.event_id) reply += `\n🔑 ID: <code>${data.eventId || data.event_id}</code>`;
    }
    break;
  }

  case 'next_free': {
    const freeDates = data.freeDates || [];
    const eqName = data.equipment || args.equipQuery || '?';
    const icon = data.equipmentIcon || '🎪';
    if (data.error || data.message) {
      reply = `${icon} <b>${eqName}</b>: ${data.message || data.error}`;
    } else if (freeDates.length === 0) {
      reply = `${icon} <b>${eqName}</b>: Artimiausiomis ${data.searchedDays || 30} dienų nėra laisvų datų`;
    } else {
      reply = `${icon} <b>${eqName}</b> — laisvos datos:\n\n`;
      freeDates.forEach(d => {
        reply += `  📅 ${d.date} (${d.weekday})\n`;
      });
      reply += `\n💡 Užsakyti: /nauja ${eqName} &lt;vardas&gt; &lt;data&gt; [kaina]`;
    }
    break;
  }

  case 'error':
    reply = args.msg || '⚠️ Klaida';
    break;

  case 'ignore':
    reply = '';
    break;

  default:
    reply = '🤔 Nesupratau. Naudokite /help arba rašykite lietuviškai.';
    break;
}

return [{ json: { reply, shouldSend: reply.length > 0, chatId } }];
""".strip()

# ── Voice: xAI Grok extraction system prompt ─────────────────────────────────

VOICE_SYSTEM_PROMPT = f"""Tu esi Batutynas.lt batutų nuomos asistento AI. Išanalizuok lietuvišką balso žinutės transkripciją.

NUSTATYK ar tai:
A) KLAUSIMAS/UŽKLAUSA — vartotojas nori sužinoti informaciją (kas šiandien, kas laisva, kur Rita, statistika ir pan.)
B) NAUJAS UŽSAKYMAS — vartotojas diktuoja užsakymo duomenis (klientas, data, įranga, kaina ir pan.)

ĮRANGOS SĄRAŠAS: {', '.join(EQUIPMENT_NAMES)}
PRIEDAI: {', '.join(ADDON_NAMES)}

Atsakyk JSON formatu:

Jei KLAUSIMAS:
{{"type": "query", "intent": "today|tomorrow|week|available|search|stats", "query": "paieškos tekstas jei reikia", "date": "YYYY-MM-DD jei nurodyta"}}

Jei NAUJAS UŽSAKYMAS:
{{"type": "create", "customer_name": "...", "customer_phone": "...", "event_date": "YYYY-MM-DD", "delivery_address": "...", "equipment": "tikslus pavadinimas iš sąrašo", "addons": ["priedas1"], "price": skaičius, "notes": "papildoma info"}}

Nežinomus laukus palik null. Data formatas visada YYYY-MM-DD.
Jei negali nustatyti — grąžink: {{"type": "unknown", "text": "originali transkripcija"}}"""

VOICE_EXTRACT_USER_PROMPT = "Transkripcija: \"{transcript}\""

# ── Voice: Route voice result ─────────────────────────────────────────────────

ROUTE_VOICE_CODE = r"""
const transcript = $('Transcribe Audio').first().json.text || '';
const chatId = $('Classify Message').first().json.chatId;
const extractResp = $input.first().json;

let content = '';
if (extractResp.choices && extractResp.choices[0]) {
  content = extractResp.choices[0].message?.content || '{}';
}

let parsed;
try {
  const cleaned = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  parsed = JSON.parse(cleaned);
} catch(e) {
  parsed = { type: 'unknown', text: transcript };
}

const type = parsed.type || 'unknown';
const now = new Date();
const today = now.toISOString().substring(0, 10);

if (type === 'query') {
  // Map to same format as Parse Intent output
  const intent = parsed.intent || 'unknown';
  let apiType = 'fetch_dashboard';
  let apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  let args = {};

  if (intent === 'available') {
    apiType = 'fetch_availability';
    const date = parsed.date || today;
    apiUrl = '""" + API_AVAILABILITY + r"""' + `?date=${date}`;
    args.date = date;
  } else if (intent === 'today') {
    args.filterDate = today;
  } else if (intent === 'tomorrow') {
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    args.filterDate = tmrw.toISOString().substring(0, 10);
    apiUrl = '""" + API_DASHBOARD + r"""' + `?year=${tmrw.getFullYear()}&month=${tmrw.getMonth() + 1}`;
  } else if (intent === 'search') {
    args.searchQuery = (parsed.query || '').toLowerCase();
  }

  return [{ json: {
    voiceType: 'query',
    intent, args, apiType, apiUrl, apiBody: {},
    chatId, transcript
  }}];
}

if (type === 'create') {
  // Voice booking creation
  return [{ json: {
    voiceType: 'create',
    chatId, transcript,
    booking: parsed,
    apiType: 'action_create',
    apiUrl: '""" + API_CREATE + r"""',
    apiBody: {
      equipment: parsed.equipment || '',
      customer_name: parsed.customer_name || '',
      customer_phone: parsed.customer_phone || '',
      date: parsed.event_date || '',
      location: parsed.delivery_address || '',
      price: parsed.price || 0,
      addons: parsed.addons || [],
      notes: parsed.notes || ''
    }
  }}];
}

// Unknown — send back transcript with apology
return [{ json: {
  voiceType: 'unknown',
  chatId, transcript,
  apiType: 'none'
}}];
""".strip()

# ── Voice: Format voice query result (reuses Format Response logic) ───────────

FORMAT_VOICE_QUERY_CODE = r"""
const voiceData = $('Route Voice Result').first().json;
const { intent, args, chatId, transcript } = voiceData;
let data = {};

try {
  data = $('Voice HTTP Request').first().json;
} catch(e) {
  data = {};
}

// Reuse same formatting logic as text Format Response
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const monthNames = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];

function fmtDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr + 'T00:00:00');
  return `${monthNames[d.getMonth()]} ${d.getDate()} (${dayNames[d.getDay()]})`;
}

function fmtBooking(b) {
  const equip = Array.isArray(b.equipment) && b.equipment.length > 0
    ? b.equipment.map(e => `${e.icon || '🎪'} ${e.name}`).join(', ')
    : (b.raw_summary || '?');
  let line = `📌 <b>${equip}</b>`;
  if (b.duration_days > 1) line += ` (${b.duration_days}d)`;
  line += '\n';
  if (b.customer_name) line += `   👤 ${b.customer_name}`;
  if (b.customer_phone) line += ` | 📞 ${b.customer_phone}`;
  if (b.customer_name || b.customer_phone) line += '\n';
  if (b.delivery_address) line += `   📍 ${b.delivery_address}\n`;
  if (b.price) line += `   💰 €${b.price}\n`;
  if (b.calendarEventId) line += `   🆔 <code>${b.calendarEventId.substring(0,8)}</code>\n`;
  return line;
}

let reply = `🎙️ <i>"${transcript.substring(0, 80)}${transcript.length > 80 ? '...' : ''}"</i>\n\n`;

// Same switch logic as text Format Response
if (intent === 'today' || intent === 'tomorrow') {
  const bookings = (data.bookings || []).filter(b => !args.filterDate || b.event_date === args.filterDate);
  const label = intent === 'today' ? '📅 Šiandien' : '📅 Rytoj';
  if (bookings.length === 0) {
    reply += `${label}: Užsakymų nėra 🎉`;
  } else {
    reply += `${label} — ${bookings.length} užs.:\n\n`;
    bookings.forEach(b => { reply += fmtBooking(b) + '\n'; });
  }
} else if (intent === 'week') {
  const bookings = (data.bookings || []).filter(b => {
    if (!args.filterDateFrom || !args.filterDateTo) return true;
    return b.event_date >= args.filterDateFrom && b.event_date <= args.filterDateTo;
  });
  reply += `📅 Ši savaitė — ${bookings.length} užs.:\n`;
  const byDate = {};
  bookings.forEach(b => { const d = (b.event_date||'').substring(0,10); if (!byDate[d]) byDate[d]=[]; byDate[d].push(b); });
  for (const [date, bks] of Object.entries(byDate).sort()) {
    reply += `\n📆 <b>${fmtDate(date)}</b>\n`;
    bks.forEach(b => { reply += fmtBooking(b); });
  }
} else if (intent === 'available') {
  const avail = data.available || [];
  const booked = data.booked || [];
  reply += `🎪 <b>Laisva (${avail.length}):</b>\n`;
  avail.forEach(e => { reply += `  ${e.icon||'🎪'} ${e.name}\n`; });
  if (booked.length > 0) {
    reply += `\n🔒 <b>Užimta (${booked.length}):</b>\n`;
    booked.forEach(e => { reply += `  ${e.icon||'🎪'} ${e.name}\n`; });
  }
} else if (intent === 'stats') {
  const stats = data.stats || {};
  const now = new Date();
  reply += `📊 <b>${monthNames[now.getMonth()]} statistika</b>\n` +
    `📅 Užsakymai: ${stats.total_bookings || 0}\n💰 Pajamos: €${stats.total_revenue || 0}`;
} else if (intent === 'search') {
  const query = args.searchQuery || '';
  const bookings = (data.bookings || []).filter(b => {
    const text = [b.customer_name, b.customer_phone, b.delivery_address, b.raw_summary].join(' ').toLowerCase();
    return text.includes(query);
  });
  if (bookings.length === 0) { reply += `🔍 "${query}" — nieko nerasta`; }
  else {
    reply += `🔍 "${query}" — ${bookings.length} rez.:\n\n`;
    bookings.slice(0,5).forEach(b => { reply += `📆 ${fmtDate(b.event_date)}\n` + fmtBooking(b) + '\n'; });
  }
} else if (intent === 'next_free') {
  const freeDates = data.freeDates || [];
  const eq = data.equipment || args.equipQuery;
  const icon = data.equipmentIcon || '🎪';
  if (data.message && !freeDates.length) {
    reply += `${icon} <b>${eq}</b>: ${data.message}`;
  } else if (!freeDates.length) {
    reply += `${icon} <b>${eq}</b>: Artimiausiomis 30 dienų nėra laisvų datų`;
  } else {
    reply += `${icon} <b>${eq}</b> — laisvos datos:\n\n`;
    freeDates.slice(0,8).forEach(fd => { reply += `📅 ${fd.date} (${fd.weekday})\n`; });
    reply += `\n💡 Užsakyti: /nauja ${eq} &lt;vardas&gt; &lt;data&gt; [kaina]`;
  }
} else {
  reply += '🤔 Nesupratau klausimo. Bandykite dar kartą arba naudokite /help';
}

return [{ json: { reply, shouldSend: true, chatId } }];
""".strip()

# ── Voice: Format create confirmation (inline keyboard) ──────────────────────

FORMAT_VOICE_CREATE_CODE = r"""
const voiceData = $('Route Voice Result').first().json;
const { chatId, transcript, booking } = voiceData;

let msg = `🎙️ <b>Naujas užsakymas</b>\n`;
msg += `────────────────────\n\n`;
if (booking.customer_name) msg += `👤 ${booking.customer_name}\n`;
if (booking.customer_phone) msg += `📞 ${booking.customer_phone}\n`;
if (booking.event_date) msg += `📅 ${booking.event_date}\n`;
if (booking.delivery_address) msg += `📍 ${booking.delivery_address}\n`;
if (booking.equipment) msg += `🎪 ${booking.equipment}\n`;
if (booking.addons && booking.addons.length > 0) msg += `➕ ${booking.addons.join(', ')}\n`;
if (booking.price) msg += `💰 €${booking.price}\n`;
if (booking.notes) msg += `📝 ${booking.notes}\n`;
msg += `\n💬 <i>"${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"</i>`;
msg += `\n\n✏️ <b>Patvirtinti užsakymą?</b>`;

// Persist booking data in n8n static data (survives between webhook executions)
const confirmId = Date.now().toString(36);
const store = $getWorkflowStaticData('global');
store[confirmId] = voiceData.apiBody;

// Prune entries older than 1 hour to prevent memory leaks
const nowMs = Date.now();
for (const key of Object.keys(store)) {
  if (key.length >= 7 && key.length <= 10) {
    const ts = parseInt(key, 36);
    if (!isNaN(ts) && nowMs - ts > 3600000) delete store[key];
  }
}

return [{ json: {
  chatId,
  confirmMessage: msg,
  confirmId,
  // Inline keyboard
  inlineKeyboard: [
    [
      { text: '✅ Patvirtinti', callback_data: `vc_ok:${confirmId}` },
      { text: '❌ Atšaukti', callback_data: `vc_no:${confirmId}` }
    ]
  ]
}}];
""".strip()

# ── Voice: Format unknown voice ──────────────────────────────────────────────

FORMAT_VOICE_UNKNOWN_CODE = r"""
const voiceData = $('Route Voice Result').first().json;
const { chatId, transcript } = voiceData;

const reply = `🎙️ <i>"${transcript.substring(0, 200)}${transcript.length > 200 ? '...' : ''}"</i>\n\n` +
  `🤔 Nesupratau. Pabandykite:\n` +
  `• Klausimą: "Kas šiandien?", "Kas laisva rytoj?"\n` +
  `• Užsakymą: "Candy Pop Rita Juskaitė Pagramantis 185 eurų birželio 6"`;

return [{ json: { reply, shouldSend: true, chatId } }];
""".strip()

# ── Callback: Process (for voice booking confirm/cancel) ──────────────────────

PROCESS_CALLBACK_V3_CODE = r"""
const item = $input.first().json;
const data = item.callbackData || '';
const chatId = item.chatId;
const callbackQueryId = item.callbackQueryId;

if (data.startsWith('vc_ok:')) {
  // Retrieve booking data from n8n static data store
  const confirmKey = data.split(':')[1];
  const store = $getWorkflowStaticData('global');
  const bookingData = (confirmKey && store[confirmKey]) ? store[confirmKey] : null;
  // Clean up after retrieval
  if (confirmKey && store[confirmKey]) delete store[confirmKey];

  return [{ json: {
    chatId, callbackQueryId,
    action: 'voice_confirm',
    callbackAnswer: bookingData ? '✅ Kuriamas...' : '⚠️ Pasibaigė galiojimas',
    bookingData
  }}];
}

if (data.startsWith('vc_no:')) {
  // Clean up stored data on cancel too
  const confirmKey = data.split(':')[1];
  const store = $getWorkflowStaticData('global');
  if (confirmKey && store[confirmKey]) delete store[confirmKey];

  return [{ json: {
    chatId, callbackQueryId,
    action: 'voice_cancel',
    callbackAnswer: '❌ Atšaukta'
  }}];
}

return [{ json: {
  chatId, callbackQueryId,
  action: 'unknown',
  callbackAnswer: '❓'
}}];
""".strip()

# ══════════════════════════════════════════════════════════════════════════════
# WORKFLOW BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def uid():
    return str(uuid.uuid4()).replace('-', '')[:20]

def pos(x, y):
    return [x, y]

nodes = []
connections = {}

def add_node(node):
    nodes.append(node)
    return node

def connect(from_name, to_name, from_idx=0, to_idx=0):
    if from_name not in connections:
        connections[from_name] = {"main": []}
    while len(connections[from_name]["main"]) <= from_idx:
        connections[from_name]["main"].append([])
    connections[from_name]["main"][from_idx].append({
        "node": to_name,
        "type": "main",
        "index": to_idx
    })

# ── 1. Telegram Webhook Entry ────────────────────────────────────────────────

add_node({
    "parameters": {
        "httpMethod": "POST",
        "path": "batutynas-telegram-v3",
        "responseMode": "lastNode",
        "options": {}
    },
    "id": uid(),
    "name": "Telegram Webhook",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 1,
    "position": pos(240, 400),
    "webhookId": "batutynas-telegram-v3"
})

# ── 2. Classify Message ─────────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": CLASSIFY_CODE},
    "id": uid(),
    "name": "Classify Message",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(460, 400)
})
connect("Telegram Webhook", "Classify Message")

# ── 3a. IF Is Text ───────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-text", "leftValue": "={{ $json.msgType }}", "rightValue": "text",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Text",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(680, 300)
})
connect("Classify Message", "IF Is Text")

# ── 3b. IF Is Voice ──────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-voice", "leftValue": "={{ $json.msgType }}", "rightValue": "voice",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Voice",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(680, 500)
})
connect("IF Is Text", "IF Is Voice", 1)  # false branch → check voice

# ── 3c. IF Is Callback ──────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-callback", "leftValue": "={{ $json.msgType }}", "rightValue": "callback",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Callback",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(680, 700)
})
connect("IF Is Voice", "IF Is Callback", 1)  # false branch → check callback

# ══════════════════════════════════════════════════════════════════════════════
# TEXT PATH (output 0 of Switch)
# ══════════════════════════════════════════════════════════════════════════════

# ── 4. Parse Intent ──────────────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": PARSE_INTENT_CODE},
    "id": uid(),
    "name": "Parse Intent",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(920, 200)
})
connect("IF Is Text", "Parse Intent", 0)  # true branch of IF Is Text

# ── 5a. IF Is Fetch ──────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-fetch", "leftValue": "={{ $json.apiType }}", "rightValue": "fetch_",
                 "operator": {"type": "string", "operation": "contains"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Fetch",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1140, 200)
})
connect("Parse Intent", "IF Is Fetch")

# ── 5b. IF Is Delete ────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-delete", "leftValue": "={{ $json.apiType }}", "rightValue": "action_delete",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Delete",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1140, 600)
})
connect("IF Is Fetch", "IF Is Delete", 1)  # false → check delete

# ── 5d. IF Is Create ───────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-create", "leftValue": "={{ $json.apiType }}", "rightValue": "action_create",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Create",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1140, 750)
})
connect("IF Is Delete", "IF Is Create", 1)  # false → check create
# false branch of IF Is Create = "none" type → goes to Format Response directly

# ── 6. HTTP GET (for fetch intents) ──────────────────────────────────────────

add_node({
    "parameters": {
        "method": "GET",
        "url": "={{ $json.apiUrl }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "HTTP Request",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1380, 100),
    "continueOnFail": True
})
connect("IF Is Fetch", "HTTP Request", 0)  # true branch

# ── 7. HTTP POST Delete ─────────────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "={{ $('Parse Intent').first().json.apiUrl }}",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Parse Intent').first().json.apiBody) }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "HTTP POST Delete",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1380, 400),
    "continueOnFail": True
})
connect("IF Is Delete", "HTTP POST Delete", 0)  # true branch

# ── 8b. HTTP POST Create ────────────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "={{ $('Parse Intent').first().json.apiUrl }}",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Parse Intent').first().json.apiBody) }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "HTTP POST Create",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1380, 550),
    "continueOnFail": True
})
connect("IF Is Create", "HTTP POST Create", 0)  # true branch

# ── 9. Merge all API results ─────────────────────────────────────────────────
# All HTTP paths + no_api path converge into Format Response

add_node({
    "parameters": {"jsCode": FORMAT_RESPONSE_CODE},
    "id": uid(),
    "name": "Format Response",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(1620, 200)
})
# ── 6b. IF Cross Month (for week spanning two months) ──────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-crossmonth", "leftValue": "={{ $('Parse Intent').first().json.args?.crossMonth }}", "rightValue": "true",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Cross Month",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1620, -30)
})
connect("HTTP Request", "IF Cross Month")

# ── 6c. HTTP Request 2 (second month for cross-month week) ────────────────

add_node({
    "parameters": {
        "method": "GET",
        "url": "={{ $('Parse Intent').first().json.args?.secondApiUrl }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "HTTP Request 2",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1860, -80),
    "continueOnFail": True
})
connect("IF Cross Month", "HTTP Request 2", 0)  # true → fetch second month

# ── 6d. Merge Month Data ──────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": r"""
// Merge bookings from both month responses for cross-month queries
const firstData = $('HTTP Request').first().json || {};
const secondData = $input.first().json || {};
const mergedBookings = [...(firstData.bookings || []), ...(secondData.bookings || [])];
// Deduplicate by event ID
const seen = new Set();
const unique = mergedBookings.filter(b => {
  const id = b.calendarEventId || b.id;
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
});
return [{ json: { ...firstData, bookings: unique } }];
"""},
    "id": uid(),
    "name": "Merge Month Data",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(2100, -80)
})
connect("HTTP Request 2", "Merge Month Data")
connect("Merge Month Data", "Format Response")
connect("IF Cross Month", "Format Response", 1)  # false → single month, proceed directly
connect("HTTP POST Delete", "Format Response")
connect("HTTP POST Create", "Format Response")
connect("IF Is Create", "Format Response", 1)  # false branch = 'none' type

# ── 10. IF Should Send guard (skip empty/ignored replies) ────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "combinator": "and",
            "conditions": [
                {
                    "id": uid(),
                    "leftValue": "={{ $json.shouldSend }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "true"}
                }
            ]
        },
        "options": {}
    },
    "id": uid(),
    "name": "IF Should Send",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": pos(1860, 200)
})
connect("Format Response", "IF Should Send")

# ── 10b. Send Reply ──────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.reply }}",
        "additionalFields": {
            "parse_mode": "HTML"
        }
    },
    "id": uid(),
    "name": "Send Reply",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(2100, 200),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("IF Should Send", "Send Reply", 0)  # true branch only

# ══════════════════════════════════════════════════════════════════════════════
# VOICE PATH (output 1 of Switch)
# ══════════════════════════════════════════════════════════════════════════════

# ── 11. Get Voice File URL ───────────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "GET",
        "url": f"=https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={{{{ $json.fileId }}}}",
        "options": {}
    },
    "id": uid(),
    "name": "Get File URL",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(920, 600)
})
connect("IF Is Voice", "Get File URL", 0)  # true branch of IF Is Voice

# ── 12. Transcribe Audio (Groq Whisper) ──────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "contentType": "multipart-form-data",
        "bodyParameters": {
            "parameters": [
                {"name": "model", "value": "whisper-large-v3-turbo"},
                {"name": "language", "value": "lt"},
                {"name": "file", "parameterType": "formBinaryData",
                 "inputDataFieldName": f"=https://api.telegram.org/file/bot{BOT_TOKEN}/{{{{ $json.result.file_path }}}}"}
            ]
        },
        "options": {"timeout": 30000}
    },
    "id": uid(),
    "name": "Transcribe Audio",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1140, 600),
    "credentials": {"httpHeaderAuth": GROQ_CRED}
})
connect("Get File URL", "Transcribe Audio")

# ── 13. Extract Intent (xAI Grok) ───────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "https://api.x.ai/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": '={"model":"grok-3-mini","messages":[{"role":"system","content":' + json.dumps(VOICE_SYSTEM_PROMPT) + '},{"role":"user","content":"Transkripcija: \\"{{ $json.text }}\\""}],"temperature":0.1}',
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "Extract Voice Intent",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1380, 600),
    "credentials": {"httpHeaderAuth": XAI_CRED}
})
connect("Transcribe Audio", "Extract Voice Intent")

# ── 14. Route Voice Result ───────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": ROUTE_VOICE_CODE},
    "id": uid(),
    "name": "Route Voice Result",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(1620, 600)
})
connect("Extract Voice Intent", "Route Voice Result")

# ── 15a. IF Voice Query ─────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-vquery", "leftValue": "={{ $json.voiceType }}", "rightValue": "query",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Voice Query",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1860, 500)
})
connect("Route Voice Result", "IF Voice Query")

# ── 15b. IF Voice Create ────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-vcreate", "leftValue": "={{ $json.voiceType }}", "rightValue": "create",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Voice Create",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1860, 700)
})
connect("IF Voice Query", "IF Voice Create", 1)  # false → check create
# false branch of IF Voice Create → unknown path

# ── 16. Voice Query: HTTP Request ────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "GET",
        "url": "={{ $json.apiUrl }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "Voice HTTP Request",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(2100, 500),
    "continueOnFail": True
})
connect("IF Voice Query", "Voice HTTP Request", 0)  # true branch

# ── 17. Format Voice Query Response ──────────────────────────────────────────

add_node({
    "parameters": {"jsCode": FORMAT_VOICE_QUERY_CODE},
    "id": uid(),
    "name": "Format Voice Query",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(2340, 500)
})
connect("Voice HTTP Request", "Format Voice Query")

# ── 18. Send Voice Query Reply ───────────────────────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.reply }}",
        "additionalFields": {
            "parse_mode": "HTML"
        }
    },
    "id": uid(),
    "name": "Send Voice Query Reply",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(2580, 500),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("Format Voice Query", "Send Voice Query Reply")

# ── 19. Voice Create: Show Confirmation ──────────────────────────────────────

add_node({
    "parameters": {"jsCode": FORMAT_VOICE_CREATE_CODE},
    "id": uid(),
    "name": "Format Voice Create",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(2100, 660)
})
connect("IF Voice Create", "Format Voice Create", 0)  # true branch

# ── 20. Send Confirmation with Inline Keyboard ──────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": '={{ JSON.stringify({ chat_id: $json.chatId, text: $json.confirmMessage, parse_mode: "HTML", reply_markup: { inline_keyboard: $json.inlineKeyboard } }) }}',
        "options": {}
    },
    "id": uid(),
    "name": "Send Voice Confirm",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(2340, 660)
})
connect("Format Voice Create", "Send Voice Confirm")

# ── 21. Voice Unknown: Format + Send ────────────────────────────────────────

add_node({
    "parameters": {"jsCode": FORMAT_VOICE_UNKNOWN_CODE},
    "id": uid(),
    "name": "Format Voice Unknown",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(2100, 820)
})
connect("IF Voice Create", "Format Voice Unknown", 1)  # false branch = unknown

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.reply }}",
        "additionalFields": {"parse_mode": "HTML"}
    },
    "id": uid(),
    "name": "Send Voice Unknown Reply",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(2340, 820),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("Format Voice Unknown", "Send Voice Unknown Reply")

# ══════════════════════════════════════════════════════════════════════════════
# CALLBACK PATH (output 2 of Switch — for voice booking confirmation)
# ══════════════════════════════════════════════════════════════════════════════

# ── 22. Process Callback ─────────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": PROCESS_CALLBACK_V3_CODE},
    "id": uid(),
    "name": "Process Callback",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(920, 900)
})
connect("IF Is Callback", "Process Callback", 0)  # true branch of IF Is Callback

# ── 23. Answer Callback Query ────────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": f"https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": '={"callback_query_id":"{{ $json.callbackQueryId }}","text":"{{ $json.callbackAnswer }}"}'
    },
    "id": uid(),
    "name": "Answer Callback",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1140, 900)
})
connect("Process Callback", "Answer Callback")

# ── 24. IF Is Confirm ────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-confirm", "leftValue": "={{ $('Process Callback').first().json.action }}", "rightValue": "voice_confirm",
                 "operator": {"type": "string", "operation": "equals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Is Confirm",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1380, 900)
})
connect("Answer Callback", "IF Is Confirm")

# ── 25a. IF Booking Data Exists (guard against expired confirmations) ────────

add_node({
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": ""
            },
            "conditions": [
                {"id": "cond-bdata", "leftValue": "={{ $('Process Callback').first().json.bookingData }}", "rightValue": "",
                 "operator": {"type": "string", "operation": "notEquals"}}
            ], "combinator": "and"
        }
    },
    "id": uid(), "name": "IF Booking Data Exists",
    "type": "n8n-nodes-base.if", "typeVersion": 2,
    "position": pos(1620, 900)
})
connect("IF Is Confirm", "IF Booking Data Exists", 0)  # true branch

# ── 25b. Send Expired Message (when booking data was pruned) ─────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $('Process Callback').first().json.chatId }}",
        "text": "⚠️ <b>Pasibaigė galiojimas</b>\n\nUžsakymo duomenys nebegalioja. Pabandykite dar kartą — įrašykite naują balso žinutę.",
        "additionalFields": {"parse_mode": "HTML"}
    },
    "id": uid(),
    "name": "Send Expired Message",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(1860, 980),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("IF Booking Data Exists", "Send Expired Message", 1)  # false branch = expired

# ── 25c. Create Calendar Event (on confirm with valid data) ──────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": API_CREATE,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Process Callback').first().json.bookingData || {}) }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "Create Calendar Event",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1860, 840),
    "continueOnFail": True
})
connect("IF Booking Data Exists", "Create Calendar Event", 0)  # true branch = data exists

# ── 26. Send Create Confirmation ─────────────────────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $('Process Callback').first().json.chatId }}",
        "text": "=✅ <b>Užsakymas sukurtas kalendoriuje!</b>",
        "additionalFields": {"parse_mode": "HTML"}
    },
    "id": uid(),
    "name": "Send Create Confirm",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(2100, 840),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("Create Calendar Event", "Send Create Confirm")

# ── 27. Send Cancel Message ──────────────────────────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $('Process Callback').first().json.chatId }}",
        "text": "❌ Balso užsakymas <b>atšauktas</b>.",
        "additionalFields": {"parse_mode": "HTML"}
    },
    "id": uid(),
    "name": "Send Cancel Message",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(1620, 1100),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("IF Is Confirm", "Send Cancel Message", 1)  # false branch = cancel

# ══════════════════════════════════════════════════════════════════════════════
# BUILD FINAL WORKFLOW JSON
# ══════════════════════════════════════════════════════════════════════════════

workflow = {
    "name": "Batutynas: Telegram Bot V3 — Executive Assistant",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {
        "executionOrder": "v1"
    },
    "tags": [{"name": "batutynas"}, {"name": "telegram"}, {"name": "v3"}]
}

# Write output
out_path = os.path.join(os.path.dirname(__file__), "telegram-bot-v3-workflow.json")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print(f"✅ Generated {out_path}")
print(f"   {len(nodes)} nodes, {sum(len(v.get('main',[])) for v in connections.values())} connection groups")
print(f"\n📌 Webhook URL: https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-telegram-v3")
print(f"   Register with: https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url=https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-telegram-v3")

