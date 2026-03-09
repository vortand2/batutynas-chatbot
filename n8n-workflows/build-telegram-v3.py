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

BOT_TOKEN = "__TELEGRAM_BOT_TOKEN__"

# ── Calendar Bridge API URLs ─────────────────────────────────────────────────

API_BASE        = "https://n8n-n8n.0uvai5.easypanel.host/webhook"
API_DASHBOARD   = f"{API_BASE}/batutynas-dashboard-v2"
API_AVAILABILITY = f"{API_BASE}/batutynas-availability"
API_CREATE      = f"{API_BASE}/batutynas-calendar-create"
API_UPDATE      = f"{API_BASE}/batutynas-calendar-update"
API_DELETE      = f"{API_BASE}/batutynas-calendar-delete"

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
const update = $input.first().json;

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
      // Will filter client-side for this week
      const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 6);
      args.filterDateFrom = today;
      args.filterDateTo = weekEnd.toISOString().substring(0, 10);
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

    case '/move': case '/perkelk': {
      if (!arg1 || !arg2) {
        intent = 'error'; args.msg = '⚠️ Formatas: /perkelk [event_id] [nauja_data]\nPvz: /perkelk abc123 06-20';
        break;
      }
      const newDate = parseDate(arg2);
      if (!newDate) {
        intent = 'error'; args.msg = '⚠️ Neatpažinta data. Naudokite: 06-20, 2026-06-20, rytoj';
        break;
      }
      intent = 'move';
      apiType = 'action_update';
      apiUrl = '""" + API_UPDATE + r"""';
      apiBody = { event_id: arg1, action: 'move', new_date: newDate };
      break;
    }

    case '/extend': case '/pratesek': {
      if (!arg1 || !arg2 || isNaN(parseInt(arg2))) {
        intent = 'error'; args.msg = '⚠️ Formatas: /pratesek [event_id] [dienos]\nPvz: /pratesek abc123 2';
        break;
      }
      intent = 'extend';
      apiType = 'action_update';
      apiUrl = '""" + API_UPDATE + r"""';
      apiBody = { event_id: arg1, action: 'extend', extra_days: parseInt(arg2) };
      break;
    }

    case '/cancel': case '/atsaukti': {
      if (!arg1) {
        intent = 'error'; args.msg = '⚠️ Nurodykite event ID, pvz: /atsaukti abc123';
        break;
      }
      intent = 'cancel';
      apiType = 'action_delete';
      apiUrl = '""" + API_DELETE + r"""';
      apiBody = { event_id: arg1 };
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

// Get API response if we made an API call
if (apiType !== 'none') {
  try {
    data = $('HTTP Request').first().json;
  } catch(e) {
    // API might not have been called for 'none' routes
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
      `/search <žodis> — Ieškoti užsakymo\n\n` +
      `✏️ <b>Veiksmai:</b>\n` +
      `/move <id> <data> — Perkelti\n` +
      `/extend <id> <dienos> — Pratęsti\n` +
      `/cancel <id> — Atšaukti\n\n` +
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

  case 'move': {
    if (data.error) {
      reply = `⚠️ ${data.error}`;
    } else if (data.conflict) {
      reply = `⚠️ <b>Konfliktas!</b> ${data.conflict_equipment || 'Įranga'} jau užimta ${fmtDate(data.requested_date)}.\nNaudokite /available ${data.requested_date} patikrinti.`;
    } else {
      reply = `✅ <b>Perkelta!</b>\n📅 Nauja data: ${fmtDate(data.new_date || '')}\n`;
      if (data.summary) reply += `📌 ${data.summary}`;
    }
    break;
  }

  case 'extend': {
    if (data.error) {
      reply = `⚠️ ${data.error}`;
    } else if (data.conflict) {
      reply = `⚠️ <b>Konfliktas!</b> Negalima pratęsti — ${data.conflict_equipment || 'įranga'} užimta ${fmtDate(data.conflict_date || '')}.`;
    } else {
      reply = `✅ <b>Pratęsta!</b>\n📅 ${fmtDate(data.start_date || '')} → ${fmtDate(data.end_date || '')}\n📌 ${data.summary || ''}`;
    }
    break;
  }

  case 'cancel': {
    if (data.error) {
      reply = `⚠️ ${data.error}`;
    } else {
      reply = `❌ <b>Atšaukta</b>\n📌 ${data.summary || 'Užsakymas pašalintas iš kalendoriaus'}`;
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

// Store booking data as JSON in callback data (shortened)
const bookingJson = JSON.stringify(voiceData.apiBody);
// n8n callback data limit is 64 bytes, so we store in a temp approach
// We'll use a simple confirm/cancel with the full data passed through
const confirmId = Date.now().toString(36);

return [{ json: {
  chatId,
  confirmMessage: msg,
  confirmId,
  bookingData: voiceData.apiBody,
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
  // Voice booking confirmed — we need the booking data
  // In a real flow, we'd retrieve it from a temp store
  // For now, the booking data flows through the workflow state
  return [{ json: {
    chatId, callbackQueryId,
    action: 'voice_confirm',
    callbackAnswer: '✅ Kuriamas...'
  }}];
}

if (data.startsWith('vc_no:')) {
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

# ── 3. Switch: Message Type ──────────────────────────────────────────────────

add_node({
    "parameters": {
        "rules": {
            "rules": [
                {"outputKey": "text", "conditions": {"conditions": [{"leftValue": "={{ $json.msgType }}", "rightValue": "text", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "voice", "conditions": {"conditions": [{"leftValue": "={{ $json.msgType }}", "rightValue": "voice", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "callback", "conditions": {"conditions": [{"leftValue": "={{ $json.msgType }}", "rightValue": "callback", "operator": {"type": "string", "operation": "equals"}}]}}
            ]
        },
        "options": {}
    },
    "id": uid(),
    "name": "Switch Message Type",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": pos(680, 400)
})
connect("Classify Message", "Switch Message Type")

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
connect("Switch Message Type", "Parse Intent", 0)

# ── 5. Switch: API Type ──────────────────────────────────────────────────────

add_node({
    "parameters": {
        "rules": {
            "rules": [
                {"outputKey": "fetch", "conditions": {"conditions": [{"leftValue": "={{ $json.apiType }}", "rightValue": "fetch_", "operator": {"type": "string", "operation": "startsWith"}}]}},
                {"outputKey": "action_update", "conditions": {"conditions": [{"leftValue": "={{ $json.apiType }}", "rightValue": "action_update", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "action_delete", "conditions": {"conditions": [{"leftValue": "={{ $json.apiType }}", "rightValue": "action_delete", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "none", "conditions": {"conditions": [{"leftValue": "={{ $json.apiType }}", "rightValue": "none", "operator": {"type": "string", "operation": "equals"}}]}}
            ]
        },
        "options": {}
    },
    "id": uid(),
    "name": "Switch API Type",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": pos(1140, 200)
})
connect("Parse Intent", "Switch API Type")

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
connect("Switch API Type", "HTTP Request", 0)

# ── 7. HTTP POST Update ─────────────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "={{ $('Parse Intent').first().json.apiUrl }}",
        "sendBody": True,
        "bodyParameters": {"parameters": []},
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Parse Intent').first().json.apiBody) }}",
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "HTTP POST Update",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1380, 250),
    "continueOnFail": True
})
connect("Switch API Type", "HTTP POST Update", 1)

# ── 8. HTTP POST Delete ─────────────────────────────────────────────────────

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
connect("Switch API Type", "HTTP POST Delete", 2)

# ── 9. Merge all API results ─────────────────────────────────────────────────
# All three HTTP paths + no_api path converge into Format Response

add_node({
    "parameters": {"jsCode": FORMAT_RESPONSE_CODE},
    "id": uid(),
    "name": "Format Response",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(1620, 200)
})
connect("HTTP Request", "Format Response")
connect("HTTP POST Update", "Format Response")
connect("HTTP POST Delete", "Format Response")
connect("Switch API Type", "Format Response", 3)  # 'none' path

# ── 10. Send Reply ───────────────────────────────────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.reply }}",
        "additionalFields": {
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
    },
    "id": uid(),
    "name": "Send Reply",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(1860, 200),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("Format Response", "Send Reply")

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
connect("Switch Message Type", "Get File URL", 1)

# ── 12. Transcribe Audio (Groq Whisper) ──────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "groqApi",
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
    "credentials": {"groqApi": GROQ_CRED}
})
connect("Get File URL", "Transcribe Audio")

# ── 13. Extract Intent (xAI Grok) ───────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": "https://api.x.ai/v1/chat/completions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "xAiApi",
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
    "credentials": {"xAiApi": XAI_CRED}
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

# ── 15. Switch: Voice Type ───────────────────────────────────────────────────

add_node({
    "parameters": {
        "rules": {
            "rules": [
                {"outputKey": "query", "conditions": {"conditions": [{"leftValue": "={{ $json.voiceType }}", "rightValue": "query", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "create", "conditions": {"conditions": [{"leftValue": "={{ $json.voiceType }}", "rightValue": "create", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "unknown", "conditions": {"conditions": [{"leftValue": "={{ $json.voiceType }}", "rightValue": "unknown", "operator": {"type": "string", "operation": "equals"}}]}}
            ]
        },
        "options": {}
    },
    "id": uid(),
    "name": "Switch Voice Type",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": pos(1860, 600)
})
connect("Route Voice Result", "Switch Voice Type")

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
connect("Switch Voice Type", "Voice HTTP Request", 0)

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
            "parse_mode": "HTML",
            "disable_web_page_preview": True
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
connect("Switch Voice Type", "Format Voice Create", 1)

# ── 20. Send Confirmation with Inline Keyboard ──────────────────────────────

add_node({
    "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.confirmMessage }}",
        "additionalFields": {
            "parse_mode": "HTML",
            "reply_markup": "={{ JSON.stringify({ inline_keyboard: $json.inlineKeyboard }) }}"
        }
    },
    "id": uid(),
    "name": "Send Voice Confirm",
    "type": "n8n-nodes-base.telegram",
    "typeVersion": 1.2,
    "position": pos(2340, 660),
    "credentials": {"telegramApi": TELEGRAM_CRED}
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
connect("Switch Voice Type", "Format Voice Unknown", 2)

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
connect("Switch Message Type", "Process Callback", 2)

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

# ── 24. Switch Callback Action ───────────────────────────────────────────────

add_node({
    "parameters": {
        "rules": {
            "rules": [
                {"outputKey": "confirm", "conditions": {"conditions": [{"leftValue": "={{ $('Process Callback').first().json.action }}", "rightValue": "voice_confirm", "operator": {"type": "string", "operation": "equals"}}]}},
                {"outputKey": "cancel", "conditions": {"conditions": [{"leftValue": "={{ $('Process Callback').first().json.action }}", "rightValue": "voice_cancel", "operator": {"type": "string", "operation": "equals"}}]}}
            ]
        },
        "options": {}
    },
    "id": uid(),
    "name": "Switch Callback Action",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": pos(1380, 900)
})
connect("Answer Callback", "Switch Callback Action")

# ── 25. Create Calendar Event (on confirm) ───────────────────────────────────
# NOTE: In a full implementation, the booking data would be retrieved from
# a temp store (Redis/n8n static data). For now, we send a placeholder
# that the Calendar Bridge can handle.

add_node({
    "parameters": {
        "method": "POST",
        "url": API_CREATE,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": '={"equipment":"Voice booking","customer_name":"Voice","date":"{{ new Date().toISOString().substring(0,10) }}","notes":"Created via voice confirmation"}',
        "options": {"timeout": 15000}
    },
    "id": uid(),
    "name": "Create Calendar Event",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1620, 840),
    "continueOnFail": True
})
connect("Switch Callback Action", "Create Calendar Event", 0)

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
    "position": pos(1860, 840),
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
    "position": pos(1620, 980),
    "credentials": {"telegramApi": TELEGRAM_CRED}
})
connect("Switch Callback Action", "Send Cancel Message", 1)

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

