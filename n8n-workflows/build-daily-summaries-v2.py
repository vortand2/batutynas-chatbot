#!/usr/bin/env python3
"""
Build Morning Briefing + Evening Check workflows (v2 — Calendar Bridge API + Gemini).
Generates: morning-briefing-v2-workflow.json, evening-check-v2-workflow.json

These are cron-triggered workflows that send daily summaries via Telegram.
Gemini generates intelligent narrative summaries from booking + weather data.
"""

import json, uuid, os

# All secrets loaded from environment variables — NO hardcoded fallbacks.
# Set these in .env file or export before running: source .env && python3 build-daily-summaries-v2.py
BOT_TOKEN = os.environ['BATUTYNAS_BOT_TOKEN']
TELEGRAM_CRED = {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}
GEMINI_CRED = {"id": "V0fvCRokUIPzfmGC", "name": "Google Gemini(PaLM) Api account"}
GEMINI_API_KEY = os.environ['GEMINI_API_KEY']
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
OWNER_CHAT_ID = os.environ['BATUTYNAS_OWNER_CHAT_ID']

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
const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${primary.lat}&longitude=${primary.lon}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&timezone=Europe/Vilnius&forecast_days=2`;

return [{ json: { ...data, weatherUrl, weatherCities: matched.map(m => m.city) } }];
"""

# ══════════════════════════════════════════════════════════════════════════════
# MORNING BRIEFING (07:00 daily)
# ══════════════════════════════════════════════════════════════════════════════

BUILD_MORNING_PROMPT_CODE = r"""
const data = $('Prepare Weather').first().json;
const bookings = data.bookings || [];
const stats = data.stats || {};
const now = new Date();
const today = now.toISOString().substring(0, 10);
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const monthNames = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];

const dayName = dayNames[now.getDay()];
const todayBookings = bookings.filter(b => b.event_date === today);

const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
const tmrwStr = tmrw.toISOString().substring(0, 10);
const tmrwBookings = bookings.filter(b => b.event_date === tmrwStr);

function fmtBooking(b) {
  const equip = Array.isArray(b.equipment) && b.equipment.length > 0
    ? b.equipment.map(e => `${e.icon || ''} ${e.name}`).join(', ')
    : (b.raw_summary || '?');
  let line = `- ${equip}`;
  if (b.customer_name) line += ` | ${b.customer_name}`;
  if (b.customer_phone) line += ` | ${b.customer_phone}`;
  if (b.delivery_address) line += ` | ${b.delivery_address}`;
  if (b.price) line += ` | ${b.price}€`;
  return line;
}

const todayList = todayBookings.length > 0
  ? todayBookings.map(fmtBooking).join('\n')
  : 'Nėra užsakymų šiandien';

const tmrwList = tmrwBookings.length > 0
  ? tmrwBookings.map(fmtBooking).join('\n')
  : 'Nėra užsakymų rytoj';

// Weather data
let weatherSection = '';
try {
  const weatherData = $('Fetch Weather').first().json;
  const prepData = $('Prepare Weather').first().json;
  const cities = prepData.weatherCities || [];
  if (weatherData && weatherData.daily) {
    const daily = weatherData.daily;
    const idx = daily.time && daily.time.length > 1 ? 1 : 0;
    const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : null;
    const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[idx] : null;
    const tempMin = daily.temperature_2m_min ? daily.temperature_2m_min[idx] : null;
    const windMax = daily.wind_speed_10m_max ? daily.wind_speed_10m_max[idx] : null;
    const city = cities.length > 0 ? cities[0] : 'Klaipėda';

    if (rainProb !== null && rainProb >= 30) {
      weatherSection = `\nORAI RYTOJ (${city}): ${tempMin || '?'}–${tempMax || '?'}°C, lietaus tikimybė ${rainProb}%`;
      if (windMax !== null) weatherSection += `, vėjas iki ${windMax} km/h`;
      if ((rainProb >= 60 || (windMax !== null && windMax >= 40)) && tmrwBookings.length > 0) {
        weatherSection += `\n🚨 PERSPĖJIMAS: `;
        if (windMax >= 40) weatherSection += `Stiprus vėjas (${windMax} km/h) — PAVOJINGA pripučiamiems batutams! `;
        if (rainProb >= 60) weatherSection += `Didelis lietaus tikimybė (${rainProb}%). `;
        weatherSection += `Yra ${tmrwBookings.length} užsakymas(-ai) rytoj — BŪTINA susisiekti su klientais dėl perkėlimo!`;
      }
    } else if (rainProb !== null) {
      weatherSection = `\nORAI RYTOJ (${city}): ${tempMin || '?'}–${tempMax || '?'}°C, giedra (lietaus ${rainProb}%)`;
      if (windMax !== null && windMax >= 40) {
        weatherSection += `\n🚨 PERSPĖJIMAS: Stiprus vėjas (${windMax} km/h) — PAVOJINGA pripučiamiems batutams!`;
        if (tmrwBookings.length > 0) weatherSection += ` Yra ${tmrwBookings.length} užsakymas(-ai) rytoj — BŪTINA susisiekti su klientais!`;
      } else if (windMax !== null) {
        weatherSection += `, vėjas ${windMax} km/h`;
      }
    }
  }
} catch(e) { weatherSection = ''; }

const prompt = `Tu esi Batutynas.lt batutų nuomos verslo asistentas. Parašyk TRUMPĄ ryto apžvalgą kaip Telegram žinutę.

DATA: ${monthNames[now.getMonth()]} ${now.getDate()} d. (${dayName})

ŠIANDIENOS UŽSAKYMAI (${todayBookings.length}):
${todayList}

RYTOJAUS UŽSAKYMAI (${tmrwBookings.length}):
${tmrwList}
${weatherSection}

MĖNESIO STATISTIKA:
- Užsakymai: ${stats.month_count || 0}
- Pajamos: ${stats.month_revenue || 0}€

TAISYKLĖS:
- Rašyk TIKTAI lietuviškai
- Naudok Telegram HTML: <b>bold</b>, <i>italic</i>
- Pradėk nuo emoji ir pasisveikinimo
- Jei orai blogi (lietus >50% arba vėjas >40 km/h) — aiškiai perspėk ir pasiūlyk susisiekti su klientais dėl perkėlimo
- Jei vėjas >40 km/h — tai PAVOJINGA pripučiamiems batutams, būtinai perspėk!
- Jei orai geri arba nėra duomenų — NEMINĖK orų, sutelk dėmesį į užsakymus
- Jei nėra užsakymų šiandien — padrąsink (pvz. "gera diena pasiruošti savaitgaliui" arba "puikus laikas paskelbti akciją socialiniuose tinkluose")
- Paminėk kiekvieno užsakymo klientą, įrangą ir vietą
- Pabaigoje — trumpa mėnesio statistika viena eilute
- Maksimum 400 žodžių
- NENAUDOK markdown (**, ##) — TIK HTML (<b>, <i>)
- Nerašyk "Gemini" ar "AI" — tu esi verslo asistentas`;

return [{ json: { prompt } }];
""".strip()

FORMAT_GEMINI_REPLY_CODE = r"""
const input = $input.first().json;
// Gemini REST API response format: candidates[0].content.parts[0].text
const text = input?.candidates?.[0]?.content?.parts?.[0]?.text
  || input?.response?.text || input?.text || input?.output || '';
if (!text) {
  return [{ json: { message: '⚠️ Nepavyko sugeneruoti apžvalgos. Patikrinkite Gemini API.' } }];
}
// Convert any accidental markdown to HTML
let msg = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/__(.*?)__/g, '<i>$1</i>');
// Remove markdown headers
msg = msg.replace(/^#{1,3}\s+/gm, '');
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
        "parameters": {"method": "GET", "url": "=" + API_DASHBOARD + "?month={{ new Date().getFullYear() }}-{{ String(new Date().getMonth()+1).padStart(2,'0') }}",
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
        "parameters": {"jsCode": BUILD_MORNING_PROMPT_CODE},
        "id": uid(), "name": "Build Morning Prompt",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, 400]
    },
    {
        "parameters": {
            "method": "POST",
            "url": GEMINI_URL,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.3 } }) }}',
            "options": {"timeout": 30000}
        },
        "id": uid(), "name": "Call Gemini",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1340, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": FORMAT_GEMINI_REPLY_CODE},
        "id": uid(), "name": "Format Reply",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1560, 400]
    },
    {
        "parameters": {
            "resource": "message", "operation": "sendMessage",
            "chatId": f"={OWNER_CHAT_ID}" if OWNER_CHAT_ID else "={{ $vars.OWNER_CHAT_ID }}",
            "text": "={{ $json.message }}",
            "additionalFields": {"parse_mode": "HTML"}
        },
        "id": uid(), "name": "Send Morning Briefing",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1780, 400],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    }
]

morning_connections = {
    "Cron 07:00": {"main": [[{"node": "Fetch Today Data", "type": "main", "index": 0}]]},
    "Fetch Today Data": {"main": [[{"node": "Prepare Weather", "type": "main", "index": 0}]]},
    "Prepare Weather": {"main": [[{"node": "Fetch Weather", "type": "main", "index": 0}]]},
    "Fetch Weather": {"main": [[{"node": "Build Morning Prompt", "type": "main", "index": 0}]]},
    "Build Morning Prompt": {"main": [[{"node": "Call Gemini", "type": "main", "index": 0}]]},
    "Call Gemini": {"main": [[{"node": "Format Reply", "type": "main", "index": 0}]]},
    "Format Reply": {"main": [[{"node": "Send Morning Briefing", "type": "main", "index": 0}]]}
}

morning_workflow = {
    "name": "Batutynas: Morning Briefing V2 (Calendar)",
    "nodes": morning_nodes,
    "connections": morning_connections,
    "active": False,
    "settings": {"executionOrder": "v1", "timezone": "Europe/Vilnius"},
    "tags": [{"name": "batutynas"}, {"name": "cron"}]
}

# ══════════════════════════════════════════════════════════════════════════════
# EVENING CHECK (21:00 daily)
# ══════════════════════════════════════════════════════════════════════════════

BUILD_EVENING_PROMPT_CODE = r"""
const data = $('Prepare Weather').first().json;
const bookings = data.bookings || [];
const stats = data.stats || {};
const now = new Date();
const today = now.toISOString().substring(0, 10);
const dayNames = ['Sekmadienis', 'Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis'];
const monthNames = ['Sausio', 'Vasario', 'Kovo', 'Balandžio', 'Gegužės', 'Birželio', 'Liepos', 'Rugpjūčio', 'Rugsėjo', 'Spalio', 'Lapkričio', 'Gruodžio'];

const todayBookings = bookings.filter(b => b.event_date === today);
const todayRevenue = todayBookings.reduce((sum, b) => sum + (b.price || 0), 0);

const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
const tmrwStr = tmrw.toISOString().substring(0, 10);
const tmrwBookings = bookings.filter(b => b.event_date === tmrwStr);

// Next 3 days
const upcomingLines = [];
for (let i = 1; i <= 3; i++) {
  const d = new Date(now); d.setDate(d.getDate() + i);
  const dStr = d.toISOString().substring(0, 10);
  const dayBks = bookings.filter(b => b.event_date === dStr);
  if (dayBks.length > 0) {
    const names = dayBks.slice(0, 3).map(b => b.raw_summary || '?').join(', ');
    upcomingLines.push(`${dayNames[d.getDay()]}: ${dayBks.length} užs. (${names})`);
  }
}

function fmtBooking(b) {
  const equip = Array.isArray(b.equipment) && b.equipment.length > 0
    ? b.equipment.map(e => `${e.icon || ''} ${e.name}`).join(', ')
    : (b.raw_summary || '?');
  let line = `- ${equip}`;
  if (b.customer_name) line += ` | ${b.customer_name}`;
  if (b.delivery_address) line += ` | ${b.delivery_address}`;
  if (b.price) line += ` | ${b.price}€`;
  return line;
}

// Weather
let weatherSection = '';
try {
  const weatherData = $('Fetch Weather').first().json;
  const prepData = $('Prepare Weather').first().json;
  const cities = prepData.weatherCities || [];
  if (weatherData && weatherData.daily) {
    const daily = weatherData.daily;
    const idx = daily.time && daily.time.length > 1 ? 1 : 0;
    const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : null;
    const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[idx] : null;
    const windMax = daily.wind_speed_10m_max ? daily.wind_speed_10m_max[idx] : null;
    const city = cities.length > 0 ? cities[0] : 'Klaipėda';

    if (rainProb !== null && rainProb >= 30) {
      weatherSection = `\nORAI RYTOJ (${city}): ${tempMax || '?'}°C, lietaus tikimybė ${rainProb}%`;
      if (windMax !== null) weatherSection += `, vėjas iki ${windMax} km/h`;
      if ((rainProb >= 60 || (windMax !== null && windMax >= 40)) && tmrwBookings.length > 0) {
        weatherSection += `\n🚨 PERSPĖJIMAS: `;
        if (windMax >= 40) weatherSection += `Stiprus vėjas (${windMax} km/h) — PAVOJINGA! `;
        if (rainProb >= 60) weatherSection += `Didelis lietaus tikimybė (${rainProb}%). `;
        weatherSection += `Rytoj yra ${tmrwBookings.length} užsakymas(-ai) — BŪTINA susisiekti su klientais dėl perkėlimo!`;
      }
    } else if (windMax !== null && windMax >= 40 && tmrwBookings.length > 0) {
      weatherSection = `\n🚨 PERSPĖJIMAS (${city}): Stiprus vėjas rytoj (${windMax} km/h) — PAVOJINGA pripučiamiems batutams!`;
      weatherSection += ` Yra ${tmrwBookings.length} užsakymas(-ai) — BŪTINA susisiekti su klientais!`;
    }
  }
} catch(e) { weatherSection = ''; }

const prompt = `Tu esi Batutynas.lt batutų nuomos verslo asistentas. Parašyk TRUMPĄ vakaro suvestinę kaip Telegram žinutę.

DATA: ${monthNames[now.getMonth()]} ${now.getDate()} d. (${dayNames[now.getDay()]})

ŠIANDIENOS REZULTATAI:
- Užsakymų: ${todayBookings.length}
- Pajamos: ${todayRevenue}€
${todayBookings.length > 0 ? '\nŠiandienos užsakymai:\n' + todayBookings.map(fmtBooking).join('\n') : ''}

ARTIMIAUSI 3 DIENŲ UŽSAKYMAI:
${upcomingLines.length > 0 ? upcomingLines.join('\n') : 'Nėra artimų užsakymų'}
${weatherSection}

MĖNESIO EIGA:
- Iš viso užsakymų: ${stats.month_count || 0}
- Pajamos: ${stats.month_revenue || 0}€

TAISYKLĖS:
- Rašyk TIKTAI lietuviškai
- Naudok Telegram HTML: <b>bold</b>, <i>italic</i>
- Pradėk nuo vakaro emoji ir šiandienos santraukos
- Jei orai blogi rytoj (lietus >50% arba vėjas >40 km/h) — perspėk
- Jei vėjas >40 km/h — tai PAVOJINGA pripučiamiems batutams, būtinai perspėk!
- Jei orai geri arba nėra duomenų — NEMINĖK orų
- Jei nėra artimų užsakymų — pasiūlyk veiksmą rytojui
- Pabaigoje — trumpa mėnesio statistika ir palinkėjimas geros nakties
- Maksimum 300 žodžių
- NENAUDOK markdown — TIK HTML
- Nerašyk "Gemini" ar "AI"`;

return [{ json: { prompt } }];
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
        "parameters": {"method": "GET", "url": "=" + API_DASHBOARD + "?month={{ new Date().getFullYear() }}-{{ String(new Date().getMonth()+1).padStart(2,'0') }}",
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
        "parameters": {"jsCode": BUILD_EVENING_PROMPT_CODE},
        "id": uid(), "name": "Build Evening Prompt",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, 400]
    },
    {
        "parameters": {
            "method": "POST",
            "url": GEMINI_URL,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.3 } }) }}',
            "options": {"timeout": 30000}
        },
        "id": uid(), "name": "Call Gemini",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1340, 400],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": FORMAT_GEMINI_REPLY_CODE},
        "id": uid(), "name": "Format Reply",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1560, 400]
    },
    {
        "parameters": {
            "resource": "message", "operation": "sendMessage",
            "chatId": f"={OWNER_CHAT_ID}" if OWNER_CHAT_ID else "={{ $vars.OWNER_CHAT_ID }}",
            "text": "={{ $json.message }}",
            "additionalFields": {"parse_mode": "HTML"}
        },
        "id": uid(), "name": "Send Evening Check",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [1780, 400],
        "credentials": {"telegramApi": TELEGRAM_CRED}
    }
]

evening_connections = {
    "Cron 21:00": {"main": [[{"node": "Fetch Data", "type": "main", "index": 0}]]},
    "Fetch Data": {"main": [[{"node": "Prepare Weather", "type": "main", "index": 0}]]},
    "Prepare Weather": {"main": [[{"node": "Fetch Weather", "type": "main", "index": 0}]]},
    "Fetch Weather": {"main": [[{"node": "Build Evening Prompt", "type": "main", "index": 0}]]},
    "Build Evening Prompt": {"main": [[{"node": "Call Gemini", "type": "main", "index": 0}]]},
    "Call Gemini": {"main": [[{"node": "Format Reply", "type": "main", "index": 0}]]},
    "Format Reply": {"main": [[{"node": "Send Evening Check", "type": "main", "index": 0}]]}
}

evening_workflow = {
    "name": "Batutynas: Evening Check V2 (Calendar)",
    "nodes": evening_nodes,
    "connections": evening_connections,
    "active": False,
    "settings": {"executionOrder": "v1", "timezone": "Europe/Vilnius"},
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
