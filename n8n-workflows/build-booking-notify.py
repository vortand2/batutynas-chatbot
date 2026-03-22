#!/usr/bin/env python3
"""
Batutynas: Booking Notification Workflow Builder

Generates a workflow that handles chatbot booking submissions:
  1. Receives data via webhook POST or sub-workflow trigger
  2. Sends email notification to owner (dovydasdobrovolskis@gmail.com)
  3. Sends Telegram notification to owner (chat ID 8258463322)
  4. Saves to PostgreSQL (optional, for booking requests with phone)

Note: NO automatic calendar event creation — owner confirms booking
manually by calling the customer, then adds to Google Calendar himself.

Entry points:
  - Webhook POST /batutynas-booking-notify (for demo page / widget direct submissions)
  - Execute Workflow Trigger (for AI Agent tool calls via Chatwoot)

Replaces: tool-booking-notify.json (workflow ID 0RTcCw1WcdEJDZYo)
"""

import json, uuid, os, textwrap

# ── Credentials ──────────────────────────────────────────────────────────────
SMTP_CRED = {"id": "UHVHpJrJED5CHOJh", "name": "SMTP account"}
POSTGRES_CRED = {"id": "Xc90UM12HHMH6z3A", "name": "Batutynas PostgreSQL"}
TELEGRAM_CRED = {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}

# All secrets from env vars — NO hardcoded fallbacks. Set in .env before running.
BOT_TOKEN = os.environ['BATUTYNAS_BOT_TOKEN']
OWNER_CHAT_ID = os.environ['BATUTYNAS_OWNER_CHAT_ID']
OWNER_EMAIL = os.environ.get('BATUTYNAS_OWNER_EMAIL', 'dovydasdobrovolskis@gmail.com')
# Calendar event creation removed — owner confirms booking manually

# ── Helpers ──────────────────────────────────────────────────────────────────
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

# ══════════════════════════════════════════════════════════════════════════════
# CODE BLOCKS
# ══════════════════════════════════════════════════════════════════════════════

PARSE_BOOKING_CODE = r"""
// Fields arrive from toolWorkflow (.query wrapper) or webhook POST (.body wrapper)
const raw = $input.first().json;
// raw.query is {} (truthy but empty) from webhook — check for actual content
const hasQuery = raw.query && Object.keys(raw.query).length > 0;
const hasBody = raw.body && Object.keys(raw.body).length > 0;
const input = hasQuery ? raw.query : hasBody ? raw.body : raw;

// Sanitize: strip newlines/carriage returns/control chars to prevent email header injection
function sanitize(val) {
  return (val || 'Nenurodyta').replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ').substring(0, 500);
}

// HTML-escape for Telegram parse_mode:HTML (prevents 400 errors from <, >, &)
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Format Lithuanian phone: 861234567, +37061234567, 61234567 → +370 612 34567
function formatPhone(phone) {
  var raw = (phone || '').replace(/[^\d+]/g, '');
  var digits = raw.replace(/\D/g, '');
  if (digits.startsWith('370') && digits.length >= 11) {
    return '+' + digits.substring(0,3) + ' ' + digits.substring(3,6) + ' ' + digits.substring(6);
  }
  if (digits.startsWith('8') && digits.length >= 9) {
    digits = '370' + digits.substring(1);
    return '+' + digits.substring(0,3) + ' ' + digits.substring(3,6) + ' ' + digits.substring(6);
  }
  if (digits.length >= 8 && digits.startsWith('6')) {
    digits = '370' + digits;
    return '+' + digits.substring(0,3) + ' ' + digits.substring(3,6) + ' ' + digits.substring(6);
  }
  return raw || 'Nenurodyta';
}

const groupType = sanitize(input.group_type);
const date = sanitize(input.date);
const location = sanitize(input.location);
const address = input.address ? sanitize(input.address) : null;
const eventType = sanitize(input.event_type);
const guestCount = sanitize(input.guest_count);
const contactName = sanitize(input.contact_name);
const contactPhone = formatPhone(input.contact_phone);
const trampolinePreference = sanitize(input.trampoline_preference);
const addons = input.addons ? sanitize(input.addons) : null;
const dimensions = input.dimensions ? sanitize(input.dimensions) : null;
const colors = input.colors ? sanitize(input.colors) : null;
const characters = input.characters ? sanitize(input.characters) : null;
const notes = input.notes ? sanitize(input.notes) : null;
const email = input.email ? sanitize(input.email) : null;
const requestType = input.request_type || 'booking';

// ── Build email subject + body ──
let emailSubject, emailBody;

if (requestType === 'catalog') {
  emailSubject = `Katalogo užklausa: ${email || contactName}`;
  emailBody = `Nauja batutų katalogo užklausa iš pokalbių roboto:\n\n` +
    `El. paštas: ${email || 'Nenurodyta'}\n` +
    `Kontaktas: ${contactName}\n` +
    `Telefonas: ${contactPhone}\n\n` +
    `--- Šis pranešimas sugeneruotas automatiškai iš Batutynas.lt pokalbių roboto ---`;
} else if (requestType === 'custom') {
  emailSubject = `Individuali gamyba: ${contactName}`;
  emailBody = `Nauja individualaus batuto gamybos užklausa:\n\n` +
    `Kontaktas: ${contactName}\n` +
    `Telefonas: ${contactPhone}\n` +
    `El. paštas: ${email || 'Nenurodyta'}\n\n` +
    `GAMYBOS DETALĖS:\n` +
    `Matmenys: ${dimensions || 'Nenurodyta'}\n` +
    `Spalvos: ${colors || 'Nenurodyta'}\n` +
    `Personažai/tema: ${characters || 'Nenurodyta'}\n` +
    `Papildomi pageidavimai: ${notes || 'Nenurodyta'}\n\n` +
    `--- Šis pranešimas sugeneruotas automatiškai iš Batutynas.lt pokalbių roboto ---`;
} else {
  emailSubject = `Nauja užklausa: ${groupType} - ${date} (${contactName})`;
  emailBody = `Nauja batuto užsakymo užklausa iš svetainės pokalbių roboto:\n\n` +
    `Grupė: ${groupType}\n` +
    `Data: ${date}\n` +
    `Vieta: ${location}\n` +
    `Adresas: ${address || location}\n` +
    `Renginio tipas: ${eventType}\n` +
    `Svečių skaičius: ${guestCount}\n` +
    `Kontaktinis asmuo: ${contactName}\n` +
    `Telefonas: ${contactPhone}\n` +
    `Pageidaujamas batutas: ${trampolinePreference}\n` +
    `Papildomos pramogos: ${addons || 'Nenurodyta'}\n\n` +
    `--- Šis pranešimas sugeneruotas automatiškai iš Batutynas.lt pokalbių roboto ---`;
}

// ── Build Telegram message (HTML) ──
let telegramMsg;

if (requestType === 'catalog') {
  telegramMsg = `📬 <b>Nauja katalogo užklausa</b>\n────────────────────\n` +
    `👤 ${escHtml(contactName)}\n📞 ${escHtml(contactPhone)}\n✉️ ${escHtml(email || 'Nenurodyta')}`;
} else if (requestType === 'custom') {
  telegramMsg = `🔧 <b>Individuali gamyba</b>\n────────────────────\n` +
    `👤 ${escHtml(contactName)}\n📞 ${escHtml(contactPhone)}\n` +
    `📐 ${escHtml(dimensions || '-')}\n🎨 ${escHtml(colors || '-')}\n🎭 ${escHtml(characters || '-')}`;
} else {
  telegramMsg = `🆕 <b>Nauja užklausa iš svetainės!</b>\n────────────────────\n` +
    `👤 ${escHtml(contactName)}\n📞 ${escHtml(contactPhone)}\n` +
    `📅 ${escHtml(date)}\n📍 ${escHtml(location)}${address && address !== location ? ' / ' + escHtml(address) : ''}\n` +
    `🎪 ${escHtml(trampolinePreference)}\n🎉 ${escHtml(eventType)}\n👥 ${escHtml(guestCount)} svečių`;
  if (addons && addons !== 'Nenurodyta') telegramMsg += `\n➕ ${escHtml(addons)}`;
  telegramMsg += `\n\n💡 <i>Paskambinkite klientui patvirtinti datą</i>`;
}

// No calendar event creation — owner confirms booking manually after calling the customer

// Build HTML email for better formatting
const emailHtml = emailBody
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\n/g, '<br>')
  .replace(/---/g, '<hr>')
  .replace(/(Grupė|Data|Vieta|Adresas|Renginio tipas|Svečių skaičius|Kontaktinis asmuo|Telefonas|Pageidaujamas batutas|Papildomos pramogos|El\. paštas|Kontaktas|Matmenys|Spalvos|Personažai\/tema|Papildomi pageidavimai|GAMYBOS DETALĖS):/g, '<b>$1:</b>');

return [{
  json: {
    date, location, address, eventType, guestCount,
    contactName, contactPhone, trampolinePreference, addons,
    groupType, requestType, dimensions, colors, characters, notes, email,
    emailSubject, emailBody, emailHtml, telegramMsg
  }
}];
""".strip()

BUILD_DB_QUERY_CODE = r"""
const data = $input.first().json;

if (data.requestType !== 'booking') {
  return [{ json: { hasSql: false } }];
}

function esc(v) { return (v || '').replace(/'/g, "''"); }

function normalizePhone(phone) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  if (digits.startsWith('370') && digits.length >= 11) return '+' + digits;
  if (digits.startsWith('8') && digits.length >= 9) return '+370' + digits.substring(1);
  if (digits.startsWith('6') && digits.length >= 8) return '+370' + digits;
  return phone || '';
}

const name = esc(data.contactName);
const phone = esc(normalizePhone(data.contactPhone));

if (!phone || phone === 'Nenurodyta') {
  return [{ json: { hasSql: false } }];
}

const eventDate = (data.date && data.date !== 'Nenurodyta') ? esc(data.date) : null;
const address = esc(data.address || data.location || '');
const city = esc(data.location || '');

const notesParts = [];
if (data.eventType && data.eventType !== 'Nenurodyta') notesParts.push('Renginys: ' + data.eventType);
if (data.guestCount && data.guestCount !== 'Nenurodyta') notesParts.push('Svečiai: ' + data.guestCount);
if (data.groupType && data.groupType !== 'Nenurodyta') notesParts.push('Grupė: ' + data.groupType);
if (data.notes) notesParts.push(data.notes);
const notes = esc(notesParts.join('; '));

const equipmentNames = [];
if (data.trampolinePreference && data.trampolinePreference !== 'Nenurodyta') {
  equipmentNames.push(data.trampolinePreference.trim());
}
if (data.addons && data.addons !== 'Nenurodyta') {
  data.addons.split(',').forEach(a => {
    const trimmed = a.trim();
    if (trimmed) equipmentNames.push(trimmed);
  });
}

const equipArraySql = equipmentNames.length > 0
  ? 'ARRAY[' + equipmentNames.map(n => "'" + esc(n) + "'").join(',') + ']'
  : "ARRAY[]::text[]";

let sql = `
WITH contact_upsert AS (
  INSERT INTO batutynas.contacts (name, phone, source)
  VALUES ('${name}', '${phone}', 'Chatbot')
  ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
),
new_booking AS (
  INSERT INTO batutynas.bookings (
    contact_id, event_date, delivery_address, city,
    status, entry_source, notes
  )
  SELECT cu.id, ${eventDate ? "'" + eventDate + "'::date" : 'CURRENT_DATE'},
    '${address}', '${city}', 'Inquiry', 'Chatbot', '${notes}'
  FROM contact_upsert cu
  RETURNING id
)`;

if (equipmentNames.length > 0) {
  sql += `,
equipment_link AS (
  INSERT INTO batutynas.booking_equipment (booking_id, equipment_id)
  SELECT nb.id, e.id
  FROM new_booking nb
  CROSS JOIN batutynas.equipment e
  WHERE e.name = ANY(${equipArraySql})
  ON CONFLICT DO NOTHING
)`;
}

sql += `\nSELECT nb.id AS booking_id FROM new_booking nb;`;

return [{ json: { hasSql: true, sql } }];
""".strip()

PREPARE_TELEGRAM_CODE = r"""
const parsed = $('Parse Booking Data').first().json;
const telegramMsg = parsed.telegramMsg;
const requestType = parsed.requestType;

// booking_id comes from Save to Database result, or null if IF was false / save failed
const inputData = $input.first().json;
const bookingId = inputData.booking_id || null;

const OWNER = '__OWNER_CHAT_ID__';

const chatBody = {
  chat_id: OWNER,
  text: telegramMsg,
  parse_mode: 'HTML'
};

// Only add action buttons for booking requests with a valid DB booking_id
if (bookingId && requestType === 'booking') {
  const p = parsed;
  const miniAppUrl = 'https://vortand2.github.io/batutynas-chatbot/mini-app/index.html' +
    '?name=' + encodeURIComponent(p.contactName || '') +
    '&phone=' + encodeURIComponent(p.contactPhone || '') +
    '&date=' + encodeURIComponent(p.date || '') +
    '&equipment=' + encodeURIComponent(p.trampolinePreference || '') +
    '&city=' + encodeURIComponent(p.location || '') +
    '&chatId=' + OWNER +
    '&bk=' + bookingId;

  chatBody.reply_markup = {
    inline_keyboard: [
      [
        { text: '✏️ Redaguoti', web_app: { url: miniAppUrl } }
      ],
      [
        { text: '✅ Patvirtinti', callback_data: 'bk_ok:' + bookingId },
        { text: '❌ Atmesti', callback_data: 'bk_no:' + bookingId }
      ]
    ]
  };
}

return [{ json: { chatBody: JSON.stringify(chatBody) } }];
""".strip().replace('__OWNER_CHAT_ID__', OWNER_CHAT_ID)

RETURN_CONFIRMATION_CODE = r"""
return [{
  json: {
    result: 'Užklausa sėkmingai išsiųsta administratoriui ir išsaugota sistemoje. El. laiškas ir Telegram pranešimas išsiųsti. Klientui pasakykite, kad susisieksime per 2 darbo valandas. Booking inquiry sent successfully — email and Telegram notification delivered.'
  }
}];
""".strip()

# ══════════════════════════════════════════════════════════════════════════════
# BUILD WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

# ── 1a. Webhook Trigger (for demo page / widget direct POST) ─────────────────

add_node({
    "parameters": {
        "httpMethod": "POST",
        "path": "batutynas-booking-notify",
        "responseMode": "responseNode",
        "options": {}
    },
    "id": uid(),
    "name": "Webhook",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 1,
    "position": pos(220, 200),
    "webhookId": "batutynas-booking-notify"
})

# ── 1b. Sub-Workflow Trigger (for AI Agent tool calls) ────────────────────────

add_node({
    "parameters": {},
    "id": uid(),
    "name": "Execute Workflow Trigger",
    "type": "n8n-nodes-base.executeWorkflowTrigger",
    "typeVersion": 1,
    "position": pos(220, 400)
})

# ── 2. Parse Booking Data ─────────────────────────────────────────────────────

add_node({
    "parameters": {"jsCode": PARSE_BOOKING_CODE},
    "id": uid(),
    "name": "Parse Booking Data",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(500, 300)
})
connect("Webhook", "Parse Booking Data")
connect("Execute Workflow Trigger", "Parse Booking Data")

# ── 3a. Send Email to Owner ───────────────────────────────────────────────────

add_node({
    "parameters": {
        "fromEmail": OWNER_EMAIL,
        "toEmail": OWNER_EMAIL,
        "subject": "={{ $json.emailSubject }}",
        "emailFormat": "html",
        "html": "={{ $json.emailHtml }}",
        "options": {}
    },
    "id": uid(),
    "name": "Send Email",
    "type": "n8n-nodes-base.emailSend",
    "typeVersion": 2.1,
    "position": pos(780, 140),
    "credentials": {"smtp": SMTP_CRED},
    "onError": "continueRegularOutput"
})
connect("Parse Booking Data", "Send Email")

# ── 3b. Build DB Query → IF → Save → Prepare Telegram → Send Telegram ──────

add_node({
    "parameters": {"jsCode": BUILD_DB_QUERY_CODE},
    "id": uid(),
    "name": "Build DB Query",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(780, 500)
})
connect("Parse Booking Data", "Build DB Query")

# (No calendar event creation — owner confirms booking manually after calling the customer)

# ── 4a. IF Should Save to DB ─────────────────────────────────────────────────

add_node({
    "parameters": {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "combinator": "and",
            "conditions": [{
                "id": uid(),
                "leftValue": "={{ $json.hasSql }}",
                "rightValue": True,
                "operator": {"type": "boolean", "operation": "equals"}
            }]
        }
    },
    "id": uid(),
    "name": "IF Should Save to DB",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": pos(1020, 500)
})
connect("Build DB Query", "IF Should Save to DB")

# ── 4b. Save to Database ─────────────────────────────────────────────────────

add_node({
    "parameters": {
        "operation": "executeQuery",
        "query": "={{ $json.sql }}",
        "options": {}
    },
    "id": uid(),
    "name": "Save to Database",
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2.5,
    "position": pos(1260, 500),
    "credentials": {"postgres": POSTGRES_CRED},
    "onError": "continueRegularOutput"
})
connect("IF Should Save to DB", "Save to Database", 0)  # true branch

# ── 4c. Prepare Telegram (builds message body with or without action buttons) ─

add_node({
    "parameters": {"jsCode": PREPARE_TELEGRAM_CODE},
    "id": uid(),
    "name": "Prepare Telegram",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(1500, 500)
})
connect("Save to Database", "Prepare Telegram")
connect("IF Should Save to DB", "Prepare Telegram", 1)  # false branch → no DB save

# ── 4d. Send Telegram Notification ────────────────────────────────────────────

add_node({
    "parameters": {
        "method": "POST",
        "url": f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ $json.chatBody }}",
        "options": {"timeout": 10000}
    },
    "id": uid(),
    "name": "Send Telegram",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": pos(1740, 500),
    "continueOnFail": True
})
connect("Prepare Telegram", "Send Telegram")

# ── 5. Return Confirmation ────────────────────────────────────────────────────
# Runs after Send Email; then flows into Respond OK (the shared terminal node)

add_node({
    "parameters": {"jsCode": RETURN_CONFIRMATION_CODE},
    "id": uid(),
    "name": "Return Confirmation",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(1060, 140)
})
connect("Send Email", "Return Confirmation")

# ── 5b. Respond to Webhook (terminal node — both branches converge here) ───────
# Email branch:    Send Email → Return Confirmation → Respond OK
# Telegram branch: Send Telegram → Respond OK
# responseMode: "responseNode" requires this node to be reachable from BOTH branches.
# continueOnFail prevents crash when triggered as sub-workflow (no webhook context).

add_node({
    "parameters": {
        "respondWith": "json",
        "responseBody": '={{ JSON.stringify({ success: true, message: "Užklausa priimta." }) }}',
        "options": {
            "responseHeaders": {
                "entries": [
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "Access-Control-Allow-Origin", "value": "*"}
                ]
            }
        }
    },
    "id": uid(),
    "name": "Respond OK",
    "type": "n8n-nodes-base.respondToWebhook",
    "typeVersion": 1,
    "position": pos(1980, 300),
    "continueOnFail": True  # Prevents crash when called as sub-workflow (no webhook context)
})
connect("Return Confirmation", "Respond OK")
connect("Send Telegram", "Respond OK")

# ══════════════════════════════════════════════════════════════════════════════
# ASSEMBLE WORKFLOW JSON
# ══════════════════════════════════════════════════════════════════════════════

workflow = {
    "name": "Batutynas: Booking Notification Tool",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"}
}

output_path = os.path.join(os.path.dirname(__file__), "booking-notify-workflow.json")
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print(f"✅ Generated {output_path}")
print(f"   {len(nodes)} nodes, {len(connections)} connection groups")
print()
print("📌 Architecture:")
print("   Entry points:")
print(f"     POST /webhook/batutynas-booking-notify (demo/widget)")
print(f"     Execute Workflow Trigger (AI Agent tool)")
print("   Notifications:")
print(f"     📧 Email → {OWNER_EMAIL}")
print(f"     📱 Telegram → chat {OWNER_CHAT_ID}")
print(f"     🗄️ PostgreSQL → via cred {POSTGRES_CRED['id']}")
print(f"     📅 Calendar → NO (owner confirms manually)")
print()
print("📌 Deploy:")
print(f"   curl -sk -X PUT https://n8n-n8n.0uvai5.easypanel.host/api/v1/workflows/0RTcCw1WcdEJDZYo \\")
print(f"     -H 'x-n8n-api-key: $N8N_KEY' -H 'Content-Type: application/json' -d @{output_path}")
print()
print("⚠️  SMTP Setup Required:")
print("   1. Enable 2-Step Verification on dovydasdobrovolskis@gmail.com")
print("   2. Generate App Password: https://myaccount.google.com/apppasswords")
print("   3. In n8n → Credentials → 'SMTP account' → configure:")
print("      Host: smtp.gmail.com")
print("      Port: 465 (SSL) or 587 (TLS)")
print("      User: dovydasdobrovolskis@gmail.com")
print("      Password: (App Password from step 2)")
print("      SSL/TLS: true")
