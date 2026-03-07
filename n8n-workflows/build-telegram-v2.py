#!/usr/bin/env python3
"""Build Telegram Bot V2 workflow JSON with voice booking + callback support."""

import json

BOT_TOKEN = "TELEGRAM_BOT_TOKEN_PLACEHOLDER"
TELEGRAM_CRED = {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}
POSTGRES_CRED = {"id": "Xc90UM12HHMH6z3A", "name": "Batutynas PostgreSQL"}
GROQ_CRED = {"id": "yf0G3FBiIj8uxM4N", "name": "Groq Whisper API"}  # Whisper transcription
XAI_CRED = {"id": "3o4JPVqz73RdiO0Q", "name": "xAI Grok API"}  # LLM extraction

# ============================================================
# NODE CODE BLOCKS
# ============================================================

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

// Web App data (Mini App form submission via tg.sendData())
if (message.web_app_data) {
  return [{ json: {
    msgType: 'webapp',
    chatId,
    webAppData: message.web_app_data.data
  }}];
}

// Text message (commands + natural language)
return [{ json: {
  msgType: 'text',
  chatId,
  text: (message.text || '').trim(),
  // Pass full message for Parse Intent compatibility
  message: message
}}];
""".strip()

# Parse Intent - same as existing but reads from classify output
PARSE_INTENT_CODE = r"""
const item = $input.first().json;
const text = (item.text || '').trim();
const chatId = item.chatId || '';

if (!text || !chatId) {
  return [{ json: { intent: 'ignore', args: {}, sql: 'SELECT 1 AS placeholder', chatId } }];
}

let intent = 'unknown';
let args = {};
let sql = 'SELECT 1 AS placeholder';

const cleanText = text.replace(/@[A-Za-z_]+bot/i, '').trim();
const parts = cleanText.split(/\s+/);
const cmd = parts[0]?.toLowerCase() || '';
const arg = parts[1] || '';
const lowerText = cleanText.toLowerCase();

// === COMMAND PARSING ===
if (cleanText.startsWith('/')) {
  switch(cmd) {
    case '/start': case '/help': case '/pagalba':
      intent = 'help'; break;
    case '/today': case '/siandien':
      intent = 'today'; break;
    case '/tomorrow': case '/rytoj':
      intent = 'tomorrow'; break;
    case '/week': case '/savaite':
      intent = 'week'; break;
    case '/available': case '/laisvi':
      intent = 'available'; break;
    case '/stats': case '/statistika':
      intent = 'stats'; break;
    case '/delivered': case '/pristatyta':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite u\u017esakymo ID, pvz: /delivered 5'; break;
      }
      intent = 'delivered'; args.id = parseInt(arg); break;
    case '/returned': case '/grazinta':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite u\u017esakymo ID, pvz: /returned 5'; break;
      }
      intent = 'returned'; args.id = parseInt(arg); break;
    case '/paid': case '/apmoketa':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite u\u017esakymo ID, pvz: /paid 5'; break;
      }
      intent = 'paid'; args.id = parseInt(arg); break;
    case '/deposit': case '/avansas':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite u\u017esakymo ID, pvz: /deposit 5'; break;
      }
      intent = 'deposit'; args.id = parseInt(arg); break;
    case '/cancel': case '/atsaukti':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite u\u017esakymo ID, pvz: /cancel 5'; break;
      }
      intent = 'cancel'; args.id = parseInt(arg); break;
    case '/clean': case '/valyti':
      if (!arg || isNaN(parseInt(arg)) || parseInt(arg) <= 0) {
        intent = 'error'; args.msg = '\u26a0\ufe0f Nurodykite \u012frangos ID, pvz: /clean 3'; break;
      }
      intent = 'clean'; args.id = parseInt(arg); break;
    default:
      intent = 'unknown';
  }
} else {
  // === NATURAL LANGUAGE (Lithuanian) ===
  if (/\b(siandien|\u0161iandien|\u0161iandie|kas siandien|kas \u0161iandien)\b/i.test(lowerText)) {
    intent = 'today';
  } else if (/\b(rytoj|ryt\b)/i.test(lowerText)) {
    intent = 'tomorrow';
  } else if (/(savait|savaite|savait\u0117|\u0161i\u0105 savait\u0119|sia savaite)/i.test(lowerText)) {
    intent = 'week';
  } else if (/(laisv|turimos|kiek laisv)/i.test(lowerText)) {
    intent = 'available';
  } else if (/(statistik|apzvalga|ap\u017evalga)/i.test(lowerText)) {
    intent = 'stats';
  } else if (/(pagalb|komand)/i.test(lowerText)) {
    intent = 'help';
  }
}

// === BUILD SQL ===
const BOOKING_FIELDS = `b.id, b.event_date, b.event_time, b.pickup_time,
  b.delivery_address, b.city, b.status, b.price,
  b.deposit_amount, b.deposit_paid, b.payment_status,
  c.name AS customer_name, c.phone AS customer_phone,
  COALESCE((SELECT json_agg(json_build_object('name', e.name, 'icon', e.icon))
    FROM batutynas.booking_equipment be
    JOIN batutynas.equipment e ON e.id = be.equipment_id
    WHERE be.booking_id = b.id), '[]'::json) AS equipment`;

const BOOKING_JOIN = `FROM batutynas.bookings b
  JOIN batutynas.contacts c ON c.id = b.contact_id`;

switch(intent) {
  case 'today':
    sql = `SELECT COALESCE(json_agg(row_to_json(bk.*) ORDER BY bk.event_time), '[]'::json) AS result
      FROM (SELECT ${BOOKING_FIELDS} ${BOOKING_JOIN}
        WHERE b.event_date = CURRENT_DATE AND b.status NOT IN ('Cancelled')) bk`;
    break;
  case 'tomorrow':
    sql = `SELECT COALESCE(json_agg(row_to_json(bk.*) ORDER BY bk.event_time), '[]'::json) AS result
      FROM (SELECT ${BOOKING_FIELDS} ${BOOKING_JOIN}
        WHERE b.event_date = CURRENT_DATE + INTERVAL '1 day' AND b.status NOT IN ('Cancelled')) bk`;
    break;
  case 'week':
    sql = `SELECT COALESCE(json_agg(row_to_json(bk.*) ORDER BY bk.event_date, bk.event_time), '[]'::json) AS result
      FROM (SELECT ${BOOKING_FIELDS} ${BOOKING_JOIN}
        WHERE b.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days'
          AND b.status NOT IN ('Cancelled')) bk`;
    break;
  case 'available':
    sql = `SELECT json_build_object(
      'available', COALESCE((
        SELECT json_agg(json_build_object('id', e.id, 'name', e.name, 'icon', e.icon, 'category', e.category) ORDER BY e.category, e.name)
        FROM batutynas.equipment e
        WHERE e.id NOT IN (
          SELECT be.equipment_id FROM batutynas.booking_equipment be
          JOIN batutynas.bookings b ON b.id = be.booking_id
          WHERE b.event_date = CURRENT_DATE AND b.status IN ('Confirmed', 'Delivered')
        )
      ), '[]'::json),
      'booked_today', COALESCE((
        SELECT json_agg(json_build_object('id', e.id, 'name', e.name, 'icon', e.icon))
        FROM batutynas.equipment e
        WHERE e.id IN (
          SELECT be.equipment_id FROM batutynas.booking_equipment be
          JOIN batutynas.bookings b ON b.id = be.booking_id
          WHERE b.event_date = CURRENT_DATE AND b.status IN ('Confirmed', 'Delivered')
        )
      ), '[]'::json)
    ) AS result`;
    break;
  case 'stats':
    sql = `SELECT json_build_object(
      'today_bookings', (SELECT COUNT(*) FROM batutynas.bookings WHERE event_date = CURRENT_DATE AND status NOT IN ('Cancelled')),
      'week_bookings', (SELECT COUNT(*) FROM batutynas.bookings WHERE event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days' AND status NOT IN ('Cancelled')),
      'month_revenue', (SELECT COALESCE(SUM(price), 0) FROM batutynas.bookings WHERE event_date >= date_trunc('month', CURRENT_DATE) AND status IN ('Completed', 'Delivered', 'Confirmed')),
      'unpaid_deposits', (SELECT COUNT(*) FROM batutynas.bookings WHERE event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND deposit_paid = FALSE AND status = 'Confirmed'),
      'total_equipment', (SELECT COUNT(*) FROM batutynas.equipment),
      'available_equipment', (SELECT COUNT(*) FROM batutynas.equipment WHERE status = 'Available'),
      'needs_cleaning', (SELECT COUNT(*) FROM batutynas.equipment WHERE status = 'Needs Cleaning')
    ) AS result`;
    break;
  case 'delivered':
    sql = `WITH updated AS (UPDATE batutynas.bookings SET status = 'Delivered', updated_at = NOW() WHERE id = ${args.id} AND status = 'Confirmed' RETURNING id, status, event_date, delivery_address, city) SELECT COALESCE((SELECT json_build_object('id', id, 'status', status, 'event_date', event_date::text, 'delivery_address', delivery_address, 'city', city) FROM updated), NULL) AS result`;
    break;
  case 'returned':
    sql = `WITH updated AS (UPDATE batutynas.bookings SET status = 'Completed', updated_at = NOW() WHERE id = ${args.id} AND status = 'Delivered' RETURNING id, status, event_date, delivery_address, city) SELECT COALESCE((SELECT json_build_object('id', id, 'status', status, 'event_date', event_date::text, 'delivery_address', delivery_address, 'city', city) FROM updated), NULL) AS result`;
    break;
  case 'paid':
    sql = `WITH updated AS (UPDATE batutynas.bookings SET payment_status = 'Paid', updated_at = NOW() WHERE id = ${args.id} RETURNING id, status, payment_status, price) SELECT COALESCE((SELECT json_build_object('id', id, 'status', status, 'payment_status', payment_status, 'price', price) FROM updated), NULL) AS result`;
    break;
  case 'deposit':
    sql = `WITH updated AS (UPDATE batutynas.bookings SET deposit_paid = TRUE, updated_at = NOW() WHERE id = ${args.id} RETURNING id, status, deposit_paid, deposit_amount) SELECT COALESCE((SELECT json_build_object('id', id, 'status', status, 'deposit_paid', deposit_paid, 'deposit_amount', deposit_amount) FROM updated), NULL) AS result`;
    break;
  case 'cancel':
    sql = `WITH updated AS (UPDATE batutynas.bookings SET status = 'Cancelled', updated_at = NOW() WHERE id = ${args.id} AND status NOT IN ('Cancelled', 'Completed') RETURNING id, status, event_date) SELECT COALESCE((SELECT json_build_object('id', id, 'status', status, 'event_date', event_date::text) FROM updated), NULL) AS result`;
    break;
  case 'clean':
    sql = `WITH updated AS (UPDATE batutynas.equipment SET status = 'Available', last_cleaned = NOW(), updated_at = NOW() WHERE id = ${args.id} RETURNING id, name, icon, status) SELECT COALESCE((SELECT json_build_object('id', id, 'name', name, 'icon', icon, 'status', status) FROM updated), NULL) AS result`;
    break;
  default:
    sql = 'SELECT 1 AS placeholder';
    break;
}

return [{ json: { intent, args, sql, chatId } }];
""".strip()

# Format Response - same as existing but reads from updated references
FORMAT_RESPONSE_CODE = r"""
const { intent, args } = $('Parse Intent').first().json;
const row = $input.first().json;
let result;

if (['help', 'error', 'unknown', 'ignore'].includes(intent)) {
  result = null;
} else {
  result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
}

let reply = '';
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Tre\u010diadienis', 'Ketvirtadienis', 'Penktadienis', '\u0160e\u0161tadienis'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} (${dayNames[d.getDay()]})`;
}

function formatBooking(b) {
  const statusIcons = { 'Confirmed': '\ud83d\udfe1', 'Delivered': '\ud83d\ude9b', 'Completed': '\u2705', 'Cancelled': '\u274c' };
  const payIcon = b.payment_status === 'Paid' ? '\ud83d\udcb0' : (b.deposit_paid ? '\ud83d\udd35' : '\ud83d\udd34');
  const icon = statusIcons[b.status] || '\u2b1c';
  let line = `${icon} <b>#${b.id}</b> ${(b.event_time||'?').substring(0,5)} \u2192 ${(b.pickup_time||'?').substring(0,5)}`;
  line += `\n   \ud83d\udccd ${b.delivery_address}, ${b.city}`;
  line += `\n   \ud83d\udc64 ${b.customer_name} | \ud83d\udcde ${b.customer_phone}`;
  const equip = Array.isArray(b.equipment) ? b.equipment.map(e => e.icon || '\ud83c\udfaa').join('') : '';
  line += `\n   ${equip} | ${payIcon} \u20ac${b.price || 0}`;
  if (!b.deposit_paid && b.status === 'Confirmed') line += ` \u26a0\ufe0f Avansas nemok\u0117tas!`;
  return line;
}

switch(intent) {
  case 'help':
    reply = `\ud83e\udd16 <b>Batutynas Bot</b>\n\n` +
      `\ud83d\udccb <b>Per\u017ei\u016bra:</b>\n/today - \u0160iandienos u\u017esakymai\n/tomorrow - Rytojaus u\u017esakymai\n/week - Savait\u0117s u\u017esakymai\n/available - Laisva \u012franga\n/stats - Statistika\n\n` +
      `\u270f\ufe0f <b>Veiksmai:</b>\n/delivered <i>ID</i> - Pristatyta\n/returned <i>ID</i> - Gr\u0105\u017einta\n/paid <i>ID</i> - Apmok\u0117ta\n/deposit <i>ID</i> - Avansas\n/cancel <i>ID</i> - At\u0161aukti\n/clean <i>ID</i> - I\u0161valyta\n\n` +
      `\ud83c\udf99\ufe0f <b>Balso u\u017esakymas:</b>\nAtsi\u0173skite balso \u017einut\u0119 su u\u017esakymo duomenimis!\n\n` +
      `\ud83d\udcac <b>Arba ra\u0161ykite lietuvi\u0161kai:</b>\n"\u0161iandien", "rytoj", "savait\u0117", "laisvi", "statistika"`;
    break;
  case 'today': case 'tomorrow': case 'week': {
    const bookings = Array.isArray(result) ? result : [];
    const label = intent === 'today' ? '\ud83d\udcc5 \u0160iandien' : intent === 'tomorrow' ? '\ud83d\udcc5 Rytoj' : '\ud83d\udcc5 \u0160i savait\u0117';
    if (bookings.length === 0) {
      reply = `${label}: U\u017esakym\u0173 n\u0117ra \ud83c\udf89`;
    } else {
      reply = `${label} (${bookings.length} u\u017es.):\n`;
      if (intent === 'week') {
        const byDate = {};
        bookings.forEach(b => { const d = (b.event_date||'').substring(0,10); if (!byDate[d]) byDate[d] = []; byDate[d].push(b); });
        for (const [date, bks] of Object.entries(byDate)) {
          reply += `\n\ud83d\udcc6 <b>${formatDate(date)}</b>\n`;
          bks.forEach(b => { reply += formatBooking(b) + '\n'; });
        }
      } else {
        bookings.forEach(b => { reply += '\n' + formatBooking(b) + '\n'; });
      }
    }
    break;
  }
  case 'available': {
    const avail = result?.available || [];
    const booked = result?.booked_today || [];
    reply = `\ud83c\udfaa <b>\u012erangos statusas</b>\n\n\u2705 <b>Laisva (${avail.length}):</b>\n`;
    if (avail.length === 0) reply += `  Visi u\u017eimti!\n`;
    else avail.forEach(e => { reply += `  ${e.icon||'\ud83c\udfaa'} #${e.id} ${e.name}\n`; });
    if (booked.length > 0) {
      reply += `\n\ud83d\udd12 <b>U\u017eimta \u0161iandien (${booked.length}):</b>\n`;
      booked.forEach(e => { reply += `  ${e.icon||'\ud83c\udfaa'} ${e.name}\n`; });
    }
    break;
  }
  case 'stats':
    reply = `\ud83d\udcca <b>Statistika</b>\n\n\ud83d\udcc5 \u0160iandien: ${result.today_bookings} u\u017es.\n\ud83d\udcc5 Savait\u0117: ${result.week_bookings} u\u017es.\n\ud83d\udcb0 M\u0117n. pajamos: \u20ac${result.month_revenue}\n\u26a0\ufe0f Nemok\u0117ti avansai: ${result.unpaid_deposits}\n\ud83c\udfaa \u012eranga: ${result.available_equipment}/${result.total_equipment} laisva`;
    if (Number(result.needs_cleaning) > 0) reply += `\n\ud83e\uddf9 Reikia valyti: ${result.needs_cleaning}`;
    break;
  case 'delivered':
    reply = !result ? `\u26a0\ufe0f #${args.id} nerastas (turi b\u016bti "Confirmed")` : `\ud83d\ude9b <b>#${result.id}</b> \u2014 <b>Pristatyta</b>\n\ud83d\udccd ${result.delivery_address}, ${result.city}`;
    break;
  case 'returned':
    reply = !result ? `\u26a0\ufe0f #${args.id} nerastas (turi b\u016bti "Delivered")` : `\u2705 <b>#${result.id}</b> \u2014 <b>Gr\u0105\u017einta</b>\n\ud83d\udccd ${result.delivery_address}, ${result.city}`;
    break;
  case 'paid':
    reply = !result ? `\u26a0\ufe0f #${args.id} nerastas` : `\ud83d\udcb0 <b>#${result.id}</b> \u2014 <b>Apmok\u0117ta</b> (\u20ac${result.price})`;
    break;
  case 'deposit':
    reply = !result ? `\u26a0\ufe0f #${args.id} nerastas` : `\ud83d\udd35 <b>#${result.id}</b> \u2014 avansas <b>sumok\u0117tas</b> (\u20ac${result.deposit_amount})`;
    break;
  case 'cancel':
    reply = !result ? `\u26a0\ufe0f #${args.id} nerastas arba jau at\u0161auktas` : `\u274c <b>#${result.id}</b> <b>at\u0161auktas</b>`;
    break;
  case 'clean':
    reply = !result ? `\u26a0\ufe0f \u012eranga #${args.id} nerasta` : `\ud83e\uddf9 ${result.icon||'\ud83c\udfaa'} <b>${result.name}</b> \u2014 <b>I\u0161valyta</b> \u2705`;
    break;
  case 'error':
    reply = args.msg || '\u26a0\ufe0f Klaida';
    break;
  case 'ignore':
    reply = '';
    break;
  default:
    reply = `\ud83e\udd14 Nesupratau. Naudokite /help arba ra\u0161ykite lietuvi\u0161kai`;
    break;
}

return [{ json: { reply } }];
""".strip()

# Extract booking data from OpenAI response and build Mini App URL
EXTRACT_AND_CONFIRM_CODE = r"""
const transcript = $('Transcribe Audio').first().json.text || '';
const extractResp = $input.first().json;
const chatId = $('Classify Message').first().json.chatId;

// Parse the OpenAI extraction response
let content = '';
if (extractResp.choices && extractResp.choices[0]) {
  content = extractResp.choices[0].message?.content || '{}';
}

let booking;
try {
  booking = JSON.parse(content);
} catch(e) {
  booking = {};
}

// Build confirmation message
let msg = `\ud83c\udf99\ufe0f <b>Balso u\u017esakymas</b>\n`;
msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;
if (booking.customer_name) msg += `\ud83d\udc64 ${booking.customer_name}\n`;
if (booking.customer_phone) msg += `\ud83d\udcde ${booking.customer_phone}\n`;
if (booking.event_date) msg += `\ud83d\udcc5 ${booking.event_date}\n`;
if (booking.event_time) msg += `\u23f0 ${booking.event_time}`;
if (booking.pickup_time) msg += ` \u2192 ${booking.pickup_time}`;
msg += '\n';
if (booking.delivery_address) msg += `\ud83d\udccd ${booking.delivery_address}`;
if (booking.city) msg += `, ${booking.city}`;
msg += '\n';
if (booking.equipment) msg += `\ud83c\udfaa ${booking.equipment}\n`;
if (booking.price) msg += `\ud83d\udcb0 \u20ac${booking.price}\n`;
if (booking.notes) msg += `\ud83d\udcdd ${booking.notes}\n`;
msg += `\n\ud83d\udcac <i>Transkripcija: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"</i>`;
msg += `\n\n\u270f\ufe0f <b>Per\u017ei\u016br\u0117kite ir patvirtinkite u\u017esakym\u0105:</b>`;

// Build Mini App URL with query params
const enc = (v) => encodeURIComponent(v != null ? String(v) : '');
const baseUrl = 'https://vortand2.github.io/batutynas-chatbot/mini-app/index.html';
const params = [
  `name=${enc(booking.customer_name)}`,
  `phone=${enc(booking.customer_phone)}`,
  `date=${enc(booking.event_date)}`,
  `time=${enc(booking.event_time)}`,
  `pickup=${enc(booking.pickup_time)}`,
  `address=${enc(booking.delivery_address)}`,
  `city=${enc(booking.city)}`,
  `equipment=${enc(booking.equipment)}`,
  `price=${enc(booking.price)}`,
  `notes=${enc(booking.notes)}`,
  `transcript=${enc(transcript.substring(0, 200))}`
].join('&');
const miniAppUrl = `${baseUrl}?${params}`;

return [{ json: { chatId, reply: msg, miniAppUrl }}];
""".strip()

# Process callback query
PROCESS_CALLBACK_CODE = r"""
const item = $input.first().json;
const data = item.callbackData || '';
const chatId = item.chatId;
const callbackQueryId = item.callbackQueryId;
const messageId = item.messageId;

if (data.startsWith('vb_ok:')) {
  const pid = data.substring(6);
  const sql = `
    WITH pending AS (
      DELETE FROM batutynas.pending_voice_bookings
      WHERE id = '${pid}'
      RETURNING booking_data, chat_id
    ),
    contact_upsert AS (
      INSERT INTO batutynas.contacts (name, phone, source)
      SELECT
        COALESCE(p.booking_data->>'customer_name', 'Nenurodyta'),
        COALESCE(p.booking_data->>'customer_phone', 'Nenurodyta'),
        'Telegram'
      FROM pending p
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name
      RETURNING id, name, phone
    ),
    new_booking AS (
      INSERT INTO batutynas.bookings (
        contact_id, event_date, event_time, pickup_time,
        delivery_address, city, status, price, entry_source
      )
      SELECT
        cu.id,
        COALESCE((p.booking_data->>'event_date')::date, CURRENT_DATE),
        (p.booking_data->>'event_time')::time,
        (p.booking_data->>'pickup_time')::time,
        COALESCE(p.booking_data->>'delivery_address', ''),
        COALESCE(p.booking_data->>'city', ''),
        'Confirmed',
        COALESCE((p.booking_data->>'price')::numeric, 0),
        'Telegram'
      FROM pending p, contact_upsert cu
      RETURNING id, event_date::text, city
    )
    SELECT COALESCE(
      (SELECT json_build_object(
        'action', 'confirmed',
        'booking_id', nb.id,
        'event_date', nb.event_date,
        'city', nb.city,
        'customer_name', cu.name
      ) FROM new_booking nb, contact_upsert cu),
      json_build_object('action', 'not_found')
    ) AS result`;

  return [{ json: { chatId, callbackQueryId, messageId, sql, action: 'confirm' } }];
}

if (data.startsWith('vb_no:')) {
  const pid = data.substring(6);
  const sql = `
    DELETE FROM batutynas.pending_voice_bookings WHERE id = '${pid}'
    RETURNING json_build_object('action', 'cancelled', 'id', id) AS result`;

  return [{ json: { chatId, callbackQueryId, messageId, sql, action: 'cancel' } }];
}

// Unknown callback - just acknowledge
return [{ json: {
  chatId, callbackQueryId, messageId,
  sql: "SELECT json_build_object('action', 'unknown') AS result",
  action: 'unknown'
}}];
""".strip()

# Format callback result (with error handling for DB failures)
FORMAT_CALLBACK_CODE = r"""
const { action } = $('Process Callback').first().json;
const chatId = $('Process Callback').first().json.chatId;
const callbackQueryId = $('Process Callback').first().json.callbackQueryId;
const row = $input.first().json;

let reply = '';
let callbackAnswer = '';

// Check if Execute Booking returned an error (continueOnFail)
if (row.error || row.$error) {
  const errMsg = row.error?.message || row.$error?.message || 'Nežinoma klaida';
  reply = `\u26a0\ufe0f <b>Klaida išsaugant užsakymą</b>\n\n${errMsg}\n\nPabandykite dar kartą arba įveskite rankiniu būdu.`;
  callbackAnswer = '\u26a0\ufe0f Klaida';
  return [{ json: { reply, callbackAnswer, chatId, callbackQueryId } }];
}

let result;
try {
  result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
} catch(e) {
  reply = '\u26a0\ufe0f Klaida apdorojant atsakymą.';
  callbackAnswer = '\u26a0\ufe0f Klaida';
  return [{ json: { reply, callbackAnswer, chatId, callbackQueryId } }];
}

if (action === 'confirm') {
  if (result?.action === 'confirmed') {
    reply = `\u2705 <b>Užsakymas sukurtas!</b>\n\n` +
      `\ud83d\udcdd #${result.booking_id}\n` +
      `\ud83d\udc64 ${result.customer_name}\n` +
      `\ud83d\udcc5 ${result.event_date}\n` +
      `\ud83d\udccd ${result.city}\n\n` +
      `Statusas: <b>Confirmed</b>`;
    callbackAnswer = '\u2705 Patvirtinta!';
  } else {
    reply = '\u26a0\ufe0f Užsakymas nerastas arba jau apdorotas.';
    callbackAnswer = '\u26a0\ufe0f Nerastas';
  }
} else if (action === 'cancel') {
  reply = '\u274c Balso užsakymas <b>atšauktas</b>.';
  callbackAnswer = '\u274c Atšaukta';
} else {
  reply = '\u26a0\ufe0f Nežinomas veiksmas.';
  callbackAnswer = '\u26a0\ufe0f Klaida';
}

return [{ json: { reply, callbackAnswer, chatId, callbackQueryId } }];
""".strip()

# Process WebApp submission (Mini App form data via tg.sendData())
PROCESS_WEBAPP_CODE = r"""
const item = $input.first().json;
const chatId = item.chatId;
const rawData = item.webAppData || '{}';

let form;
try {
  form = JSON.parse(rawData);
} catch (e) {
  return [{ json: { chatId, sql: "SELECT json_build_object('action', 'parse_error') AS result" }}];
}

function esc(val) {
  if (val === null || val === undefined) return null;
  return String(val).replace(/'/g, "''");
}

const name = esc(form.customer_name) || 'Nenurodyta';
const phone = esc(form.customer_phone) || 'Nenurodyta';
const eventDate = esc(form.event_date);
const eventTime = esc(form.event_time);
const pickupTime = esc(form.pickup_time);
const address = esc(form.delivery_address) || '';
const city = esc(form.city) || '';
const equipment = esc(form.equipment) || '';
const price = parseFloat(form.price) || 0;
const notes = esc(form.notes) || '';

const sql = `
WITH contact_upsert AS (
  INSERT INTO batutynas.contacts (name, phone, source)
  VALUES ('${name}', '${phone}', 'Telegram')
  ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, name, phone
),
new_booking AS (
  INSERT INTO batutynas.bookings (
    contact_id, event_date, event_time, pickup_time,
    delivery_address, city, status, price, notes, entry_source
  )
  SELECT
    cu.id,
    ${eventDate ? "'" + eventDate + "'::date" : 'CURRENT_DATE'},
    ${eventTime ? "'" + eventTime + "'::time" : 'NULL'},
    ${pickupTime ? "'" + pickupTime + "'::time" : 'NULL'},
    '${address}',
    '${city}',
    'Confirmed',
    ${price},
    '${notes}',
    'Telegram'
  FROM contact_upsert cu
  RETURNING id, event_date::text, city
)
SELECT json_build_object(
  'action', 'confirmed',
  'booking_id', nb.id,
  'event_date', nb.event_date,
  'city', nb.city,
  'customer_name', cu.name,
  'equipment', '${equipment}'
) AS result
FROM new_booking nb, contact_upsert cu`;

return [{ json: { chatId, sql } }];
""".strip()

# Format WebApp booking result
FORMAT_WEBAPP_CODE = r"""
const chatId = $('Process WebApp').first().json.chatId;
const row = $input.first().json;

let result;
try {
  result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
} catch(e) {
  return [{ json: { reply: '\u26a0\ufe0f Klaida apdorojant u\u017esakym\u0105.', chatId } }];
}

let reply = '';
if (result?.action === 'confirmed') {
  reply = `\u2705 <b>U\u017esakymas sukurtas!</b>\n\n` +
    `\ud83d\udcdd #${result.booking_id}\n` +
    `\ud83d\udc64 ${result.customer_name}\n` +
    `\ud83d\udcc5 ${result.event_date}\n` +
    `\ud83d\udccd ${result.city}\n`;
  if (result.equipment) reply += `\ud83c\udfaa ${result.equipment}\n`;
  reply += `\nStatusas: <b>Confirmed</b>`;
} else if (result?.action === 'parse_error') {
  reply = '\u26a0\ufe0f Nepavyko nuskaityti formos duomen\u0173. Bandykite dar kart\u0105.';
} else {
  reply = '\u26a0\ufe0f Nepavyko i\u0161saugoti u\u017esakymo. Bandykite dar kart\u0105.';
}

return [{ json: { reply, chatId } }];
""".strip()

# ============================================================
# BUILD WORKFLOW
# ============================================================

def build_workflow():
    nodes = []
    connections = {}

    # 1. Telegram Trigger - listens for messages AND callback queries
    nodes.append({
        "parameters": {
            "updates": ["message", "callback_query"]
        },
        "id": "telegram-trigger",
        "name": "Telegram Trigger",
        "type": "n8n-nodes-base.telegramTrigger",
        "typeVersion": 1.1,
        "position": [240, 300],
        "webhookId": "batutynas-telegram",
        "credentials": {"telegramApi": TELEGRAM_CRED}
    })

    # 2. Classify Message
    nodes.append({
        "parameters": {"jsCode": CLASSIFY_CODE},
        "id": "classify-message",
        "name": "Classify Message",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [440, 300]
    })

    # 3. IF: Is Callback?
    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-callback",
                    "leftValue": "={{ $json.msgType }}",
                    "rightValue": "callback",
                    "operator": {"type": "string", "operation": "equals"}
                }],
                "combinator": "and"
            }
        },
        "id": "if-callback",
        "name": "Is Callback?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [640, 300]
    })

    # 4. IF: Is Voice? (FALSE path of callback check)
    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-voice",
                    "leftValue": "={{ $json.msgType }}",
                    "rightValue": "voice",
                    "operator": {"type": "string", "operation": "equals"}
                }],
                "combinator": "and"
            }
        },
        "id": "if-voice",
        "name": "Is Voice?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [840, 400]
    })

    # 5. IF: Is WebApp? (FALSE path of voice check)
    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-webapp",
                    "leftValue": "={{ $json.msgType }}",
                    "rightValue": "webapp",
                    "operator": {"type": "string", "operation": "equals"}
                }],
                "combinator": "and"
            }
        },
        "id": "if-webapp",
        "name": "Is WebApp?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [1060, 500]
    })

    # ============ TEXT PATH (FALSE from webapp check) ============
    # 6. Parse Intent
    nodes.append({
        "parameters": {"jsCode": PARSE_INTENT_CODE},
        "id": "parse-intent",
        "name": "Parse Intent",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1280, 650]
    })

    # 7. Execute Query
    nodes.append({
        "parameters": {
            "operation": "executeQuery",
            "query": "={{ $('Parse Intent').first().json.sql }}",
            "additionalFields": {}
        },
        "id": "execute-query",
        "name": "Execute Query",
        "type": "n8n-nodes-base.postgres",
        "typeVersion": 2.5,
        "position": [1500, 650],
        "credentials": {"postgres": POSTGRES_CRED}
    })

    # 8. Format Response
    nodes.append({
        "parameters": {"jsCode": FORMAT_RESPONSE_CODE},
        "id": "format-response",
        "name": "Format Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1720, 650]
    })

    # 9. Send Reply
    nodes.append({
        "parameters": {
            "resource": "message",
            "operation": "sendMessage",
            "chatId": "={{ $('Parse Intent').first().json.chatId }}",
            "text": "={{ $('Format Response').first().json.reply }}",
            "additionalFields": {
                "appendAttribution": False,
                "parse_mode": "HTML"
            }
        },
        "id": "send-reply",
        "name": "Send Reply",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1940, 650],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    })

    # ============ VOICE PATH (TRUE from voice check) ============
    # 10. Get File Path from Telegram
    nodes.append({
        "parameters": {
            "method": "GET",
            "url": f"=https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={{{{ $json.fileId }}}}",
            "options": {}
        },
        "id": "get-file-path",
        "name": "Get File Path",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1060, 200]
    })

    # 11. Download Audio from Telegram
    nodes.append({
        "parameters": {
            "method": "GET",
            "url": f"=https://api.telegram.org/file/bot{BOT_TOKEN}/{{{{ $json.result.file_path }}}}",
            "options": {
                "response": {"response": {"responseFormat": "file"}}
            }
        },
        "id": "download-audio",
        "name": "Download Audio",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1280, 200]
    })

    # 12. Rename .oga -> .ogg (Telegram sends .oga, Groq requires .ogg extension)
    nodes.append({
        "parameters": {
            "jsCode": (
                "const items = $input.all();\n"
                "for (const item of items) {\n"
                "  if (item.binary && item.binary.data) {\n"
                "    const fn = item.binary.data.fileName || 'audio.oga';\n"
                "    item.binary.data.fileName = fn.replace(/\\.oga$/, '.ogg');\n"
                "    item.binary.data.mimeType = 'audio/ogg';\n"
                "  }\n"
                "}\n"
                "return items;"
            )
        },
        "id": "rename-audio",
        "name": "Rename Audio",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1390, 200]
    })

    # 13. Transcribe Audio (Groq Whisper large-v3)
    whisper_prompt = (
        "Batutynas užsakymas. "
        "Batutai: Džiumandži parkas, Fantazijų parkas, Giga ruožas, "
        "Mega Rocket, Mega ruožas, Mega Ufonautai, Mega Waikiki, "
        "Chameleonas, Candy Pop, Vienaragiai, Pilis mažiesiems, Monstrai, Aštuonkojis. "
        "Priedai: Milžiniškas Dart, Kamuolių medžioklė, Rodeo bulius, Saldėsių aparatai, "
        "Banketo stalai ir kėdės, Disco paviljonas, Putų šou. "
        "Miestai: Tauragė, Klaipėda, Šilutė, Šilalė, Jurbarkas, Pagėgiai, Palanga, Kretinga, Gargždai, Kelmė. "
        "Gatvės: Dariaus ir Girėno, Vytauto, Vilniaus, Klaipėdos, Respublikos, Šilutės, Stoties, Žemaičių, Tilžės. "
        "Vardai: Petraitis, Jonaitis, Kazlauskas, Stankevičius, Janulevičienė. "
        "Naujas užsakymas, pristatymo adresas, surinkimo laikas, sumokėta, avansas, priedai."
    )
    nodes.append({
        "parameters": {
            "method": "POST",
            "url": "https://api.groq.com/openai/v1/audio/transcriptions",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendBody": True,
            "contentType": "multipart-form-data",
            "bodyParameters": {
                "parameters": [
                    {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
                    {"parameterType": "formData", "name": "model", "value": "whisper-large-v3"},
                    {"parameterType": "formData", "name": "language", "value": "lt"},
                    {"parameterType": "formData", "name": "prompt", "value": whisper_prompt}
                ]
            },
            "options": {}
        },
        "id": "transcribe-audio",
        "name": "Transcribe Audio",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1500, 200],
        "credentials": {"httpHeaderAuth": GROQ_CRED}
    })

    # 14. Prepare xAI Request (Code node — builds JSON body with dynamic date)
    PREPARE_XAI_CODE = r"""
const transcribedText = $json.text;
const today = new Date().toISOString().split("T")[0];

const prompt = `You are a booking data extractor for Batutynas, a Lithuanian inflatable trampoline rental business. Today's date is ${today}. Extract the following fields from the transcribed Lithuanian voice message into a JSON object:
- customer_name: Full name (string). Fix obvious transcription errors in Lithuanian surnames.
- customer_phone: Phone number in +370XXXXXXXX format (string)
- event_date: Date in YYYY-MM-DD format. 'rytoj' = tomorrow, 'poryt' = day after tomorrow, 'šiandien' = today. Use current year if not specified. (string)
- event_time: Delivery/start time in HH:MM format (string)
- pickup_time: Pickup/end time in HH:MM format (string)
- delivery_address: Full delivery address. Fix garbled street names — common streets: Dariaus ir Girėno, Vytauto, Vilniaus, Klaipėdos, Respublikos, Stoties. (string)
- city: City name. Nearby cities: Tauragė, Klaipėda, Šilutė, Šilalė, Jurbarkas, Pagėgiai, Palanga, Kretinga, Gargždai. (string)
- equipment: Equipment name EXACTLY as spoken. Known items — Big parks: Džiumandži parkas, Fantazijų parkas, Giga ruožas. Mega trampolines: Mega Rocket, Mega ruožas, Mega Ufonautai, Mega Waikiki. Standard: Chameleonas, Candy Pop, Vienaragiai, Pilis mažiesiems, Monstrai, Aštuonkojis. Addons: Milžiniškas Dart, Kamuolių medžioklė, Rodeo bulius, Saldėsių aparatai, Banketo stalai ir kėdės, Disco paviljonas, Putų šou. Use the EXACT name from this list that matches what was said. (string)
- price: Price if mentioned, number only in EUR (number or null)
- notes: Any additional notes like 'sumokėta' (paid), 'avansas' (deposit) (string or null)

Lithuanian month names: sausio=01, vasario=02, kovo=03, balandžio=04, gegužės=05, birželio=06, liepos=07, rugpjūčio=08, rugsėjo=09, spalio=10, lapkričio=11, gruodžio=12.
Lithuanian phone: +370 6X XXX XXXX or 86X XXX XXXX (convert to +370 format).
If a field is unclear or not mentioned, set it to null.
Respond ONLY with valid JSON, no markdown.`;

return [{
  json: {
    requestBody: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: transcribedText }
      ],
      temperature: 0
    }),
    text: transcribedText
  }
}];
""".strip()

    nodes.append({
        "parameters": {"jsCode": PREPARE_XAI_CODE},
        "id": "prepare-xai",
        "name": "Prepare xAI Request",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1620, 200]
    })

    # 15. Extract Booking Data (xAI Grok HTTP call)
    nodes.append({
        "parameters": {
            "method": "POST",
            "url": "https://api.x.ai/v1/chat/completions",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ $json.requestBody }}",
            "options": {}
        },
        "id": "extract-booking",
        "name": "Extract Booking Data",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1830, 200],
        "credentials": {"httpHeaderAuth": XAI_CRED}
    })

    # 16. Build Confirmation (Code — outputs miniAppUrl)
    nodes.append({
        "parameters": {"jsCode": EXTRACT_AND_CONFIRM_CODE},
        "id": "build-confirmation",
        "name": "Build Confirmation",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [2050, 200]
    })

    # 17. Send Confirmation with Mini App button (Telegram via HTTP)
    nodes.append({
        "parameters": {
            "method": "POST",
            "url": f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "chat_id": {{ JSON.stringify($("Build Confirmation").first().json.chatId) }},\n  "text": {{ JSON.stringify($("Build Confirmation").first().json.reply) }},\n  "parse_mode": "HTML",\n  "reply_markup": {\n    "keyboard": [[\n      {"text": "\\u270f\\ufe0f Per\\u017ei\\u016br\\u0117ti ir patvirtinti", "web_app": {"url": {{ JSON.stringify($("Build Confirmation").first().json.miniAppUrl) }} }}\n    ]],\n    "resize_keyboard": true,\n    "one_time_keyboard": true\n  }\n}',
            "options": {}
        },
        "id": "send-keyboard",
        "name": "Send Confirmation",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [2270, 200]
    })

    # ============ WEBAPP PATH (TRUE from webapp check) ============
    # 18. Process WebApp (Code — parses form JSON, builds save SQL)
    nodes.append({
        "parameters": {"jsCode": PROCESS_WEBAPP_CODE},
        "id": "process-webapp",
        "name": "Process WebApp",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1280, 500]
    })

    # 19. Save WebApp Booking (Postgres)
    nodes.append({
        "parameters": {
            "operation": "executeQuery",
            "query": "={{ $('Process WebApp').first().json.sql }}",
            "additionalFields": {}
        },
        "id": "save-webapp-booking",
        "name": "Save WebApp Booking",
        "type": "n8n-nodes-base.postgres",
        "typeVersion": 2.5,
        "position": [1500, 500],
        "credentials": {"postgres": POSTGRES_CRED},
        "onError": "continueRegularOutput"
    })

    # 20. Format WebApp Result (Code)
    nodes.append({
        "parameters": {"jsCode": FORMAT_WEBAPP_CODE},
        "id": "format-webapp-result",
        "name": "Format WebApp Result",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1720, 500]
    })

    # 21. Send WebApp Result (Telegram via HTTP — includes remove_keyboard)
    nodes.append({
        "parameters": {
            "method": "POST",
            "url": f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "chat_id": {{ JSON.stringify($("Format WebApp Result").first().json.chatId) }},\n  "text": {{ JSON.stringify($("Format WebApp Result").first().json.reply) }},\n  "parse_mode": "HTML",\n  "reply_markup": {"remove_keyboard": true}\n}',
            "options": {}
        },
        "id": "send-webapp-result",
        "name": "Send WebApp Result",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1940, 500]
    })

    # ============ CALLBACK PATH (TRUE from callback check) ============
    # 22. Process Callback
    nodes.append({
        "parameters": {"jsCode": PROCESS_CALLBACK_CODE},
        "id": "process-callback",
        "name": "Process Callback",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [840, 100]
    })

    # 23. Execute Booking SQL (continueOnFail so errors are handled gracefully)
    nodes.append({
        "parameters": {
            "operation": "executeQuery",
            "query": "={{ $('Process Callback').first().json.sql }}",
            "additionalFields": {}
        },
        "id": "execute-booking",
        "name": "Execute Booking",
        "type": "n8n-nodes-base.postgres",
        "typeVersion": 2.5,
        "position": [1060, 100],
        "credentials": {"postgres": POSTGRES_CRED},
        "onError": "continueRegularOutput"
    })

    # 24. Format Callback Result
    nodes.append({
        "parameters": {"jsCode": FORMAT_CALLBACK_CODE},
        "id": "format-callback",
        "name": "Format Callback",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1280, 100]
    })

    # 25. Answer Callback Query (HTTP Request to Telegram)
    nodes.append({
        "parameters": {
            "method": "POST",
            "url": f"https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "callback_query_id": {{ JSON.stringify($json.callbackQueryId) }},\n  "text": {{ JSON.stringify($json.callbackAnswer) }}\n}',
            "options": {}
        },
        "id": "answer-callback",
        "name": "Answer Callback",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1500, 100]
    })

    # 26. Send Callback Result (Telegram)
    nodes.append({
        "parameters": {
            "resource": "message",
            "operation": "sendMessage",
            "chatId": "={{ $('Format Callback').first().json.chatId }}",
            "text": "={{ $('Format Callback').first().json.reply }}",
            "additionalFields": {
                "appendAttribution": False,
                "parse_mode": "HTML"
            }
        },
        "id": "send-callback-reply",
        "name": "Send Booking Result",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1720, 100],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    })

    # ============ CONNECTIONS ============
    connections = {
        "Telegram Trigger": {"main": [[{"node": "Classify Message", "type": "main", "index": 0}]]},
        "Classify Message": {"main": [[{"node": "Is Callback?", "type": "main", "index": 0}]]},
        "Is Callback?": {
            "main": [
                [{"node": "Process Callback", "type": "main", "index": 0}],  # TRUE
                [{"node": "Is Voice?", "type": "main", "index": 0}]          # FALSE
            ]
        },
        "Is Voice?": {
            "main": [
                [{"node": "Get File Path", "type": "main", "index": 0}],     # TRUE (voice)
                [{"node": "Is WebApp?", "type": "main", "index": 0}]         # FALSE (check webapp)
            ]
        },
        "Is WebApp?": {
            "main": [
                [{"node": "Process WebApp", "type": "main", "index": 0}],    # TRUE (webapp)
                [{"node": "Parse Intent", "type": "main", "index": 0}]       # FALSE (text)
            ]
        },
        # Text path
        "Parse Intent": {"main": [[{"node": "Execute Query", "type": "main", "index": 0}]]},
        "Execute Query": {"main": [[{"node": "Format Response", "type": "main", "index": 0}]]},
        "Format Response": {"main": [[{"node": "Send Reply", "type": "main", "index": 0}]]},
        # Voice path (Build Confirmation → Send Confirmation directly, no Save Pending)
        "Get File Path": {"main": [[{"node": "Download Audio", "type": "main", "index": 0}]]},
        "Download Audio": {"main": [[{"node": "Rename Audio", "type": "main", "index": 0}]]},
        "Rename Audio": {"main": [[{"node": "Transcribe Audio", "type": "main", "index": 0}]]},
        "Transcribe Audio": {"main": [[{"node": "Prepare xAI Request", "type": "main", "index": 0}]]},
        "Prepare xAI Request": {"main": [[{"node": "Extract Booking Data", "type": "main", "index": 0}]]},
        "Extract Booking Data": {"main": [[{"node": "Build Confirmation", "type": "main", "index": 0}]]},
        "Build Confirmation": {"main": [[{"node": "Send Confirmation", "type": "main", "index": 0}]]},
        # WebApp path
        "Process WebApp": {"main": [[{"node": "Save WebApp Booking", "type": "main", "index": 0}]]},
        "Save WebApp Booking": {"main": [[{"node": "Format WebApp Result", "type": "main", "index": 0}]]},
        "Format WebApp Result": {"main": [[{"node": "Send WebApp Result", "type": "main", "index": 0}]]},
        # Callback path
        "Process Callback": {"main": [[{"node": "Execute Booking", "type": "main", "index": 0}]]},
        "Execute Booking": {"main": [[{"node": "Format Callback", "type": "main", "index": 0}]]},
        "Format Callback": {"main": [[{"node": "Answer Callback", "type": "main", "index": 0}]]},
        "Answer Callback": {"main": [[{"node": "Send Booking Result", "type": "main", "index": 0}]]}
    }

    workflow = {
        "name": "Batutynas Telegram Bot",
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"}
    }

    return workflow


if __name__ == '__main__':
    wf = build_workflow()
    import os
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'telegram-bot-workflow-v2.json')
    with open(output_path, 'w') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print(f"Written to {output_path}")
    print(f"Nodes: {len(wf['nodes'])}")
    print(f"Connections: {len(wf['connections'])}")
