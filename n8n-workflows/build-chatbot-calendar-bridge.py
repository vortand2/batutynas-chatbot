#!/usr/bin/env python3
"""
Build Chatbot → Calendar Bridge adapter.
Generates: chatbot-calendar-bridge-workflow.json

This workflow is called as a sub-workflow from the Booking Notification Tool.
It takes parsed booking data, checks availability, and creates a Google Calendar
event via Calendar Bridge API. If equipment is taken, returns conflict info
with alternative free dates.
"""

import json, uuid, os

API_BASE = "https://n8n-n8n.0uvai5.easypanel.host/webhook"
API_CREATE = f"{API_BASE}/batutynas-calendar-create"
API_AVAILABILITY = f"{API_BASE}/batutynas-availability"
API_NEXT_FREE = f"{API_BASE}/batutynas-next-free"

def uid():
    return str(uuid.uuid4()).replace('-', '')[:20]

# Format chatbot booking data → Calendar Bridge create body
FORMAT_CODE = r"""
const data = $input.first().json;

// Only process actual bookings, not catalog/custom requests
if (data.requestType && data.requestType !== 'booking') {
  return [{ json: { skip: true, reason: 'Not a booking request' } }];
}

// Build Calendar Bridge create body
const body = {
  equipment: data.trampolinePreference || '',
  customer_name: data.contactName || '',
  customer_phone: data.contactPhone || '',
  date: data.date || '',
  location: data.address || data.location || '',
  price: 0,  // Chatbot doesn't collect price
  addons: [],
  notes: [
    data.eventType && data.eventType !== 'Nenurodyta' ? `Renginys: ${data.eventType}` : '',
    data.guestCount && data.guestCount !== 'Nenurodyta' ? `Svečiai: ${data.guestCount}` : '',
    data.groupType && data.groupType !== 'Nenurodyta' ? `Grupė: ${data.groupType}` : '',
    data.notes || ''
  ].filter(Boolean).join('; ')
};

// Parse addons from comma-separated string
if (data.addons && data.addons !== 'Nenurodyta') {
  body.addons = data.addons.split(',').map(a => a.trim()).filter(Boolean);
}

// Build availability check URL
const availUrl = '__API_AVAILABILITY__' + '?date=' + encodeURIComponent(body.date);
// Build next-free URL for alternative dates if conflict found
const nextFreeUrl = '__API_NEXT_FREE__' + '?equipment=' + encodeURIComponent(body.equipment) + '&days=14';

return [{ json: { skip: false, calendarBody: body, availUrl, nextFreeUrl } }];
""".strip().replace('__API_AVAILABILITY__', API_AVAILABILITY).replace('__API_NEXT_FREE__', API_NEXT_FREE)

# Check if the requested equipment is available on the requested date
CHECK_CONFLICT_CODE = r"""
const formatted = $('Format for Calendar').first().json;
const availData = $input.first().json;
const equipment = formatted.calendarBody.equipment || '';

// Check if the equipment is in the "booked" list
const booked = availData.booked || [];
const isConflict = booked.some(b => {
  const bName = (b.name || '').toLowerCase();
  const eqName = equipment.toLowerCase();
  // Full-word match to prevent substring false positives
  return bName === eqName || bName.includes(eqName) || eqName.includes(bName);
});

return [{ json: { isConflict, calendarBody: formatted.calendarBody, nextFreeUrl: formatted.nextFreeUrl } }];
""".strip()

# Format conflict response with alternative dates
FORMAT_CONFLICT_CODE = r"""
const prev = $('Check Conflict').first().json;
const nextFreeData = $input.first().json;
const equipment = prev.calendarBody.equipment || 'Įranga';
const date = prev.calendarBody.date || '';

const freeDates = nextFreeData.freeDates || [];
let altDates = '';
if (freeDates.length > 0) {
  altDates = freeDates.slice(0, 5).map(d => d.date + ' (' + d.weekday + ')').join(', ');
}

return [{ json: {
  success: false,
  conflict: true,
  conflict_equipment: equipment,
  conflict_date: date,
  alternative_dates: altDates,
  message: `Deja, ${equipment} ${date} jau užimtas.` +
    (altDates ? ` Laisvos datos: ${altDates}` : ' Artimiausiomis dienomis laisvų datų nėra.')
}}];
""".strip()

nodes = [
    {
        "parameters": {},
        "id": uid(),
        "name": "Sub-Workflow Trigger",
        "type": "n8n-nodes-base.executeWorkflowTrigger",
        "typeVersion": 1,
        "position": [240, 300]
    },
    {
        "parameters": {"jsCode": FORMAT_CODE},
        "id": uid(),
        "name": "Format for Calendar",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [460, 300]
    },
    {
        "parameters": {
            "conditions": {
                "options": {
                    "caseSensitive": True,
                    "leftValue": ""
                },
                "conditions": [
                    {
                        "id": "cond-skip",
                        "leftValue": "={{ $json.skip }}",
                        "rightValue": False,
                        "operator": {"type": "boolean", "operation": "equals"}
                    }
                ],
                "combinator": "and"
            }
        },
        "id": uid(),
        "name": "IF Is Booking",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [680, 300]
    },
    # ── Check Availability before creating ──
    {
        "parameters": {
            "method": "GET",
            "url": "={{ $json.availUrl }}",
            "options": {"timeout": 10000}
        },
        "id": uid(),
        "name": "Check Availability",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [920, 240],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": CHECK_CONFLICT_CODE},
        "id": uid(),
        "name": "Check Conflict",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1140, 240]
    },
    # ── IF No Conflict → Create, IF Conflict → Get alternatives ──
    {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": ""},
                "conditions": [
                    {
                        "id": "cond-conflict",
                        "leftValue": "={{ $json.isConflict }}",
                        "rightValue": False,
                        "operator": {"type": "boolean", "operation": "equals"}
                    }
                ],
                "combinator": "and"
            }
        },
        "id": uid(),
        "name": "IF No Conflict",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [1360, 240]
    },
    # ── TRUE: Create Calendar Event (no conflict) ──
    {
        "parameters": {
            "method": "POST",
            "url": API_CREATE,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($('Check Conflict').first().json.calendarBody) }}",
            "options": {"timeout": 15000}
        },
        "id": uid(),
        "name": "Create Calendar Event",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1600, 180],
        "continueOnFail": True
    },
    {
        "parameters": {
            "jsCode": "const resp = $input.first().json;\n"
                      "if (resp.error) {\n"
                      "  return [{ json: { success: false, error: resp.error } }];\n"
                      "}\n"
                      "return [{ json: { success: true, eventId: resp.id || resp.eventId || 'created' } }];"
        },
        "id": uid(),
        "name": "Return Success",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1840, 180]
    },
    # ── FALSE: Conflict detected → fetch alternative dates ──
    {
        "parameters": {
            "method": "GET",
            "url": "={{ $('Check Conflict').first().json.nextFreeUrl }}",
            "options": {"timeout": 10000}
        },
        "id": uid(),
        "name": "Fetch Next Free",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1600, 360],
        "continueOnFail": True
    },
    {
        "parameters": {"jsCode": FORMAT_CONFLICT_CODE},
        "id": uid(),
        "name": "Return Conflict",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1840, 360]
    }
]

connections = {
    "Sub-Workflow Trigger": {"main": [[{"node": "Format for Calendar", "type": "main", "index": 0}]]},
    "Format for Calendar": {"main": [[{"node": "IF Is Booking", "type": "main", "index": 0}]]},
    "IF Is Booking": {"main": [
        [{"node": "Check Availability", "type": "main", "index": 0}],
        []  # false path — skip
    ]},
    "Check Availability": {"main": [[{"node": "Check Conflict", "type": "main", "index": 0}]]},
    "Check Conflict": {"main": [[{"node": "IF No Conflict", "type": "main", "index": 0}]]},
    "IF No Conflict": {"main": [
        [{"node": "Create Calendar Event", "type": "main", "index": 0}],   # true = no conflict
        [{"node": "Fetch Next Free", "type": "main", "index": 0}]          # false = conflict
    ]},
    "Create Calendar Event": {"main": [[{"node": "Return Success", "type": "main", "index": 0}]]},
    "Fetch Next Free": {"main": [[{"node": "Return Conflict", "type": "main", "index": 0}]]}
}

workflow = {
    "name": "Batutynas: Chatbot → Calendar Bridge",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
    "tags": [{"name": "batutynas"}, {"name": "chatbot"}, {"name": "calendar"}]
}

out_path = os.path.join(os.path.dirname(__file__), "chatbot-calendar-bridge-workflow.json")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print(f"✅ chatbot-calendar-bridge-workflow.json ({len(nodes)} nodes)")
print(f"\n📌 Flow: Trigger → Format → IF Booking → Check Availability → Check Conflict")
print(f"   → IF No Conflict: Create Calendar Event → Return Success")
print(f"   → IF Conflict: Fetch Next Free → Return Conflict (with alternative dates)")
