#!/usr/bin/env python3
"""
Batutynas: Widget Chat Backend
Synchronous AI chatbot for the BatutynasChat widget.
Returns JSON response directly to the widget (not async like Chatwoot Agent Bot).

Nodes: Webhook → AI Agent (Gemini 2.5 Flash) → Respond to Webhook
  Sub-nodes: Memory, Pinecone RAG, Booking Notify tool
"""

import json, os, uuid

# ── Credentials (from n8n) ─────────────────────────────────────────────────
GEMINI_CRED = {"id": "V0fvCRokUIPzfmGC", "name": "Google Gemini(PaLM) Api account"}
PINECONE_CRED = {"id": "tx6CNw0TKiTr2XYr", "name": "PineconeApi account"}
OPENAI_CRED = {"id": "zNoDyHwmQZdlNzxE", "name": "OpenAi account"}
BOOKING_NOTIFY_WORKFLOW = "0RTcCw1WcdEJDZYo"

# ── System prompt (read from file) ─────────────────────────────────────────
prompt_path = os.path.join(os.path.dirname(__file__), '..', 'prompts', 'chat-system-prompt.md')
with open(prompt_path, 'r', encoding='utf-8') as f:
    SYSTEM_PROMPT = f.read()

def uid():
    return str(uuid.uuid4())

# ── Node helpers ───────────────────────────────────────────────────────────
nodes = []
connections = {}

def add_node(node_dict):
    nodes.append(node_dict)

def pos(x, y):
    return [x, y]

# ============================================================================
# 1. Webhook Trigger — receives widget POST, waits for full flow to complete
# ============================================================================
add_node({
    "parameters": {
        "httpMethod": "POST",
        "path": "batutynas-widget-chat",
        "responseMode": "responseNode",
        "options": {}
    },
    "id": uid(),
    "name": "Widget Webhook",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 2,
    "position": pos(0, 300),
    "webhookId": uid()
})

# ============================================================================
# 2. Extract Message — parse widget payload into chatInput + sessionId
# ============================================================================
EXTRACT_CODE = """
const body = $input.first().json.body || $input.first().json;
const message = body.message || body.chatInput || '';
const sessionId = body.session_id || body.sessionId || 'widget-' + Date.now();

return [{
  json: {
    chatInput: message,
    sessionId: sessionId,
    language: body.language || 'lt'
  }
}];
"""

add_node({
    "parameters": {
        "jsCode": EXTRACT_CODE.strip()
    },
    "id": uid(),
    "name": "Extract Message",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(240, 300)
})

# ============================================================================
# 3. AI Agent — Gemini 2.5 Flash with system prompt
# ============================================================================
add_node({
    "parameters": {
        "promptType": "define",
        "text": "={{ $json.chatInput }}",
        "options": {
            "systemMessage": "=" + SYSTEM_PROMPT
        }
    },
    "id": uid(),
    "name": "AI Agent",
    "type": "@n8n/n8n-nodes-langchain.agent",
    "typeVersion": 1.7,
    "position": pos(500, 300)
})

# ============================================================================
# 3a. Gemini 2.5 Flash LLM
# ============================================================================
add_node({
    "parameters": {
        "modelName": "models/gemini-2.5-flash",
        "options": {
            "maxOutputTokens": 1024,
            "temperature": 0.3
        },
        "maxOutputTokens": 2048
    },
    "id": uid(),
    "name": "Gemini 2.5 Flash",
    "type": "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    "typeVersion": 1,
    "position": pos(400, 520),
    "credentials": {"googlePalmApi": GEMINI_CRED}
})

# ============================================================================
# 3b. Window Buffer Memory (session-based)
# ============================================================================
add_node({
    "parameters": {
        "sessionKey": "={{ $('Extract Message').item.json.sessionId }}",
        "contextWindowLength": 16
    },
    "id": uid(),
    "name": "Chat Memory",
    "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
    "typeVersion": 1.3,
    "position": pos(540, 520)
})

# ============================================================================
# 3c. Pinecone Knowledge Base (RAG tool)
# ============================================================================
add_node({
    "parameters": {
        "mode": "retrieve-as-tool",
        "toolName": "batutynas_knowledge_base",
        "toolDescription": (
            "Search batutynas.lt knowledge base for information about products, "
            "trampolines, prices, delivery zones, safety rules, FAQ, company info, "
            "services, events, and any other business-related questions. "
            "Always use this tool when the customer asks about products, prices, "
            "availability, safety, delivery, or company information."
        ),
        "pineconeIndex": {
            "__rl": True,
            "value": "batutynas",
            "mode": "list",
            "cachedResultName": "batutynas"
        },
        "topK": 5,
        "options": {
            "pineconeNamespace": "batutynas-lt"
        }
    },
    "id": uid(),
    "name": "Pinecone KB",
    "type": "@n8n/n8n-nodes-langchain.vectorStorePinecone",
    "typeVersion": 1,
    "position": pos(680, 520),
    "credentials": {"pineconeApi": PINECONE_CRED}
})

# ============================================================================
# 3c-i. OpenAI Embeddings (for Pinecone)
# ============================================================================
add_node({
    "parameters": {
        "model": "text-embedding-3-small",
        "options": {}
    },
    "id": uid(),
    "name": "OpenAI Embeddings",
    "type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
    "typeVersion": 1.1,
    "position": pos(680, 700),
    "credentials": {"openAiApi": OPENAI_CRED}
})

# ============================================================================
# 3d. Tool: Booking Notify (sub-workflow)
# ============================================================================
add_node({
    "parameters": {
        "name": "booking_notify",
        "description": (
            "Send a booking inquiry notification email to the admin. "
            "Call this tool ONLY after collecting ALL required booking details from the customer. "
            "For rental bookings (birthday/public/party): date, location, address (full address with street), "
            "guest_count, contact_name, contact_phone, trampoline_preference, addons, event_type, group_type. "
            "For purchase inquiries (catalog/custom): request_type='catalog' with email, or "
            "request_type='custom' with dimensions, colors, characters, notes, email, phone."
        ),
        "workflowId": {
            "__rl": True,
            "value": BOOKING_NOTIFY_WORKFLOW,
            "mode": "list",
            "cachedResultUrl": f"/workflow/{BOOKING_NOTIFY_WORKFLOW}",
            "cachedResultName": "Batutynas: Booking Notification Tool"
        },
        "responsePropertyName": "result",
        "specifyInputSchema": True,
        "jsonSchemaExample": json.dumps({
            "group_type": "birthday",
            "date": "2026-02-21",
            "location": "Tauragė",
            "address": "Tauragė, Žemaitės g. 15",
            "event_type": "Gimtadienis",
            "guest_count": "10",
            "contact_name": "Jonas",
            "contact_phone": "+37061234567",
            "trampoline_preference": "Mega Rocket",
            "addons": "Milžiniškas Dart, Rodeo bulius"
        }, ensure_ascii=False)
    },
    "id": uid(),
    "name": "Tool: Booking Notify",
    "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
    "typeVersion": 2,
    "position": pos(820, 520)
})

# ============================================================================
# 4. Format Response — prepare JSON for widget
# ============================================================================
FORMAT_CODE = """
const agentOutput = $input.first().json || {};
const response = agentOutput.output || agentOutput.text || '';
const sessionId = $('Extract Message').item.json.sessionId;

return [{
  json: {
    response: response,
    output: response,
    session_id: sessionId
  }
}];
"""

add_node({
    "parameters": {
        "jsCode": FORMAT_CODE.strip()
    },
    "id": uid(),
    "name": "Format Response",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": pos(760, 300)
})

# ============================================================================
# 5. Respond to Webhook — return JSON to widget
# ============================================================================
add_node({
    "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": {
            "responseCode": 200,
            "responseHeaders": {
                "entries": [
                    {"name": "Access-Control-Allow-Origin", "value": "*"},
                    {"name": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization"}
                ]
            }
        }
    },
    "id": uid(),
    "name": "Respond JSON",
    "type": "n8n-nodes-base.respondToWebhook",
    "typeVersion": 1.1,
    "position": pos(1000, 300)
})

# ============================================================================
# Connections
# ============================================================================
connections = {
    "Widget Webhook": {"main": [[{"node": "Extract Message", "type": "main", "index": 0}]]},
    "Extract Message": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
    "AI Agent": {"main": [[{"node": "Format Response", "type": "main", "index": 0}]]},
    "Gemini 2.5 Flash": {"ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]},
    "Chat Memory": {"ai_memory": [[{"node": "AI Agent", "type": "ai_memory", "index": 0}]]},
    "Pinecone KB": {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]},
    "OpenAI Embeddings": {"ai_embedding": [[{"node": "Pinecone KB", "type": "ai_embedding", "index": 0}]]},
    "Tool: Booking Notify": {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]},
    "Format Response": {"main": [[{"node": "Respond JSON", "type": "main", "index": 0}]]}
}

# ============================================================================
# Output
# ============================================================================
workflow = {
    "name": "Batutynas: Widget Chat Backend",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"}
}

out_path = os.path.join(os.path.dirname(__file__), "widget-chat-workflow.json")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print(f"✅ widget-chat-workflow.json ({len(nodes)} nodes)")
print(f"\n📌 Flow: Widget Webhook → Extract → AI Agent (Gemini) → Format → Respond JSON")
print(f"   Sub-nodes: Chat Memory, Pinecone KB, OpenAI Embeddings, Booking Notify tool")
print(f"\n📌 Endpoint: POST /webhook/batutynas-widget-chat")
print(f"   Expects: {{ message, session_id }}")
print(f"   Returns: {{ response, session_id }}")
