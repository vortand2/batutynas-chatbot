#!/usr/bin/env python3
"""
Build Morning Briefing + Evening Check workflows (v2 — Calendar Bridge API).
Generates: morning-briefing-v2-workflow.json, evening-check-v2-workflow.json

These are cron-triggered workflows that send daily summaries via Telegram.
"""

import json, uuid, os

# IMPORTANT: Set BATUTYNAS_BOT_TOKEN env var. Rotate token if repo goes public.
BOT_TOKEN = os.environ.get('BATUTYNAS_BOT_TOKEN', '__TELEGRAM_BOT_TOKEN__')
TELEGRAM_CRED = {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}

# Client's Telegram chat ID — needs to be set after first interaction
# The bot sends a message to this chat ID on schedule
OWNER_CHAT_ID = "8258463322"

API_DASHBOARD = "https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-dashboard-v2"

# Lithuanian city coordinates for weather lookups (Open-Meteo)
CITY_COORDS = {
    'Klaipėda': (55.7033, 21.1443), 'Klaipeda': (55.7033, 21.1443),
    'Vilnius': (54.6872, 25.2797),
    'Kaunas': (54.8985, 23.9036),
    'Šiauliai': (55.9349, 23.3137), 'Siauliai': (55.9349, 23.3137),
    'Panevėžys': (55.7348, 24.3575), 'Panevezys': (55.7348, 24.3575),
    'Tauragė': (55.2522, 22.2892), 'Taurage': (55.2522, 22.2892),
    'Šilalė': (55.4917, 22.1850), 'Silale': (55.4917, 22.1850),
    'Šilutė': (55.3481, 21.4742), 'Silute': (55.3481, 21.4742),
    'Plungė': (55.9111, 21.8450), 'Plunge': (55.9111, 21.8450),
    'Telšiai': (55.9831, 22.2456), 'Telsiai': (55.9831, 22.2456),
    'Mažeikiai': (56.3092, 22.3425), 'Mazeikiai': (56.3092, 22.3425),
    'Palanga': (55.9203, 21.0686),
    'Jurbarkas': (55.0775, 22.7633),
    'Pagramantis': (55.3167, 22.5167),
    'Skuodas': (56.2692, 21.5278),
    'Gargždai': (55.7125, 21.3917), 'Gargzdai': (55.7125, 21.3917),
    'Kretinga': (55.8892, 21.2456),
}

def uid():
    return str(uuid.uuid4()).replace('-', '')[:20]

# ── City coordinates as JS constant for weather nodes ────────────────────────
CITY_COORDS_JS = "const CITY_COORDS = {\n"
for city, (lat, lon) in CITY_COORDS.items():
    CITY_COORDS_JS += f"  '{city}': [{lat}, {lon}],\n"
CITY_COORDS_JS += "};\n"

# ── Prepare Weather code (extracts unique cities → builds API URL) ──────────
PREPARE_WEATHER_CODE = CITY_COORDS_JS + r"""
const data = $input.first().json;
const bookings = data.bookings || [];
const now = new Date();
const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
const tmrwStr = tmrw.toISOString().substring(0, 10);

// Get unique delivery cities from tomorrow's bookings
const cities = new Set();
bookings.filter(b => b.event_date === tmrwStr).forEach(b => {
  if (b.city) cities.add(b.city);
  if (b.delivery_address) {
    // Try to extract city from address (last word or known city)
    const words = b.delivery_address.split(/[\s,]+/);
    for (const w of words) {
      if (CITY_COORDS[w]) { cities.add(w); break; }
    }
  }
});

// Find coordinates for matched cities
const matched = [];
for (const city of cities) {
  // Try exact match first, then case-insensitive
  if (CITY_COORDS[city]) {
    matched.push({ city, lat: CITY_COORDS[city][0], lon: CITY_COORDS[city][1] });
  } else {
    const lower = city.toLowerCase();
    for (const [k, v] of Object.entries(CITY_COORDS)) {
      if (k.toLowerCase() === lower) {
        matched.push({ city: k, lat: v[0], lon: v[1] });
        break;
      }
    }
  }
}

// Default to Klaipeda if no cities found (business HQ area)
if (matched.length === 0) {
  matched.push({ city: 'Klaipėda', lat: 55.7033, lon: 21.1443 });
}

// Use the first city for API call (Open-Meteo supports one location per request)
const primary = matched[0];
const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${primary.lat}&longitude=${primary.lon}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Europe/Vilnius&forecast_days=2`;

return [{ json: { ...data, weatherUrl, weatherCities: matched.map(m => m.city) } }];
"""

# ══════════════════════════════════════════════════════════════════════════════
# MORNING BRIEFING (07:00 daily)
# ══════════════════════════════════════════════════════════════════════════════

MORNING_FORMAT_CODE = r"""
const data = $('Prepare Weather').first().json;
const bookings = data.bookings || [];
const stats = data.stats || {};
const now = new Date();
const today = now.toISOString().substring(0, 10);
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const monthNames = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];

const dayName = dayNames[now.getDay()];
const todayBookings = bookings.filter(b => b.event_date === today);

// Tomorrow
const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
const tmrwStr = tmrw.toISOString().substring(0, 10);
const tmrwBookings = bookings.filter(b => b.event_date === tmrwStr);

function fmtBooking(b) {
  const equip = Array.isArray(b.equipment) && b.equipment.length > 0
    ? b.equipment.map(e => `${e.icon || '🎪'} ${e.name}`).join(', ')
    : (b.raw_summary || '?');
  let line = `  📌 ${equip}`;
  if (b.customer_name) line += `\n     👤 ${b.customer_name}`;
  if (b.customer_phone) line += ` | 📞 ${b.customer_phone}`;
  if (b.delivery_address) line += `\n     📍 ${b.delivery_address}`;
  if (b.price) line += `\n     💰 €${b.price}`;
  return line;
}

let msg = `☀️ <b>Ryto apžvalga — ${monthNames[now.getMonth()]} ${now.getDate()} (${dayName})</b>\n\n`;

// Today's bookings
if (todayBookings.length === 0) {
  msg += `📅 <b>Šiandien:</b> Laisva diena! 🎉\n`;
} else {
  msg += `📅 <b>Šiandien (${todayBookings.length} užs.):</b>\n`;
  todayBookings.forEach(b => { msg += fmtBooking(b) + '\n\n'; });
}

// Tomorrow preview
if (tmrwBookings.length > 0) {
  msg += `📅 <b>Rytoj (${tmrwBookings.length} užs.):</b>\n`;
  tmrwBookings.forEach(b => { msg += `  📌 ${b.raw_summary || '?'}\n`; });
  msg += '\n';
}

// Weather section
try {
  const weatherData = $('Fetch Weather').first().json;
  const prepData = $('Prepare Weather').first().json;
  const cities = prepData.weatherCities || [];
  if (weatherData && weatherData.daily) {
    const daily = weatherData.daily;
    // Index 1 = tomorrow (index 0 = today)
    const idx = daily.time && daily.time.length > 1 ? 1 : 0;
    const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : null;
    const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[idx] : null;
    const tempMin = daily.temperature_2m_min ? daily.temperature_2m_min[idx] : null;

    msg += `\n🌤️ <b>Rytojaus orai`;
    if (cities.length > 0) msg += ` (${cities[0]})`;
    msg += `:</b>\n`;
    if (tempMax !== null) msg += `  🌡️ ${tempMin !== null ? tempMin + '°' + '–' : ''}${tempMax}°C\n`;
    if (rainProb !== null) {
      if (rainProb >= 60) {
        msg += `  ⛈️ <b>Dėmesio! Lietus tikėtinas (${rainProb}%)</b>\n`;
        if (tmrwBookings.length > 0) {
          msg += `  ⚠️ Patikrinkite ${tmrwBookings.length} rytojaus užsakymą(-us)\n`;
        }
      } else if (rainProb >= 30) {
        msg += `  🌦️ Galimas lietus (${rainProb}%)\n`;
      } else {
        msg += `  ☀️ Lietus mažai tikėtinas (${rainProb}%)\n`;
      }
    }
  }
} catch(e) { /* weather fetch failed — skip silently */ }

// Month stats
msg += `\n📊 <b>Mėnesio suvestinė:</b>\n`;
msg += `  📦 Užsakymai: ${stats.month_count || 0}\n`;
msg += `  💰 Pajamos: €${stats.month_revenue || 0}\n`;

msg += `\n💬 Naudokite /help komandoms`;

return [{ json: { message: msg } }];
""".strip()

morning_nodes = [
    {
        "parameters": {"rule": {"interval": [{"triggerAtHour": 7, "triggerAtMinute": 0}]}},
        "id": uid(), "name": "Cron 07:00",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [240, 400]
    },
    {
        "parameters": {"method": "GET", "url": "=" + API_DASHBOARD + "?year={{ new Date().getFullYear() }}&month={{ new Date().getMonth()+1 }}",
                       "options": {"timeout": 15000}},
        "id": uid(), "name": "Fetch Today Data",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [460, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": PREPARE_WEATHER_CODE},
        "id": uid(), "name": "Prepare Weather",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [680, 400]
    },
    {
        "parameters": {"method": "GET", "url": "={{ $json.weatherUrl }}",
                       "options": {"timeout": 10000}},
        "id": uid(), "name": "Fetch Weather",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [900, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": MORNING_FORMAT_CODE},
        "id": uid(), "name": "Format Morning Briefing",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, 400]
    },
    {
        "parameters": {
            "resource": "message", "operation": "sendMessage",
            "chatId": f"={OWNER_CHAT_ID}" if OWNER_CHAT_ID else "={{ $vars.OWNER_CHAT_ID }}",
            "text": "={{ $json.message }}",
            "additionalFields": {"parse_mode": "HTML", "disable_web_page_preview": True}
        },
        "id": uid(), "name": "Send Morning Briefing",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1340, 400],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    }
]

morning_connections = {
    "Cron 07:00": {"main": [[{"node": "Fetch Today Data", "type": "main", "index": 0}]]},
    "Fetch Today Data": {"main": [[{"node": "Prepare Weather", "type": "main", "index": 0}]]},
    "Prepare Weather": {"main": [[{"node": "Fetch Weather", "type": "main", "index": 0}]]},
    "Fetch Weather": {"main": [[{"node": "Format Morning Briefing", "type": "main", "index": 0}]]},
    "Format Morning Briefing": {"main": [[{"node": "Send Morning Briefing", "type": "main", "index": 0}]]}
}

morning_workflow = {
    "name": "Batutynas: Morning Briefing V2 (Calendar)",
    "nodes": morning_nodes,
    "connections": morning_connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
    "tags": [{"name": "batutynas"}, {"name": "cron"}]
}

# ══════════════════════════════════════════════════════════════════════════════
# EVENING CHECK (21:00 daily)
# ══════════════════════════════════════════════════════════════════════════════

EVENING_FORMAT_CODE = r"""
const data = $('Prepare Weather').first().json;
const bookings = data.bookings || [];
const stats = data.stats || {};
const now = new Date();
const today = now.toISOString().substring(0, 10);
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];

// Today's recap
const todayBookings = bookings.filter(b => b.event_date === today);
const todayRevenue = todayBookings.reduce((sum, b) => sum + (b.price || 0), 0);

// Tomorrow preview
const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
const tmrwStr = tmrw.toISOString().substring(0, 10);
const tmrwBookings = bookings.filter(b => b.event_date === tmrwStr);

// Next 3 days preview
const upcoming = [];
for (let i = 1; i <= 3; i++) {
  const d = new Date(now); d.setDate(d.getDate() + i);
  const dStr = d.toISOString().substring(0, 10);
  const dayBks = bookings.filter(b => b.event_date === dStr);
  if (dayBks.length > 0) {
    upcoming.push({ date: dStr, day: dayNames[d.getDay()], count: dayBks.length, bookings: dayBks });
  }
}

let msg = `🌙 <b>Vakaro suvestinė</b>\n\n`;

// Today recap
msg += `📅 <b>Šiandienos rezultatai:</b>\n`;
msg += `  📦 Užsakymai: ${todayBookings.length}\n`;
msg += `  💰 Pajamos: €${todayRevenue}\n\n`;

// Upcoming days
if (upcoming.length > 0) {
  msg += `📆 <b>Artimiausi:</b>\n`;
  upcoming.forEach(u => {
    msg += `  ${u.day}: ${u.count} užs.`;
    const names = u.bookings.slice(0, 3).map(b => b.raw_summary || '?').join(', ');
    msg += ` (${names})`;
    msg += '\n';
  });
  msg += '\n';
} else {
  msg += `📆 Artimiausiomis dienomis užsakymų nėra\n\n`;
}

// Weather for tomorrow
try {
  const weatherData = $('Fetch Weather').first().json;
  const prepData = $('Prepare Weather').first().json;
  const cities = prepData.weatherCities || [];
  if (weatherData && weatherData.daily) {
    const daily = weatherData.daily;
    const idx = daily.time && daily.time.length > 1 ? 1 : 0;
    const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : null;
    const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[idx] : null;

    msg += `🌤️ <b>Rytojaus orai`;
    if (cities.length > 0) msg += ` (${cities[0]})`;
    msg += `:</b>\n`;
    if (tempMax !== null) msg += `  🌡️ ${tempMax}°C\n`;
    if (rainProb !== null && rainProb >= 60) {
      msg += `  ⛈️ <b>Lietus tikėtinas (${rainProb}%)!</b>\n`;
    } else if (rainProb !== null) {
      msg += `  ${rainProb >= 30 ? '🌦️' : '☀️'} Lietus: ${rainProb}%\n`;
    }
    msg += '\n';
  }
} catch(e) { /* weather fetch failed */ }

// Month progress
msg += `📊 <b>Mėnesio eiga:</b>\n`;
msg += `  📦 Iš viso: ${stats.month_count || 0} užs.\n`;
msg += `  💰 Pajamos: €${stats.month_revenue || 0}\n`;

msg += `\n😴 Geros nakties!`;

return [{ json: { message: msg } }];
""".strip()

evening_nodes = [
    {
        "parameters": {"rule": {"interval": [{"triggerAtHour": 21, "triggerAtMinute": 0}]}},
        "id": uid(), "name": "Cron 21:00",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [240, 400]
    },
    {
        "parameters": {"method": "GET", "url": "=" + API_DASHBOARD + "?year={{ new Date().getFullYear() }}&month={{ new Date().getMonth()+1 }}",
                       "options": {"timeout": 15000}},
        "id": uid(), "name": "Fetch Data",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [460, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": PREPARE_WEATHER_CODE},
        "id": uid(), "name": "Prepare Weather",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [680, 400]
    },
    {
        "parameters": {"method": "GET", "url": "={{ $json.weatherUrl }}",
                       "options": {"timeout": 10000}},
        "id": uid(), "name": "Fetch Weather",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [900, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": EVENING_FORMAT_CODE},
        "id": uid(), "name": "Format Evening Check",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, 400]
    },
    {
        "parameters": {
            "resource": "message", "operation": "sendMessage",
            "chatId": f"={OWNER_CHAT_ID}" if OWNER_CHAT_ID else "={{ $vars.OWNER_CHAT_ID }}",
            "text": "={{ $json.message }}",
            "additionalFields": {"parse_mode": "HTML", "disable_web_page_preview": True}
        },
        "id": uid(), "name": "Send Evening Check",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1340, 400],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    }
]

evening_connections = {
    "Cron 21:00": {"main": [[{"node": "Fetch Data", "type": "main", "index": 0}]]},
    "Fetch Data": {"main": [[{"node": "Prepare Weather", "type": "main", "index": 0}]]},
    "Prepare Weather": {"main": [[{"node": "Fetch Weather", "type": "main", "index": 0}]]},
    "Fetch Weather": {"main": [[{"node": "Format Evening Check", "type": "main", "index": 0}]]},
    "Format Evening Check": {"main": [[{"node": "Send Evening Check", "type": "main", "index": 0}]]}
}

evening_workflow = {
    "name": "Batutynas: Evening Check V2 (Calendar)",
    "nodes": evening_nodes,
    "connections": evening_connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
    "tags": [{"name": "batutynas"}, {"name": "cron"}]
}

# ── Write outputs ─────────────────────────────────────────────────────────────

base = os.path.dirname(__file__)

with open(os.path.join(base, "morning-briefing-v2-workflow.json"), 'w', encoding='utf-8') as f:
    json.dump(morning_workflow, f, indent=2, ensure_ascii=False)

with open(os.path.join(base, "evening-check-v2-workflow.json"), 'w', encoding='utf-8') as f:
    json.dump(evening_workflow, f, indent=2, ensure_ascii=False)

print(f"✅ morning-briefing-v2-workflow.json ({len(morning_nodes)} nodes)")
print(f"✅ evening-check-v2-workflow.json ({len(evening_nodes)} nodes)")
print(f"\n⚠️  Set OWNER_CHAT_ID in n8n variables or in this script before activating!")
print(f"\n📋 TD3 — Deactivate old workflows after deploying V2:")
print(f"  curl -X PATCH -H 'X-N8N-API-KEY: $N8N_API_KEY' \\")
print(f"    https://n8n-n8n.0uvai5.easypanel.host/api/v1/workflows/eDLsHZXR6Z0GtW0B \\")
print(f"    -d '{{\"active\": false}}'  # Telegram Bot V2")
print(f"  curl -X PATCH -H 'X-N8N-API-KEY: $N8N_API_KEY' \\")
print(f"    https://n8n-n8n.0uvai5.easypanel.host/api/v1/workflows/MfQv4nfdGRrW3tDH \\")
print(f"    -d '{{\"active\": false}}'  # Morning V1")
print(f"  curl -X PATCH -H 'X-N8N-API-KEY: $N8N_API_KEY' \\")
print(f"    https://n8n-n8n.0uvai5.easypanel.host/api/v1/workflows/i4LbPUNsEMFpboAQ \\")
print(f"    -d '{{\"active\": false}}'  # Evening V1")
