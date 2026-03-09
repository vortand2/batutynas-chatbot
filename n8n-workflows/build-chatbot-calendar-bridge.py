#!/usr/bin/env python3
"""
Build Chatbot → Calendar Bridge adapter.
Generates: chatbot-calendar-bridge-workflow.json

This workflow is called as a sub-workflow from the Booking Notification Tool.
It takes parsed booking data and creates a Google Calendar event via Calendar Bridge API.
"""

import json, uuid, os

API_CREATE = "https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-calendar-create"

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

return [{ json: { skip: false, calendarBody: body } }];
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
    {
        "parameters": {
            "method": "POST",
            "url": API_CREATE,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.calendarBody) }}",
            "options": {"timeout": 15000}
        },
        "id": uid(),
        "name": "Create Calendar Event",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [920, 240],
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
        "name": "Return Result",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1140, 240]
    }
]

connections = {
    "Sub-Workflow Trigger": {"main": [[{"node": "Format for Calendar", "type": "main", "index": 0}]]},
    "Format for Calendar": {"main": [[{"node": "IF Is Booking", "type": "main", "index": 0}]]},
    "IF Is Booking": {"main": [
        [{"node": "Create Calendar Event", "type": "main", "index": 0}],
        []  # false path — skip
    ]},
    "Create Calendar Event": {"main": [[{"node": "Return Result", "type": "main", "index": 0}]]}
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
print(f"\n📌 Wire this into Booking Notification Tool:")
print(f"   Add 'Execute Sub-Workflow' node after Parse Booking Data")
print(f"   pointing to this workflow's ID")
