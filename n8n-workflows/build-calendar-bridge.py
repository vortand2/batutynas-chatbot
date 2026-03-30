#!/usr/bin/env python3
"""
Build the Batutynas Calendar Bridge n8n workflow.
Generates calendar-bridge-workflow.json for deployment.

This workflow bridges Google Calendar ↔ Dashboard/Telegram Bot:
- GET  /batutynas-dashboard-v2    → fetch + parse events for month
- GET  /batutynas-availability    → check equipment availability for date
- POST /batutynas-calendar-create → create booking event
- POST /batutynas-calendar-update → update/move/extend booking
- POST /batutynas-calendar-delete → delete/cancel booking
"""

import json, os

# ── Configuration ────────────────────────────────────────────────────────────

CREDENTIAL_ID = "SaHw7JsRiy6wdVUp"
CREDENTIAL_NAME = "Batutynas Google Calendar"
CALENDAR_ID = "primary"  # Or client's specific calendar ID

# ── Shared JS function: detect system-created events ────────────────────────
# Extracted to Python constant so it can be embedded in multiple n8n code nodes
IS_SYSTEM_EVENT_FN = r"""
function isSystemEvent(summary) {
  // System events always follow: "Equipment [+ addons] | price€"
  return /\|\s*\d+\s*€\s*$/.test((summary || '').trim());
}
"""

# ── Equipment Master List ────────────────────────────────────────────────────

EQUIPMENT_JS = """
const EQUIPMENT = [
  { name: 'Fantazijų parkas', aliases: ['fantaziju', 'fantazijos', 'fantazij', 'fantaziju parkas'], icon: '🏰', category: 'park' },
  { name: 'Džiumandži parkas', aliases: ['dziumandzi', 'dziumandziu', 'jumanji', 'dziumand', 'džiumandži'], icon: '🌴', category: 'park' },
  { name: 'Giga ruožas', aliases: ['giga', 'giga ruozas', 'giga ruožas'], icon: '🏃', category: 'obstacle' },
  { name: 'Mega ruožas', aliases: ['mega ruozas', 'mega ruož', 'mega ruožas'], icon: '🏃‍♂️', category: 'obstacle' },
  { name: 'Mega Rocket', aliases: ['mega rocket', 'rocket', 'raketa'], icon: '🚀', category: 'mega' },
  { name: 'Mega Ufonautai', aliases: ['mega ufonautai', 'ufonautai', 'ufo'], icon: '🛸', category: 'mega' },
  { name: 'Mega Waikiki', aliases: ['mega waikiki', 'waikiki'], icon: '🏄', category: 'mega' },
  { name: 'Monstrai', aliases: ['monstrai', 'monstr', 'monster', 'monstru'], icon: '👾', category: 'compact' },
  { name: 'Chameleonas', aliases: ['chameleonas', 'chameleon', 'chameleono'], icon: '🦎', category: 'compact' },
  { name: 'Candy Pop', aliases: ['candy', 'candy pop', 'candypop'], icon: '🍬', category: 'compact' },
  { name: 'Aštuonkojis', aliases: ['astuonkojis', 'astuonkoj', 'octopus', 'aštuonkojis'], icon: '🐙', category: 'compact' },
  { name: 'Vienaragiai', aliases: ['vienaragiai', 'vienaragi', 'unicorn', 'vienaragis', 'vienaragių'], icon: '🦄', category: 'compact' },
  { name: 'Pilis mažiesiems', aliases: ['pilis', 'pilis maziesiems', 'castle', 'pilis mažiesiems'], icon: '🏯', category: 'toddler' },
  { name: 'Milžiniškas Dart', aliases: ['dart', 'milziniskas dart', 'giant dart', 'milžiniškas'], icon: '🎯', category: 'interactive' },
  { name: 'Kamuolių medžioklė', aliases: ['kamuoliu', 'kamuoliu medziokle', 'ball hunt', 'kamuolių'], icon: '⚽', category: 'interactive' },
  { name: 'Rodeo bulius', aliases: ['rodeo', 'bulius', 'bull', 'rodeo bulius'], icon: '🐂', category: 'interactive' },
  { name: 'Saldėsių aparatai', aliases: ['saldesiu aparatai', 'saldesiai', 'saldainiai', 'vata', 'popcorn'], icon: '🍬', category: 'addon' },
  { name: 'Banketo stalai ir kėdės', aliases: ['banketo stalai', 'stalai ir kedes', 'stalai kedes', 'stalai'], icon: '🪑', category: 'party-equipment' },
];

const ADDONS = [
  { name: 'Cukraus vata', aliases: ['cukraus vata', 'vata', 'cotton candy'] },
  { name: 'Popcorn', aliases: ['popcorn', 'popcornai', 'kukurūzai'] },
  { name: 'Šerbetas', aliases: ['serbetas', 'serbet', 'sherbet', 'šerbetas'] },
  { name: 'Putų šou', aliases: ['putu sou', 'putos', 'foam', 'putų šou', 'putu'] },
  { name: 'Disco paviljonas', aliases: ['disco', 'paviljonas', 'disco paviljonas'] },
  { name: 'JBL kolonėlė', aliases: ['jbl', 'kolonele', 'speaker', 'kolonėlė'] },
  { name: 'VR sistema', aliases: ['vr', 'virtual reality', 'vr sistema'] },
  { name: 'Burbulų mašina', aliases: ['burbulai', 'burbulu masina', 'bubbles', 'burbulų'] },
  { name: 'Instax fotoaparatas', aliases: ['instax', 'fotoaparatas', 'fotikas', 'foto'] },
  { name: 'Sumo kostiumai', aliases: ['sumo', 'kostiumai', 'sumo kostiumai'] },
];
"""

# ── Parsing Logic (shared across nodes) ──────────────────────────────────────

PARSE_EVENT_FN = EQUIPMENT_JS + """
function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}

function matchEquipment(text) {
  const lower = removeDiacritics(text.toLowerCase());
  let bestMatch = null;
  let bestLen = 0;
  for (const eq of EQUIPMENT) {
    for (const alias of eq.aliases) {
      const a = removeDiacritics(alias.toLowerCase());
      if (lower.includes(a) && a.length > bestLen) {
        bestMatch = eq;
        bestLen = a.length;
      }
    }
    // Also try the name itself
    const n = removeDiacritics(eq.name.toLowerCase());
    if (lower.includes(n) && n.length > bestLen) {
      bestMatch = eq;
      bestLen = n.length;
    }
  }
  return bestMatch;
}

function matchAddons(text) {
  const lower = removeDiacritics(text.toLowerCase());
  const found = [];
  for (const addon of ADDONS) {
    for (const alias of addon.aliases) {
      if (lower.includes(removeDiacritics(alias.toLowerCase()))) {
        found.push(addon.name);
        break;
      }
    }
  }
  return found;
}

function extractPrice(text) {
  // Match patterns: "185€", "185 eur", "uz 185", "185 €", "€185"
  const patterns = [
    /(\\d+)\\s*€/,
    /€\\s*(\\d+)/,
    /(\\d+)\\s*eur/i,
    /uz\\s*(\\d+)/i,
    /už\\s*(\\d+)/i,
    /(\\d{2,4})\\s*$/  // trailing number as fallback
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function extractPhone(text) {
  const m = text.match(/\\+?\\d[\\d\\s-]{7,}/);
  return m ? m[0].replace(/[\\s-]/g, '') : null;
}

""" + IS_SYSTEM_EVENT_FN + r"""

function parseManualTitle(summary) {
  // For freeform titles: extract customer name and location from remaining text
  // after stripping equipment, price, and phone
  let text = summary || '';

  // Strip equipment name (try all aliases)
  const eq = matchEquipment(text);
  if (eq) {
    const names = [eq.name, ...eq.aliases];
    for (const alias of names) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      text = text.replace(re, ' ');
    }
  }

  // Strip price patterns
  text = text.replace(/\d+\s*€/g, ' ').replace(/€\s*\d+/g, ' ');
  text = text.replace(/\d+\s*eur/gi, ' ');
  text = text.replace(/uz\s*\d+/gi, ' ').replace(/už\s*\d+/gi, ' ');

  // Strip phone numbers
  text = text.replace(/\+?\d[\d\s-]{7,}/g, ' ');

  // Strip pipe and surrounding whitespace
  text = text.replace(/\|/g, ' ');

  // Collapse spaces
  text = text.replace(/\s+/g, ' ').trim();

  // Extract capitalized word groups (proper nouns = names/locations)
  const tokens = text.split(/\s+/).filter(Boolean);
  const groups = [];
  let current = [];
  for (const t of tokens) {
    if (/^[A-ZĄČĘĖĮŠŲŪŽ]/.test(t)) {
      current.push(t);
    } else {
      if (current.length) { groups.push([...current]); current = []; }
    }
  }
  if (current.length) groups.push(current);

  let customerName = null;
  let location = null;

  for (const group of groups) {
    if (group.length >= 2 && !customerName) {
      // Multi-word capitalized = likely customer name (First Last)
      customerName = group.join(' ');
    } else if (group.length === 1 && !location) {
      // Single capitalized word = likely location (city name)
      location = group[0];
    } else if (group.length === 1 && location && !customerName) {
      customerName = group[0];
    } else if (group.length >= 2 && customerName && !location) {
      location = group.join(' ');
    }
  }

  return { customerName, location };
}

function parseCalendarEvent(event) {
  const summary = event.summary || '';
  const description = event.description || '';
  const allText = summary + ' ' + description;

  // Determine event source: system-created vs manually-created
  const isSystem = isSystemEvent(summary);
  const entry_source = isSystem ? 'system' : 'manual';

  // Equipment match from title primarily
  const equipment = matchEquipment(summary);
  const addons = matchAddons(allText);
  const price = extractPrice(allText);
  // Try phone from description first, then title (manual events may have phone in title)
  const phone = extractPhone(description) || extractPhone(summary);

  // Parse description lines for customer info
  const lines = description.split(/\n/).map(l => l.trim()).filter(Boolean);
  let customerName = null;
  let location = null;

  for (const line of lines) {
    // Skip lines that are phone numbers
    if (/^\\+?\\d[\\d\\s-]{7,}$/.test(line)) continue;
    // Skip lines that look like prices
    if (/^\\d+\\s*€/.test(line) || /^€/.test(line)) continue;
    // First non-phone, non-price line could be location or name
    // Heuristic: if it contains city-like words, it's location
    if (!location && /[A-ZĄČĘĖĮŠŲŪŽ]/.test(line[0]) && line.length < 40) {
      // Check if next unassigned slot is location or name
      if (!customerName && lines.indexOf(line) > 0) {
        // Lines after first are more likely to be names
        customerName = line;
      } else if (!location) {
        location = line;
      }
    }
  }

  // If we found things in wrong order, try to fix:
  // Location often comes first in client's format (from screenshots)
  // "Pagramantis\\n+37060250071\\nRita Juskaite"
  if (lines.length >= 1) {
    const firstNonPhone = lines.find(l => !/^\\+?\\d/.test(l));
    const lastNonPhone = [...lines].reverse().find(l => !/^\\+?\\d/.test(l));
    if (firstNonPhone && lastNonPhone && firstNonPhone !== lastNonPhone) {
      location = firstNonPhone;
      customerName = lastNonPhone;
    } else if (firstNonPhone) {
      // Only one non-phone line — could be either
      // If it looks like a place (short, one word), treat as location
      if (firstNonPhone.split(/\\s+/).length <= 2) {
        location = firstNonPhone;
      } else {
        customerName = firstNonPhone;
      }
    }
  }

  // For manual events: if description parsing didn't yield results,
  // try extracting customer name and location from the freeform title
  if (entry_source === 'manual' && (!customerName || !location)) {
    const fromTitle = parseManualTitle(summary);
    if (!customerName && fromTitle.customerName) customerName = fromTitle.customerName;
    if (!location && fromTitle.location) location = fromTitle.location;
  }

  // Event dates
  const startDate = event.start?.date || event.start?.dateTime?.substring(0, 10) || '';
  const endDate = event.end?.date || event.end?.dateTime?.substring(0, 10) || '';

  // Calculate duration in days
  let durationDays = 1;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    durationDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
    // Google Calendar all-day events: end date is exclusive (June 6 all-day → end = June 7)
    // So a 1-day event has end = start + 1 day, meaning durationDays = 1 is correct
  }

  // Extract delivery time from description (e.g., "Pristatymas: 8:00")
  const deliveryTimeMatch = description.match(/Pristatymas:\\s*(\\d{1,2}:\\d{2})/i);
  const delivery_time = deliveryTimeMatch ? deliveryTimeMatch[1] : '8:00';

  // Extract pickup time (e.g., "Paėmimas: 20:00" or "Pickup: 20:00")
  const pickupMatch = description.match(/Pa[eė]mimas:\\s*(\\d{1,2}:\\d{2})/i) || description.match(/Pickup:\\s*(\\d{1,2}:\\d{2})/i);
  const pickup_time = pickupMatch ? pickupMatch[1] : '';

  // Extract notes
  const notesMatch = lines.find(l => l.startsWith('Notes:') || l.startsWith('Pastabos:'));
  const notes = notesMatch ? notesMatch.replace(/^(Notes|Pastabos):\\s*/i, '').trim() : '';

  // Deposit paid status
  const depositPaidLine = lines.find(l => /deposit.*paid|užstatas.*sumok/i.test(l));
  const deposit_paid = !!depositPaidLine;

  return {
    id: event.id,
    calendarEventId: event.id,
    event_date: startDate,
    end_date: endDate,
    duration_days: durationDays,
    raw_summary: summary,
    raw_description: description,
    customer_name: customerName,
    customer_phone: phone,
    delivery_address: location,
    city: location,
    delivery_time: delivery_time,
    event_time: delivery_time,
    pickup_time: pickup_time,
    notes: notes,
    deposit_paid: deposit_paid,
    price: price,
    status: (lines.find(l => l.startsWith('Status: ')) || '').replace('Status: ', '') || 'Confirmed',
    payment_status: (lines.find(l => l.startsWith('Payment: ')) || '').replace('Payment: ', '') || 'Unpaid',
    deposit_amount: (lines.find(l => l.startsWith('Deposit: ')) || '').replace('Deposit: ', '') || '',
    entry_source: entry_source,
    equipment: equipment ? [{
      name: equipment.name,
      icon: equipment.icon,
      category: equipment.category
    }] : [],
    addons: addons,
    htmlLink: event.htmlLink || '',
    created_at: event.created || '',
  };
}
"""

# ── Node Builders ────────────────────────────────────────────────────────────

def pos(x, y):
    return [x, y]

def google_cal_credential():
    return {
        "googleCalendarOAuth2Api": {
            "id": CREDENTIAL_ID,
            "name": CREDENTIAL_NAME
        }
    }

def webhook_node(node_id, name, method, path, y_pos):
    return {
        "parameters": {
            "httpMethod": method,
            "path": path,
            "responseMode": "responseNode",
            "options": {}
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 1,
        "position": pos(240, y_pos),
        "webhookId": path
    }

def code_node(node_id, name, js_code, x_pos, y_pos):
    return {
        "parameters": {"jsCode": js_code},
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos(x_pos, y_pos)
    }

def respond_node(node_id, name, x_pos, y_pos):
    return {
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ JSON.stringify($json) }}",
            "options": {
                "responseHeaders": {
                    "entries": [
                        {"name": "Content-Type", "value": "application/json"},
                        {"name": "Access-Control-Allow-Origin", "value": "*"},
                        {"name": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS"},
                        {"name": "Access-Control-Allow-Headers", "value": "Content-Type"}
                    ]
                }
            }
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1,
        "position": pos(x_pos, y_pos)
    }

def google_cal_list_node(node_id, name, time_min_expr, time_max_expr, x_pos, y_pos, always_output=False):
    """Google Calendar getAll (list events) node."""
    node = {
        "parameters": {
            "operation": "getAll",
            "calendar": CALENDAR_ID,
            "returnAll": True,
            "options": {
                "timeMin": time_min_expr,
                "timeMax": time_max_expr
            }
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(x_pos, y_pos),
        "credentials": google_cal_credential()
    }
    if always_output:
        node["alwaysOutputData"] = True
    return node

def google_cal_create_node(node_id, name, x_pos, y_pos):
    """Google Calendar create event node — uses expressions from previous node.
    Note: n8n Google Calendar v1 create requires allday at top level,
    and summary + description inside additionalFields."""
    return {
        "parameters": {
            "calendar": CALENDAR_ID,
            "allday": True,
            "start": "={{ $json.startDate }}",
            "end": "={{ $json.endDate }}",
            "additionalFields": {
                "summary": "={{ $json.eventTitle }}",
                "description": "={{ $json.eventDescription }}"
            }
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(x_pos, y_pos),
        "credentials": google_cal_credential()
    }

def google_cal_update_node(node_id, name, x_pos, y_pos):
    """Google Calendar update event node."""
    return {
        "parameters": {
            "operation": "update",
            "calendar": CALENDAR_ID,
            "eventId": "={{ $json.eventId }}",
            "updateFields": {
                "allday": True,
                "start": "={{ $json.newStart }}",
                "end": "={{ $json.newEnd }}",
                "summary": "={{ $json.newSummary || '' }}",
                "description": "={{ $json.newDescription || '' }}"
            }
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(x_pos, y_pos),
        "credentials": google_cal_credential()
    }

def google_cal_delete_node(node_id, name, x_pos, y_pos):
    """Google Calendar delete event node."""
    return {
        "parameters": {
            "operation": "delete",
            "calendar": CALENDAR_ID,
            "eventId": "={{ $json.eventId }}"
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(x_pos, y_pos),
        "credentials": google_cal_credential()
    }

def connection(from_node, to_node):
    return {"node": to_node, "type": "main", "index": 0}

# ── Endpoint 1: GET Dashboard Data ──────────────────────────────────────────

def build_dashboard_endpoint():
    Y = 300
    nodes = []
    conns = {}

    # 1. Webhook
    nodes.append(webhook_node("dash-webhook", "Dashboard Webhook", "GET", "batutynas-dashboard-v2", Y))

    # 2. Parse request → extract month
    nodes.append(code_node("dash-parse", "Parse Month", """
const query = $input.first().json.query || {};
const now = new Date();
// Support both ?month=YYYY-MM and ?year=2026&month=3 formats
let month;
if (query.year && query.month) {
  month = `${query.year}-${String(query.month).padStart(2, '0')}`;
} else if (query.month && /^\\d{4}-\\d{2}$/.test(query.month)) {
  month = query.month;
} else {
  month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
const monthRegex = /^\\d{4}-\\d{2}$/;
if (!monthRegex.test(month)) {
  throw new Error('Invalid month format. Expected YYYY-MM or year+month params.');
}
const [year, mon] = month.split('-').map(Number);
const timeMin = `${month}-01T00:00:00Z`;
// Last day of month
const lastDay = new Date(year, mon, 0).getDate();
const timeMax = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;
return [{ json: { month, timeMin, timeMax } }];
""", 460, Y))

    # 3. Fetch events from Google Calendar
    nodes.append(google_cal_list_node(
        "dash-fetch", "Fetch Calendar Events",
        "={{ $json.timeMin }}",
        "={{ $json.timeMax }}",
        700, Y,
        always_output=True
    ))

    # 4. Parse & transform all events
    parse_code = PARSE_EVENT_FN + """
const events = $input.all().map(item => item.json);
const month = $('Parse Month').first().json.month;

// Parse each event
const bookings = events
  .filter(e => e.summary) // skip empty events
  .map(parseCalendarEvent)
  .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));

// Compute stats
const today = new Date().toISOString().substring(0, 10);
const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().substring(0, 10);
const twoWeeksAgo = new Date(Date.now() - 13 * 86400000).toISOString().substring(0, 10);

const todayBookings = bookings.filter(b => b.event_date === today);
const weekBookings = bookings.filter(b => b.event_date >= weekAgo && b.event_date <= today);
const lastWeekBookings = bookings.filter(b => b.event_date >= twoWeeksAgo && b.event_date < weekAgo);

const weekRevenue = weekBookings.reduce((sum, b) => sum + (b.price || 0), 0);
const lastWeekRevenue = lastWeekBookings.reduce((sum, b) => sum + (b.price || 0), 0);

// Equipment availability for today
const todayEquipmentNames = todayBookings
  .flatMap(b => b.equipment.map(e => e.name));
const availableCount = EQUIPMENT.filter(e => !todayEquipmentNames.includes(e.name)).length;

// Equipment list with status
const equipmentList = EQUIPMENT.map(eq => ({
  id: eq.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
  name: eq.name,
  icon: eq.icon,
  category: eq.category,
  status: todayEquipmentNames.includes(eq.name) ? 'Rented' : 'Available'
}));

// Additional stats
const monthRevenue = bookings.reduce((s, b) => s + (b.price || 0), 0);

const prices = bookings.filter(b => b.price > 0).map(b => b.price);
const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

const eqCount = {};
bookings.forEach(b => {
  (b.equipment || []).forEach(e => { eqCount[e.name] = (eqCount[e.name] || 0) + 1; });
});
const topEq = Object.entries(eqCount).sort((a, b) => b[1] - a[1]);
const topEquipment = topEq.length ? topEq[0][0] : null;

const dateCount = {};
bookings.forEach(b => { if (b.event_date) { dateCount[b.event_date] = (dateCount[b.event_date] || 0) + 1; } });
const topDate = Object.entries(dateCount).sort((a, b) => b[1] - a[1]);
const busiestDate = topDate.length ? topDate[0][0] : null;

return [{ json: {
  bookings,
  stats: {
    today_count: todayBookings.length,
    month_count: bookings.length,
    week_revenue: weekRevenue,
    last_week_revenue: lastWeekRevenue,
    month_revenue: monthRevenue,
    available_equipment: availableCount,
    total_equipment: EQUIPMENT.length,
    avg_price: avgPrice,
    top_equipment: topEquipment,
    busiest_date: busiestDate
  },
  equipment: equipmentList
}}];
"""
    nodes.append(code_node("dash-transform", "Parse & Transform", parse_code, 940, Y))

    # 5. Respond
    nodes.append(respond_node("dash-respond", "Respond Dashboard", 1180, Y))

    conns["Dashboard Webhook"] = {"main": [[connection("dash-webhook", "Parse Month")]]}
    conns["Parse Month"] = {"main": [[connection("dash-parse", "Fetch Calendar Events")]]}
    conns["Fetch Calendar Events"] = {"main": [[connection("dash-fetch", "Parse & Transform")]]}
    conns["Parse & Transform"] = {"main": [[connection("dash-transform", "Respond Dashboard")]]}

    return nodes, conns

# ── Endpoint 2: GET Availability ─────────────────────────────────────────────

def build_availability_endpoint():
    Y = 620
    nodes = []
    conns = {}

    nodes.append(webhook_node("avail-webhook", "Availability Webhook", "GET", "batutynas-availability", Y))

    nodes.append(code_node("avail-parse", "Parse Date", """
const query = $input.first().json.query || {};
const date = query.date;
if (!date || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
  throw new Error('Missing or invalid date parameter. Expected YYYY-MM-DD.');
}
// For all-day events, timeMin = start of day, timeMax = end of day
const timeMin = `${date}T00:00:00Z`;
const timeMax = `${date}T23:59:59Z`;
return [{ json: { date, timeMin, timeMax } }];
""", 460, Y))

    nodes.append(google_cal_list_node(
        "avail-fetch", "Fetch Day Events",
        "={{ $json.timeMin }}",
        "={{ $json.timeMax }}",
        700, Y,
        always_output=True
    ))

    avail_code = PARSE_EVENT_FN + """
const events = $input.all().map(item => item.json);
const date = $('Parse Date').first().json.date;

const parsed = events.filter(e => e.summary).map(parseCalendarEvent);

// Which equipment is booked on this date?
// Need to check if the event spans this date (multi-day support)
const bookedNames = new Set();
for (const b of parsed) {
  for (const eq of b.equipment) {
    bookedNames.add(eq.name);
  }
}

const booked = EQUIPMENT
  .filter(eq => bookedNames.has(eq.name))
  .map(eq => {
    const booking = parsed.find(b => b.equipment.some(e => e.name === eq.name));
    return {
      ...eq,
      booking_summary: booking?.raw_summary || '',
      customer: booking?.customer_name || '',
      end_date: booking?.end_date || '',
    };
  });

const free = EQUIPMENT.filter(eq => !bookedNames.has(eq.name));

return [{ json: {
  date,
  booked: booked,
  free: free,
  summary: `${date}: ${free.length}/${EQUIPMENT.length} laisvi`
}}];
"""
    nodes.append(code_node("avail-transform", "Check Availability", avail_code, 940, Y))
    nodes.append(respond_node("avail-respond", "Respond Availability", 1180, Y))

    conns["Availability Webhook"] = {"main": [[connection("avail-webhook", "Parse Date")]]}
    conns["Parse Date"] = {"main": [[connection("avail-parse", "Fetch Day Events")]]}
    conns["Fetch Day Events"] = {"main": [[connection("avail-fetch", "Check Availability")]]}
    conns["Check Availability"] = {"main": [[connection("avail-transform", "Respond Availability")]]}

    return nodes, conns

# ── Endpoint 3: POST Create Booking ─────────────────────────────────────────

def build_create_endpoint():
    Y = 940
    nodes = []
    conns = {}

    nodes.append(webhook_node("create-webhook", "Create Booking Webhook", "POST", "batutynas-calendar-create", Y))

    # Parse and format the event
    nodes.append(code_node("create-parse", "Format Event", """
const body = $input.first().json.body || $input.first().json;

const equipment = body.equipment || body.trampoline || '';
const price = body.price || '';
const customerName = body.customer_name || body.name || '';
const customerPhone = body.customer_phone || body.phone || '';
const location = body.location || body.city || body.delivery_address || '';
const date = body.date || body.event_date || '';
const durationDays = parseInt(body.duration_days || '1', 10);
const addons = body.addons || '';
const notes = body.notes || '';

if (!equipment || !date) {
  throw new Error('Missing required fields: equipment and date');
}

// Build event title: "Equipment + addons | price"
let title = equipment;
if (addons) title += ' + ' + addons;
if (price) title += ' | ' + price + '€';

// Build description
const deliveryTime = body.delivery_time || '8:00';
const descParts = [];
descParts.push('Pristatymas: ' + deliveryTime);
if (location) descParts.push(location);
if (customerPhone) descParts.push(customerPhone);
if (customerName) descParts.push(customerName);
if (notes) descParts.push(notes);
const description = descParts.join('\\n');

// Dates (all-day event, end date is exclusive in Google Calendar)
const startDate = date;
const endObj = new Date(date);
endObj.setDate(endObj.getDate() + durationDays);
const endDate = endObj.toISOString().substring(0, 10);

return [{ json: {
  eventTitle: title,
  eventDescription: description,
  startDate,
  endDate,
  equipment,
  date,
  durationDays
}}];
""", 460, Y))

    # Conflict check: fetch events for the date range and check equipment
    nodes.append(google_cal_list_node(
        "create-conflict-check", "Check Conflicts",
        "={{ $json.startDate + 'T00:00:00Z' }}",
        "={{ $json.endDate + 'T00:00:00Z' }}",
        700, Y,
        always_output=True
    ))

    conflict_code = PARSE_EVENT_FN + """
const events = $input.all().map(item => item.json);
const prev = $('Format Event').first().json;

// Check if this equipment is already booked in the date range
const parsed = events.filter(e => e.summary).map(parseCalendarEvent);
const equipmentLower = prev.equipment.toLowerCase();

// Match equipment by exact name or full-word match in summary (prevent substring false-positives)
const equipRe = new RegExp('(^|[\\\\s,;|/])' + equipmentLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '($|[\\\\s,;|/])', 'i');
const conflict = parsed.find(b =>
  b.equipment.some(e => e.name.toLowerCase() === equipmentLower) ||
  equipRe.test(b.raw_summary)
);

if (conflict) {
  return [{ json: {
    success: false,
    error: `Konfliktas: ${prev.equipment} jau užsakytas ${conflict.event_date} (${conflict.customer_name || conflict.raw_summary})`,
    conflict: conflict
  }}];
}

// No conflict — pass through event data for creation
return [{ json: {
  ...prev,
  hasConflict: false
}}];
"""
    nodes.append(code_node("create-check-result", "Conflict Result", conflict_code, 940, Y))

    # IF no conflict → create event
    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-no-conflict",
                    "leftValue": "={{ $json.hasConflict }}",
                    "rightValue": False,
                    "operator": {"type": "boolean", "operation": "equals"}
                }],
                "combinator": "and"
            },
            "options": {}
        },
        "id": "create-if-ok",
        "name": "No Conflict?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": pos(1180, Y)
    })

    # Create the event
    nodes.append(google_cal_create_node("create-event", "Create Calendar Event", 1420, Y - 80))

    nodes.append(code_node("create-success", "Success Response", """
const created = $input.first().json;
return [{ json: {
  success: true,
  message: 'Užsakymas sukurtas kalendoriuje',
  eventId: created.id,
  htmlLink: created.htmlLink || ''
}}];
""", 1660, Y - 80))

    nodes.append(respond_node("create-respond-ok", "Respond Created", 1900, Y - 80))

    # Conflict response
    nodes.append(respond_node("create-respond-conflict", "Respond Conflict", 1420, Y + 80))

    conns["Create Booking Webhook"] = {"main": [[connection("create-webhook", "Format Event")]]}
    conns["Format Event"] = {"main": [[connection("create-parse", "Check Conflicts")]]}
    conns["Check Conflicts"] = {"main": [[connection("create-conflict-check", "Conflict Result")]]}
    conns["Conflict Result"] = {"main": [[connection("create-check-result", "No Conflict?")]]}
    conns["No Conflict?"] = {"main": [
        [connection("create-if-ok", "Create Calendar Event")],  # true
        [connection("create-if-ok", "Respond Conflict")]        # false
    ]}
    conns["Create Calendar Event"] = {"main": [[connection("create-event", "Success Response")]]}
    conns["Success Response"] = {"main": [[connection("create-success", "Respond Created")]]}

    return nodes, conns

# ── Endpoint 4: POST Update/Move/Extend Booking ─────────────────────────────

def build_update_endpoint():
    Y = 1340
    nodes = []
    conns = {}

    nodes.append(webhook_node("update-webhook", "Update Booking Webhook", "POST", "batutynas-calendar-update", Y))

    nodes.append(code_node("update-parse", "Parse Update", """
const body = $input.first().json.body || $input.first().json;

const eventId = body.event_id || body.eventId;
if (!eventId) throw new Error('Missing event_id');

const action = body.action || 'move'; // 'move' | 'extend' | 'edit'
const newDate = body.new_date || body.newDate || '';
const extendDays = parseInt(body.extend_days || body.extendDays || '0', 10);
const fields = body.fields || {}; // for 'edit' action: object with booking field updates

// We need to fetch the current event first to know its details
return [{ json: { eventId, action, newDate, extendDays, fields } }];
""", 460, Y))

    # Fetch the specific event
    nodes.append({
        "parameters": {
            "operation": "get",
            "calendar": CALENDAR_ID,
            "eventId": "={{ $json.eventId }}"
        },
        "id": "update-get-event",
        "name": "Get Current Event",
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(700, Y),
        "credentials": google_cal_credential()
    })

    # Calculate new dates and check conflicts
    update_calc = PARSE_EVENT_FN + """
const event = $input.first().json;
const params = $('Parse Update').first().json;
const currentStart = event.start?.date || event.start?.dateTime?.substring(0, 10) || '';
const currentEnd = event.end?.date || event.end?.dateTime?.substring(0, 10) || '';

let newStart, newEnd;

if (params.action === 'move' && params.newDate) {
  // Move to new date, preserve duration
  const origStart = new Date(currentStart);
  const origEnd = new Date(currentEnd);
  const duration = origEnd - origStart;
  newStart = params.newDate;
  const endObj = new Date(params.newDate);
  endObj.setTime(endObj.getTime() + duration);
  newEnd = endObj.toISOString().substring(0, 10);
} else if (params.action === 'extend' && params.extendDays > 0) {
  // Extend: keep start, push end by N days
  newStart = currentStart;
  const endObj = new Date(currentEnd);
  endObj.setDate(endObj.getDate() + params.extendDays);
  newEnd = endObj.toISOString().substring(0, 10);
} else if (params.action === 'edit') {
  // Edit: keep dates, rebuild summary/description from provided fields
  newStart = currentStart;
  newEnd = currentEnd;
} else {
  throw new Error('Invalid action or missing parameters');
}

// Parse equipment from current event for conflict checking
const parsed = parseCalendarEvent(event);
const equipmentName = parsed.equipment.length > 0 ? parsed.equipment[0].name : '';

// For 'edit' action: rebuild summary and description from fields
let newSummary = event.summary || '';
let newDescription = event.description || '';
if (params.action === 'edit' && params.fields && Object.keys(params.fields).length > 0) {
  const f = params.fields;
  // Rebuild title: "Equipment [+ addons] | price"
  const equipment = f.equipment || parsed.equipment.map(e => e.name).join(', ') || '';
  const addons = f.addons || '';
  const price = f.price != null ? f.price : parsed.price;
  let title = equipment;
  if (addons) title += ' + ' + addons;
  if (price) title += ' | ' + price + '\\u20ac';
  newSummary = title || newSummary;
  // Rebuild description
  const location = f.location || f.delivery_address || f.city || parsed.delivery_address || '';
  const phone = f.customer_phone || f.phone || parsed.customer_phone || '';
  const name = f.customer_name || f.name || parsed.customer_name || '';
  const notes = f.notes || parsed.notes || '';
  const deliveryTime = f.event_time || f.delivery_time || parsed.delivery_time || '8:00';
  const status = f.status || parsed.status || '';
  const paymentStatus = f.payment_status || parsed.payment_status || '';
  const depositAmount = f.deposit_amount || parsed.deposit_amount || '';
  const descParts = [];
  descParts.push('Pristatymas: ' + deliveryTime);
  if (location) descParts.push(location);
  if (phone) descParts.push(phone);
  if (name) descParts.push(name);
  if (status) descParts.push('Status: ' + status);
  if (paymentStatus) descParts.push('Payment: ' + paymentStatus);
  if (depositAmount) descParts.push('Deposit: ' + depositAmount);
  if (notes) descParts.push(notes);
  if (descParts.length > 0) newDescription = descParts.join('\\n');
}

return [{ json: {
  eventId: params.eventId,
  newStart,
  newEnd,
  newSummary,
  newDescription,
  equipmentName,
  action: params.action,
  checkConflictMin: newStart + 'T00:00:00Z',
  checkConflictMax: newEnd + 'T00:00:00Z'
}}];
"""
    nodes.append(code_node("update-calc", "Calculate New Dates", update_calc, 940, Y))

    # Conflict check for new date range
    nodes.append(google_cal_list_node(
        "update-conflict", "Check Move Conflicts",
        "={{ $json.checkConflictMin }}",
        "={{ $json.checkConflictMax }}",
        1180, Y,
        always_output=True
    ))

    conflict_code = PARSE_EVENT_FN + """
const events = $input.all().map(item => item.json);
const prev = $('Calculate New Dates').first().json;

// Filter out the event being moved (don't conflict with itself)
const otherEvents = events.filter(e => e.id !== prev.eventId && e.summary);
const parsed = otherEvents.map(parseCalendarEvent);

const equipLower = (prev.equipmentName || '').toLowerCase();
// Full-word match in summary to prevent substring false-positives
const equipRe = equipLower ? new RegExp('(^|[\\\\s,;|/])' + equipLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '($|[\\\\s,;|/])', 'i') : null;
const conflict = parsed.find(b =>
  b.equipment.some(e => e.name.toLowerCase() === equipLower) ||
  (equipRe && equipRe.test(b.raw_summary))
);

if (conflict) {
  return [{ json: {
    success: false,
    error: `Konfliktas: ${prev.equipmentName} jau užsakytas ${conflict.event_date} (${conflict.customer_name || conflict.raw_summary})`
  }}];
}

return [{ json: { ...prev, hasConflict: false } }];
"""
    nodes.append(code_node("update-conflict-check", "Move Conflict Result", conflict_code, 1420, Y))

    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-update-ok",
                    "leftValue": "={{ $json.hasConflict }}",
                    "rightValue": False,
                    "operator": {"type": "boolean", "operation": "equals"}
                }],
                "combinator": "and"
            },
            "options": {}
        },
        "id": "update-if-ok",
        "name": "Move OK?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": pos(1660, Y)
    })

    nodes.append(google_cal_update_node("update-event", "Update Calendar Event", 1900, Y - 80))

    nodes.append(code_node("update-success", "Update Success", """
const updated = $input.first().json;
const params = $('Calculate New Dates').first().json;
let message;
if (params.action === 'extend') {
  message = `Užsakymas pratęstas iki ${params.newEnd}`;
} else if (params.action === 'edit') {
  message = 'Užsakymas atnaujintas';
} else {
  message = `Užsakymas perkeltas į ${params.newStart}`;
}
return [{ json: {
  success: true,
  message,
  eventId: updated.id || params.eventId
}}];
""", 2140, Y - 80))

    nodes.append(respond_node("update-respond-ok", "Respond Updated", 2380, Y - 80))
    nodes.append(respond_node("update-respond-conflict", "Respond Move Conflict", 1900, Y + 80))

    conns["Update Booking Webhook"] = {"main": [[connection("update-webhook", "Parse Update")]]}
    conns["Parse Update"] = {"main": [[connection("update-parse", "Get Current Event")]]}
    conns["Get Current Event"] = {"main": [[connection("update-get-event", "Calculate New Dates")]]}
    conns["Calculate New Dates"] = {"main": [[connection("update-calc", "Check Move Conflicts")]]}
    conns["Check Move Conflicts"] = {"main": [[connection("update-conflict", "Move Conflict Result")]]}
    conns["Move Conflict Result"] = {"main": [[connection("update-conflict-check", "Move OK?")]]}
    conns["Move OK?"] = {"main": [
        [connection("update-if-ok", "Update Calendar Event")],
        [connection("update-if-ok", "Respond Move Conflict")]
    ]}
    conns["Update Calendar Event"] = {"main": [[connection("update-event", "Update Success")]]}
    conns["Update Success"] = {"main": [[connection("update-success", "Respond Updated")]]}

    return nodes, conns

# ── Endpoint 5: POST Delete Booking ──────────────────────────────────────────

def build_delete_endpoint():
    Y = 1740
    nodes = []
    conns = {}

    # 1. Webhook
    nodes.append(webhook_node("delete-webhook", "Delete Booking Webhook", "POST", "batutynas-calendar-delete", Y))

    # 2. Parse Delete — now also extracts force flag
    nodes.append(code_node("delete-parse", "Parse Delete", """
const body = $input.first().json.body || $input.first().json;
const eventId = body.event_id || body.eventId;
if (!eventId) throw new Error('Missing event_id');
const force = body.force === true || body.force === 'true';
return [{ json: { eventId, force } }];
""", 460, Y))

    # 3. Get the event first (to check if it's system or manual)
    nodes.append({
        "parameters": {
            "operation": "get",
            "calendar": CALENDAR_ID,
            "eventId": "={{ $json.eventId }}"
        },
        "id": "delete-get-event",
        "name": "Get Event To Delete",
        "type": "n8n-nodes-base.googleCalendar",
        "typeVersion": 1,
        "position": pos(700, Y),
        "credentials": google_cal_credential()
    })

    # 4. Check authorization — is it a system event OR force flag set?
    check_auth_code = IS_SYSTEM_EVENT_FN + """
const event = $input.first().json;
const params = $('Parse Delete').first().json;

const summary = event.summary || '';
const isSystem = isSystemEvent(summary);
const force = params.force === true;

// Allow deletion if: event was created by system, or force flag is set
const canDelete = isSystem || force;

return [{ json: {
  eventId: params.eventId,
  canDelete,
  isSystem,
  force,
  event_summary: summary,
  event_date: event.start?.date || event.start?.dateTime?.substring(0, 10) || ''
}}];
"""
    nodes.append(code_node("delete-auth", "Check Delete Authorization", check_auth_code, 940, Y))

    # 5. IF Can Delete?
    nodes.append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [{
                    "id": "cond-can-delete",
                    "leftValue": "={{ $json.canDelete }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "equals"}
                }],
                "combinator": "and"
            },
            "options": {}
        },
        "id": "delete-if-ok",
        "name": "Can Delete?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": pos(1180, Y)
    })

    # 6. TRUE branch: Delete Calendar Event → Success → Respond
    nodes.append(google_cal_delete_node("delete-event", "Delete Calendar Event", 1420, Y - 80))

    nodes.append(code_node("delete-success", "Delete Success", """
const eventId = $('Parse Delete').first().json.eventId;
return [{ json: { success: true, message: 'Užsakymas atšauktas', deleted_id: eventId } }];
""", 1660, Y - 80))

    nodes.append(respond_node("delete-respond", "Respond Deleted", 1900, Y - 80))

    # 7. FALSE branch: Block Delete Response → Respond Blocked
    nodes.append(code_node("delete-block-resp", "Block Delete Response", """
const check = $('Check Delete Authorization').first().json;
return [{ json: {
  success: false,
  blocked: true,
  reason: 'manual_event',
  message: 'Šis įvykis sukurtas rankiniu būdu. Naudokite force: true jei tikrai norite ištrinti.',
  event_summary: check.event_summary,
  event_date: check.event_date
}}];
""", 1420, Y + 80))

    nodes.append(respond_node("delete-respond-blocked", "Respond Blocked", 1660, Y + 80))

    # Connections
    conns["Delete Booking Webhook"] = {"main": [[connection("delete-webhook", "Parse Delete")]]}
    conns["Parse Delete"] = {"main": [[connection("delete-parse", "Get Event To Delete")]]}
    conns["Get Event To Delete"] = {"main": [[connection("delete-get-event", "Check Delete Authorization")]]}
    conns["Check Delete Authorization"] = {"main": [[connection("delete-auth", "Can Delete?")]]}
    conns["Can Delete?"] = {"main": [
        [connection("delete-if-ok", "Delete Calendar Event")],   # true
        [connection("delete-if-ok", "Block Delete Response")]    # false
    ]}
    conns["Delete Calendar Event"] = {"main": [[connection("delete-event", "Delete Success")]]}
    conns["Delete Success"] = {"main": [[connection("delete-success", "Respond Deleted")]]}
    conns["Block Delete Response"] = {"main": [[connection("delete-block-resp", "Respond Blocked")]]}

    return nodes, conns

# ── Endpoint 6: GET Next Free Dates ─────────────────────────────────────────

def build_next_free_endpoint():
    Y = 2140
    nodes = []
    conns = {}

    # 1. Webhook
    nodes.append(webhook_node("nextfree-webhook", "Next Free Webhook", "GET", "batutynas-next-free", Y))

    # 2. Parse Params — validate equipment, parse days range
    nodes.append(code_node("nextfree-parse", "Parse Params", """
const query = $input.first().json.query || {};
const equipment = (query.equipment || '').trim();
if (!equipment) {
  return [{ json: { error: true, message: 'Missing equipment parameter' } }];
}
let days = parseInt(query.days || '30', 10);
if (isNaN(days) || days < 1) days = 30;
if (days > 90) days = 90;

const now = new Date();
const tzOffset = 3; // Europe/Vilnius approximate
now.setHours(now.getHours() + tzOffset - now.getTimezoneOffset() / 60);
const timeMin = now.toISOString().substring(0, 10) + 'T00:00:00+03:00';
const endDate = new Date(now);
endDate.setDate(endDate.getDate() + days);
const timeMax = endDate.toISOString().substring(0, 10) + 'T23:59:59+03:00';

return [{ json: { equipment, days, timeMin, timeMax, error: false } }];
""", 460, Y))

    # 3. Fetch Range Events from Google Calendar
    nodes.append(google_cal_list_node(
        "nextfree-cal", "Fetch Range Events",
        "={{ $json.timeMin }}", "={{ $json.timeMax }}",
        700, Y, always_output=True
    ))

    # 4. Find Free Dates — parse events, find dates where requested equipment is free
    nodes.append(code_node("nextfree-find", "Find Free Dates", PARSE_EVENT_FN + r"""
const params = $('Parse Params').first().json;
if (params.error) {
  return [{ json: { error: true, message: params.message } }];
}

const equipmentQuery = params.equipment;
const days = params.days;

// Match the requested equipment
const eqMatch = matchEquipment(equipmentQuery);
if (!eqMatch) {
  return [{ json: {
    error: false,
    equipment: equipmentQuery,
    equipmentIcon: '🎪',
    freeDates: [],
    searchedDays: days,
    message: 'Įranga nerasta: ' + equipmentQuery
  } }];
}

// Parse all events in range
const events = $input.all().map(i => i.json);
const parsedEvents = events.filter(e => e.summary).map(e => parseCalendarEvent(e));

// Build set of booked dates for this equipment
const bookedDates = new Set();
for (const ev of parsedEvents) {
  const evEquipment = ev.equipment && ev.equipment.length > 0 ? ev.equipment[0] : null;
  if (!evEquipment) continue;

  // Check if this event uses the same equipment
  if (removeDiacritics(evEquipment.name.toLowerCase()) === removeDiacritics(eqMatch.name.toLowerCase())) {
    // Handle multi-day events
    const start = new Date(ev.event_date);
    const durationDays = ev.duration_days || 1;
    for (let d = 0; d < durationDays; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      bookedDates.add(dt.toISOString().substring(0, 10));
    }
  }
}

// Walk the date range and collect free dates
const LT_DAYS = ['Sekmadienis','Pirmadienis','Antradienis','Trečiadienis','Ketvirtadienis','Penktadienis','Šeštadienis'];
const freeDates = [];
const now = new Date();
const tzOffset = 3;
now.setHours(now.getHours() + tzOffset - now.getTimezoneOffset() / 60);

for (let d = 0; d < days && freeDates.length < 10; d++) {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  const dateStr = dt.toISOString().substring(0, 10);
  if (!bookedDates.has(dateStr)) {
    freeDates.push({
      date: dateStr,
      weekday: LT_DAYS[dt.getDay()]
    });
  }
}

return [{ json: {
  error: false,
  equipment: eqMatch.name,
  equipmentIcon: eqMatch.icon,
  freeDates,
  searchedDays: days
} }];
""", 940, Y))

    # 5. Respond
    nodes.append(respond_node("nextfree-respond", "Respond Next Free", 1180, Y))

    # Connections
    conns["Next Free Webhook"] = {"main": [[connection("nextfree-webhook", "Parse Params")]]}
    conns["Parse Params"] = {"main": [[connection("nextfree-parse", "Fetch Range Events")]]}
    conns["Fetch Range Events"] = {"main": [[connection("nextfree-cal", "Find Free Dates")]]}
    conns["Find Free Dates"] = {"main": [[connection("nextfree-find", "Respond Next Free")]]}

    return nodes, conns

# ── Assemble Full Workflow ───────────────────────────────────────────────────

def build_workflow():
    all_nodes = []
    all_conns = {}

    for builder in [
        build_dashboard_endpoint,
        build_availability_endpoint,
        build_create_endpoint,
        build_update_endpoint,
        build_delete_endpoint,
        build_next_free_endpoint
    ]:
        nodes, conns = builder()
        all_nodes.extend(nodes)
        all_conns.update(conns)

    workflow = {
        "name": "Batutynas Calendar Bridge",
        "nodes": all_nodes,
        "connections": all_conns,
        "settings": {"executionOrder": "v1"}
    }

    return workflow

# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    workflow = build_workflow()
    out_path = os.path.join(os.path.dirname(__file__), "calendar-bridge-workflow.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)

    print(f"Generated: {out_path}")
    print(f"  Nodes: {len(workflow['nodes'])}")
    print(f"  Endpoints:")
    print(f"    GET  /batutynas-dashboard-v2    — fetch & parse monthly events")
    print(f"    GET  /batutynas-availability    — check equipment for date")
    print(f"    POST /batutynas-calendar-create — create booking (with conflict check)")
    print(f"    POST /batutynas-calendar-update — move/extend (with conflict check)")
    print(f"    POST /batutynas-calendar-delete — cancel booking")
    print(f"    GET  /batutynas-next-free       — find next free dates for equipment")
    print(f"\n  ⚠️  Replace GOOGLE_CALENDAR_CRED with real credential ID after OAuth setup")
