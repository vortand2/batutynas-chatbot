#!/usr/bin/env python3
"""
Build Google Tasks → Calendar Events sync workflow for n8n.
Generates tasks-sync-workflow.json for deployment.

The client creates bookings as Google Tasks in the "Batutynas Tauragė" task list.
This workflow polls every 10 minutes, parses uncompleted tasks, creates matching
Google Calendar events via the Calendar Bridge, marks tasks as completed, and
notifies the owner via Telegram.

Usage:
    source .env && python3 n8n-workflows/build-tasks-sync.py
"""

import json, os, uuid

# ── Configuration ────────────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get('BATUTYNAS_BOT_TOKEN', '')
OWNER_CHAT_ID = os.environ.get('BATUTYNAS_OWNER_CHAT_ID', '8258463322')
CALENDAR_BRIDGE_CREATE = "https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-calendar-create"

# Google Calendar OAuth credential (same one used by Calendar Bridge)
# The Tasks API requires the tasks scope — may need re-authorization in n8n UI.
GCAL_CRED_ID = "SaHw7JsRiy6wdVUp"
GCAL_CRED_NAME = "Batutynas Google Calendar"

# ── Helpers ──────────────────────────────────────────────────────────────────

def uid():
    return str(uuid.uuid4())

Y = 400  # vertical position

# ── Equipment aliases (for parsing task titles) ──────────────────────────────

EQUIPMENT_ALIASES_JS = r"""
const EQUIPMENT = [
  { name: 'Fantazijų parkas', kw: ['fantaziju', 'fantazij'] },
  { name: 'Džiumandži parkas', kw: ['dziumandzi', 'jumanji', 'džiumandži'] },
  { name: 'Giga ruožas', kw: ['giga'] },
  { name: 'Mega ruožas', kw: ['mega ruoz', 'mega ruož'] },
  { name: 'Mega Rocket', kw: ['mega rocket', 'rocket', 'mega raketa', 'raketa'] },
  { name: 'Mega Ufonautai', kw: ['mega ufonautai', 'ufonautai', 'ufo'] },
  { name: 'Mega Waikiki', kw: ['mega waikiki', 'waikiki'] },
  { name: 'Monstrai', kw: ['monstrai', 'monstr'] },
  { name: 'Chameleonas', kw: ['chameleonas', 'chameleon'] },
  { name: 'Candy Pop', kw: ['candy', 'candy pop'] },
  { name: 'Aštuonkojis', kw: ['astuonkojis', 'aštuonkojis', 'octopus'] },
  { name: 'Vienaragiai', kw: ['vienaragiai', 'vienaragi', 'unicorn'] },
  { name: 'Pilis mažiesiems', kw: ['pilis'] },
  { name: 'Milžiniškas Dart', kw: ['dart', 'milziniskas dart'] },
  { name: 'Kamuolių medžioklė', kw: ['kamuoliu', 'kamuoli'] },
  { name: 'Rodeo bulius', kw: ['rodeo', 'bulius'] },
  { name: 'Saldėsių aparatai', kw: ['saldesiu', 'saldesi', 'vata', 'popcorn'] },
  { name: 'Banketo stalai ir kėdės', kw: ['stalai', 'kedes', 'kėdės', 'banketo', 'kedziu', 'kėdžių'] },
  { name: 'Disco paviljonas', kw: ['disco', 'paviljonas'] },
  { name: 'Putų šou', kw: ['putu', 'putų', 'šou'] },
];
"""

# ── Code node: Parse tasks into booking format ───────────────────────────────

PARSE_TASKS_CODE = EQUIPMENT_ALIASES_JS + r"""
// Input: $json.items = array of Google Tasks
const tasks = ($input.first().json.items || []).filter(t => t.status !== 'completed');
if (tasks.length === 0) return [{ json: { hasTasks: false, bookings: [] } }];

function matchEquipment(title) {
  const lower = (title || '').toLowerCase()
    .replace(/ą/g,'a').replace(/č/g,'c').replace(/ę/g,'e').replace(/ė/g,'e')
    .replace(/į/g,'i').replace(/š/g,'s').replace(/ų/g,'u').replace(/ū/g,'u').replace(/ž/g,'z');
  for (const eq of EQUIPMENT) {
    for (const kw of eq.kw) {
      const kwNorm = kw.toLowerCase()
        .replace(/ą/g,'a').replace(/č/g,'c').replace(/ę/g,'e').replace(/ė/g,'e')
        .replace(/į/g,'i').replace(/š/g,'s').replace(/ų/g,'u').replace(/ū/g,'u').replace(/ž/g,'z');
      if (lower.includes(kwNorm)) return eq.name;
    }
  }
  return title; // fallback: use raw title as equipment name
}

function extractPrice(title) {
  // Match: "uz 200", "už 70 Eur", "uz 150€", "| 200€"
  const m = (title || '').match(/(?:u[zž]\s*|[\|]\s*)(\d+)\s*(?:€|Eur)?/i);
  return m ? parseInt(m[1], 10) : 0;
}

function parseNotes(notes) {
  if (!notes) return { address: '', phones: [], customerName: '' };
  const lines = notes.split(/\n/).map(l => l.trim()).filter(Boolean);
  const phones = lines.filter(l => /^0\d{7,}$/.test(l.replace(/[\s\-\(\)]/g, '')));
  const address = lines[0] || '';
  const nonPhoneNonAddr = lines.slice(1).filter(l => !phones.includes(l));
  return { address, phones, customerName: nonPhoneNonAddr[0] || '' };
}

const bookings = tasks.map(t => {
  const equipment = matchEquipment(t.title || '');
  const price = extractPrice(t.title || '');
  const parsed = parseNotes(t.notes || '');
  const due = t.due ? t.due.substring(0, 10) : new Date().toISOString().substring(0, 10);

  return {
    taskId: t.id,
    taskTitle: t.title,
    equipment: equipment,
    customer_name: parsed.customerName || 'Iš Google Tasks',
    phone: parsed.phones[0] || '',
    address: parsed.address,
    startDate: due,
    durationDays: 1,
    price: price,
    notes: `Sinchronizuota iš Google Tasks: ${t.title}\n${t.notes || ''}`.trim(),
    addons: [],
    source: 'google_tasks',
  };
});

return [{ json: { hasTasks: true, bookings: bookings } }];
"""

# ── Code node: Prepare individual booking requests ───────────────────────────

SPLIT_BOOKINGS_CODE = r"""
// Split bookings array into individual items for sequential processing
const bookings = $input.first().json.bookings || [];
return bookings.map(b => ({ json: b }));
"""

# ── Code node: Format Telegram summary ───────────────────────────────────────

TELEGRAM_SUMMARY_CODE = r"""
const booking = $input.first().json;
const calResult = $('Create Calendar Event').first().json;
const success = calResult && !calResult.error;

let msg = '';
if (success) {
  msg = `✅ Tasks → Kalendorius sinchronizuota:\n` +
    `📦 ${booking.equipment}\n` +
    `📅 ${booking.startDate}\n` +
    `📍 ${booking.address || 'Nenurodyta'}\n` +
    `💰 ${booking.price ? booking.price + '€' : 'Nenurodyta'}\n` +
    `📝 ${booking.taskTitle}`;
} else {
  msg = `⚠️ Nepavyko sinchronizuoti:\n` +
    `📝 ${booking.taskTitle}\n` +
    `❌ ${calResult?.error || 'Nežinoma klaida'}`;
}
return [{ json: { chatId: '""" + OWNER_CHAT_ID + r"""', message: msg } }];
"""

# ── Build workflow ───────────────────────────────────────────────────────────

def build():
    nodes = []
    connections = {}

    def connect(from_name, to_name, from_idx=0, to_idx=0):
        if from_name not in connections:
            connections[from_name] = {"main": [[]]}
        while len(connections[from_name]["main"]) <= from_idx:
            connections[from_name]["main"].append([])
        connections[from_name]["main"][from_idx].append({
            "node": to_name, "type": "main", "index": to_idx
        })

    # Node 1: Schedule Trigger (every 10 minutes)
    n1 = {
        "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
        "id": uid(), "name": "Every 10 Minutes",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [240, Y]
    }
    nodes.append(n1)

    # Node 2: HTTP Request — List Task Lists (find "Batutynas Tauragė" list ID)
    n2 = {
        "parameters": {
            "method": "GET",
            "url": "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleCalendarOAuth2Api",
            "options": {"timeout": 10000}
        },
        "id": uid(), "name": "List Task Lists",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [460, Y],
        "credentials": {"googleCalendarOAuth2Api": {"id": GCAL_CRED_ID, "name": GCAL_CRED_NAME}},
        "continueOnFail": True,
        "alwaysOutputData": True
    }
    nodes.append(n2)

    # Node 3: Code — Find the right task list and fetch its tasks
    find_list_code = r"""
// Find "Batutynas" task list from the lists response
const lists = $input.first().json.items || [];
let targetList = lists.find(l =>
  (l.title || '').toLowerCase().includes('batutynas') ||
  (l.title || '').toLowerCase().includes('taurag')
);
// Fallback: use the first non-default list, or the default
if (!targetList && lists.length > 1) targetList = lists[1];
if (!targetList && lists.length > 0) targetList = lists[0];
if (!targetList) return [{ json: { error: 'No task lists found', hasTasks: false, bookings: [] } }];

return [{ json: { taskListId: targetList.id, taskListTitle: targetList.title } }];
"""
    n3 = {
        "parameters": {"jsCode": find_list_code},
        "id": uid(), "name": "Find Batutynas List",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [680, Y]
    }
    nodes.append(n3)

    # Node 4: HTTP Request — Fetch Tasks from the found list
    n4 = {
        "parameters": {
            "method": "GET",
            "url": "=https://tasks.googleapis.com/tasks/v1/lists/{{ $json.taskListId }}/tasks?showCompleted=false&maxResults=50",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleCalendarOAuth2Api",
            "options": {"timeout": 10000}
        },
        "id": uid(), "name": "Fetch Uncompleted Tasks",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [900, Y],
        "credentials": {"googleCalendarOAuth2Api": {"id": GCAL_CRED_ID, "name": GCAL_CRED_NAME}},
        "continueOnFail": True,
        "alwaysOutputData": True
    }
    nodes.append(n4)

    # Node 5: Code — Parse tasks into bookings
    n5 = {
        "parameters": {"jsCode": PARSE_TASKS_CODE},
        "id": uid(), "name": "Parse Tasks",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1120, Y]
    }
    nodes.append(n5)

    # Node 6: IF — has tasks to sync
    n6 = {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "combinator": "and",
                "conditions": [{
                    "id": uid(),
                    "leftValue": "={{ $json.hasTasks }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "equals"}
                }]
            },
            "options": {}
        },
        "id": uid(), "name": "Has Tasks?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [1340, Y]
    }
    nodes.append(n6)

    # Node 7: Code — Split bookings into individual items
    n7 = {
        "parameters": {"jsCode": SPLIT_BOOKINGS_CODE},
        "id": uid(), "name": "Split Bookings",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1560, Y - 100]
    }
    nodes.append(n7)

    # Node 8: HTTP Request — Create Calendar Event via Calendar Bridge
    n8 = {
        "parameters": {
            "method": "POST",
            "url": CALENDAR_BRIDGE_CREATE,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": """={
  "equipment": "{{ $json.equipment }}",
  "customer_name": "{{ $json.customer_name }}",
  "phone": "{{ $json.phone }}",
  "address": "{{ $json.address }}",
  "startDate": "{{ $json.startDate }}",
  "durationDays": {{ $json.durationDays }},
  "price": {{ $json.price }},
  "notes": {{ JSON.stringify($json.notes) }},
  "source": "google_tasks"
}""",
            "options": {"timeout": 15000}
        },
        "id": uid(), "name": "Create Calendar Event",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1780, Y - 100],
        "continueOnFail": True
    }
    nodes.append(n8)

    # Node 9: HTTP Request — Mark task as completed
    n9 = {
        "parameters": {
            "method": "PATCH",
            "url": "=https://tasks.googleapis.com/tasks/v1/lists/{{ $('Find Batutynas List').first().json.taskListId }}/tasks/{{ $('Split Bookings').item.json.taskId }}",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleCalendarOAuth2Api",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={"status": "completed"}',
            "options": {"timeout": 10000}
        },
        "id": uid(), "name": "Complete Task",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [2000, Y - 100],
        "credentials": {"googleCalendarOAuth2Api": {"id": GCAL_CRED_ID, "name": GCAL_CRED_NAME}},
        "continueOnFail": True
    }
    nodes.append(n9)

    # Node 10: Telegram — notify owner
    n10 = {
        "parameters": {
            "operation": "sendMessage",
            "chatId": OWNER_CHAT_ID,
            "text": "=✅ Tasks sinchronizuota → Kalendorius:\n📦 {{ $('Split Bookings').item.json.equipment }}\n📅 {{ $('Split Bookings').item.json.startDate }}\n📍 {{ $('Split Bookings').item.json.address || 'Nenurodyta' }}\n💰 {{ $('Split Bookings').item.json.price ? $('Split Bookings').item.json.price + '€' : '-' }}",
            "additionalFields": {"parse_mode": "HTML"}
        },
        "id": uid(), "name": "Telegram Notify",
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": [2220, Y - 100],
        "credentials": {"telegramApi": {"id": "9BHFQfSuhUuhfdqW", "name": "Batutynas Telegram Bot"}}
    }
    nodes.append(n10)

    # Connections
    connect("Every 10 Minutes", "List Task Lists")
    connect("List Task Lists", "Find Batutynas List")
    connect("Find Batutynas List", "Fetch Uncompleted Tasks")
    connect("Fetch Uncompleted Tasks", "Parse Tasks")
    connect("Parse Tasks", "Has Tasks?")
    connect("Has Tasks?", "Split Bookings", 0)  # true branch
    connect("Split Bookings", "Create Calendar Event")
    connect("Create Calendar Event", "Complete Task")
    connect("Complete Task", "Telegram Notify")

    workflow = {
        "name": "Batutynas: Tasks → Calendar Sync",
        "nodes": nodes,
        "connections": connections,
        "settings": {
            "executionOrder": "v1",
            "saveManualExecutions": True,
            "callerPolicy": "workflowsFromSameOwner"
        },
        "tags": [{"name": "batutynas"}, {"name": "cron"}]
    }

    return workflow

if __name__ == "__main__":
    wf = build()
    out_path = os.path.join(os.path.dirname(__file__), "tasks-sync-workflow.json")
    with open(out_path, "w") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print(f"Generated: {out_path}")
    print(f"  Nodes: {len(wf['nodes'])}")
    print(f"  Schedule: every 10 minutes")
    print(f"  Flow: Poll Tasks → Parse → Create Calendar Event → Complete Task → Telegram")
