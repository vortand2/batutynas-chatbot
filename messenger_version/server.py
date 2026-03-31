"""
Batutynas – Facebook Messenger Bot v2
Mirrors the web chatbot exactly: same 5 flows, same equipment, same n8n notifications.

Setup (one-time):
  1. Go to developers.facebook.com → create an App → add Messenger product
  2. Create/connect your Facebook Page → generate PAGE_ACCESS_TOKEN
  3. Set any random string as FB_VERIFY_TOKEN (e.g. "batutynas-verify-2026")
  4. Set your deployed webhook URL:  https://<your-domain>/messenger/webhook
  5. Subscribe to: messages, messaging_postbacks
  6. Fill .env (see .env.example)

Order flow:
  Messenger → MongoDB (status: pending) + batutynas-booking-notify (email + Telegram bk_ok/bk_no)
  → Owner confirms via Telegram (bk_ok) OR Dashboard "Patvirtinti → Kalendorių"
  → Google Calendar event created → visible in dashboard calendar
"""

import os
import httpx
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Batutynas Messenger Bot v2")

# ── Environment ───────────────────────────────────────────────────────────────
MONGO_URL        = os.environ["MONGO_URL"]
DB_NAME          = os.environ["DB_NAME"]
PAGE_TOKEN       = os.environ["FB_PAGE_ACCESS_TOKEN"]
VERIFY_TOKEN     = os.environ["FB_VERIFY_TOKEN"]
N8N_BASE_URL     = os.environ.get("N8N_BASE_URL", "")
N8N_WEBHOOK_URL  = os.environ.get("N8N_WEBHOOK_URL", "")   # batutynas-booking-notify

GRAPH_URL = "https://graph.facebook.com/v19.0/me/messages"

_client = AsyncIOMotorClient(MONGO_URL)
db = _client[DB_NAME]

# ── In-memory session store ───────────────────────────────────────────────────
# For production swap with Redis or MongoDB-backed sessions
sessions: dict[str, dict] = {}

def get_session(psid: str) -> dict:
    if psid not in sessions:
        sessions[psid] = {"step": "menu", "flow": None, "order": {}}
    return sessions[psid]

def reset_session(psid: str):
    sessions[psid] = {"step": "menu", "flow": None, "order": {}}

# ── Messenger send helpers ────────────────────────────────────────────────────
async def _post(psid: str, payload: dict):
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(
                GRAPH_URL,
                params={"access_token": PAGE_TOKEN},
                json={"recipient": {"id": psid}, **payload},
            )
            if r.status_code != 200:
                logger.warning("Messenger send error %s: %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.error("Messenger send exception: %s", e)

async def send_text(psid: str, text: str):
    await _post(psid, {"message": {"text": text}})

async def send_quick_replies(psid: str, text: str, replies: list[dict]):
    """replies: [{"title": "...", "payload": "..."}]  (max 13)"""
    await _post(psid, {
        "message": {
            "text": text,
            "quick_replies": [
                {"content_type": "text", "title": r["title"], "payload": r["payload"]}
                for r in replies[:13]
            ],
        }
    })

async def send_buttons(psid: str, text: str, buttons: list[dict]):
    """Postback button template (max 3 buttons)."""
    await _post(psid, {
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": text,
                    "buttons": [
                        {"type": "postback", "title": b["title"], "payload": b["payload"]}
                        for b in buttons[:3]
                    ],
                },
            }
        }
    })

# ── Flow & equipment data (mirrors ChatWidget.jsx) ────────────────────────────
BIRTHDAY_TRAMPOLINES = [
    "Pilis", "Monstrai", "Chameleonas", "Candy Pop",
    "Aštuonkojis", "Vienaragiai", "Mega raketa",
    "Mega ufonautai", "Mega waikiki", "Mega ruožas", "Giga ruožas",
]
COMPANY_TRAMPOLINES = [
    "Fantazijų parkas", "Džiumandži parkas", "Giga ruožas", "Mega ruožas",
    "Mega raketa", "Mega ufonautai", "Mega waikiki", "Monstrai",
    "Chameleonas", "Candy Pop", "Aštuonkojis", "Vienaragiai",
]
PARTY_TRAMPOLINES = [
    "Monstrai", "Chameleonas", "Candy Pop", "Aštuonkojis", "Vienaragiai",
    "Mega raketa", "Mega ufonautai", "Mega waikiki", "Mega ruožas", "Giga ruožas",
]
PURCHASE_CATEGORIES = [
    "Čiuožyklos", "Kliūčių ruožai", "2-jų dalių batutai",
    "Pripučiami žaidimai", "Kompaktiškos aikštelės", "Individuali gamyba",
]
ADDONS_LIST = [
    "Cukraus vata", "Popcorn aparatas", "Šerbeto aparatas",
    "JBL PartyBox", "Virtuali realybė", "Burbulų mašina",
    "Instax Mini", "Sumo kostiumai",
]

FLOW_TRAMPOLINES = {
    "birthday": BIRTHDAY_TRAMPOLINES,
    "company":  COMPANY_TRAMPOLINES,
    "party":    PARTY_TRAMPOLINES,
    "purchase": PURCHASE_CATEGORIES,
}

FLOW_LABELS = {
    "birthday": "Vaiko gimtadieniui",
    "company":  "Įmonės renginiui",
    "party":    "Šventės nuomai",
    "purchase": "Pirkti batutą",
}

# Contact steps per flow (field_name, prompt_lt, address_label)
FLOW_STEPS = {
    "birthday": [
        ("vardas",        "Jūsų vardas ir pavardė?"),
        ("telefonas",     "Tel. numeris (pvz. +37060000000)?"),
        ("vaikuSkaicius", "Vaikų skaičius?"),
        ("data",          "Renginio data (pvz. 2026-06-15)?"),
        ("vieta",         "Pilnas adresas (pvz. Kaunas, Savanorių pr. 5)?"),
    ],
    "company": [
        ("imonesP",    "Įmonės pavadinimas?"),
        ("kontaktinis","Kontaktinis asmuo (vardas pavardė)?"),
        ("telefonas",  "Tel. numeris?"),
        ("dalyviai",   "Dalyvių skaičius?"),
        ("data",       "Renginio data (pvz. 2026-06-15)?"),
        ("vieta",      "Pilnas adresas (pvz. Vilnius, Gedimino pr. 1)?"),
    ],
    "party": [
        ("vardas",          "Jūsų vardas ir pavardė?"),
        ("telefonas",       "Tel. numeris?"),
        ("sveciumSkaicius", "Svečių skaičius?"),
        ("data",            "Renginio data (pvz. 2026-06-15)?"),
        ("vieta",           "Pilnas adresas (pvz. Šiauliai, Tilžės g. 10)?"),
    ],
    "purchase": [
        ("vardas",    "Jūsų vardas ir pavardė?"),
        ("telefonas", "Tel. numeris?"),
        ("epastas",   "El. pašto adresas (atsiųsime katalogą)?"),
        ("adresas",   "Pristatymo pilnas adresas?"),
    ],
    "faq": [],
}

FAQ_TEXT = (
    "Dažniausiai užduodami klausimai:\n\n"
    "Nuoma: nuo 50€/dienai\n"
    "Pristatymas: nemokamas visoje Lietuvoje\n"
    "Saugumas: EU sertifikuoti batutai, reguliari techninė priežiūra\n"
    "Rezervacija: rekomenduojame užsisakyti savaitę iš anksto\n"
    "Kontaktai: +37068558996 | info@batutynas.lt\n"
    "Darbo laikas: I–VII 8:00–21:00\n\n"
    "Rašykite klausimą arba grįžkite į meniu."
)

MAIN_MENU_REPLIES = [
    {"title": "Gimtadienis",       "payload": "FLOW_birthday"},
    {"title": "Įmonės renginys",   "payload": "FLOW_company"},
    {"title": "Šventė / nuoma",    "payload": "FLOW_party"},
    {"title": "Pirkti batutą",     "payload": "FLOW_purchase"},
    {"title": "DUK / Kontaktai",   "payload": "FLOW_faq"},
    {"title": "Kalbėti su žmogumi","payload": "FLOW_human"},
]

# ── n8n notification ──────────────────────────────────────────────────────────
async def notify_n8n(order_id: str, flow_type: str, form_data: dict):
    """Call batutynas-booking-notify webhook — same as web chatbot."""
    if not N8N_WEBHOOK_URL:
        return
    is_purchase = flow_type == "purchase"
    payload = {
        "requestType": "catalog" if is_purchase else "booking",
        "orderId":     order_id,
        "flowType":    flow_type,
        "source":      "facebook_messenger",
        "name":        form_data.get("vardas") or form_data.get("kontaktinis", "Nenurodyta"),
        "phone":       form_data.get("telefonas", ""),
        "email":       form_data.get("epastas", ""),
        "address":     form_data.get("vieta") or form_data.get("adresas", ""),
        "equipment":   form_data.get("batutas", ""),
        "addons":      form_data.get("priedai", []),
        "date":        form_data.get("data", ""),
        "guests":      (form_data.get("vaikuSkaicius") or
                        form_data.get("sveciumSkaicius") or
                        form_data.get("dalyviai", "")),
        "company":     form_data.get("imonesP", ""),
    }
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(N8N_WEBHOOK_URL, json=payload)
        logger.info("n8n notified for messenger order %s", order_id)
    except Exception as e:
        logger.error("n8n notify failed for %s: %s", order_id, e)

# ── Flow handlers ─────────────────────────────────────────────────────────────
async def show_menu(psid: str):
    await send_quick_replies(
        psid,
        "Sveiki, aš Batutyno asistentas, pasirinkitę šventės progą arba rašykite klausimą apačioje!",
        MAIN_MENU_REPLIES,
    )

async def start_flow(psid: str, flow_id: str):
    sess = get_session(psid)
    if flow_id == "faq":
        sess["step"] = "faq"
        await send_text(psid, FAQ_TEXT)
        await send_quick_replies(psid, "Ar reikia pagalbos?", [
            {"title": "Grįžti į meniu",      "payload": "MENU"},
            {"title": "Kalbėti su žmogumi",  "payload": "FLOW_human"},
        ])
        return
    if flow_id == "human":
        sess["step"] = "escalation"
        await send_text(psid, "Supratau! Parašykite savo žinutę ir savininkas su jumis susisieks:")
        return

    sess["flow"]  = flow_id
    sess["step"]  = "trampoline"
    sess["order"] = {}

    opts = FLOW_TRAMPOLINES.get(flow_id, [])
    label = FLOW_LABELS.get(flow_id, "Nuoma")
    qr = [{"title": t, "payload": f"TRAMP_{t}"} for t in opts[:9]]
    if len(opts) > 9:
        qr.append({"title": "Daugiau variantų...", "payload": "TRAMP_MORE"})
    await send_quick_replies(psid, f"{label} — pasirinkite batutą:", qr)

async def pick_trampoline(psid: str, name: str):
    sess = get_session(psid)
    sess["order"]["batutas"] = name
    flow  = sess["flow"]

    if flow == "purchase":
        # Skip addons for purchase flow
        sess["step"] = "contact_0"
        steps = FLOW_STEPS.get(flow, [])
        if steps:
            await send_text(psid, f"Pasirinkta: {name} ✓\n\n{steps[0][1]}")
        return

    # Offer addons
    sess["step"] = "addon"
    await send_quick_replies(
        psid,
        f"Pasirinkta: {name} ✓\n\nAr norėtumėte priedų? (+20–45€ arba NEMOKAMAS)",
        [
            {"title": "Cukraus vata",  "payload": "ADDON_Cukraus vata"},
            {"title": "JBL PartyBox",  "payload": "ADDON_JBL PartyBox"},
            {"title": "Burbulų mašina","payload": "ADDON_Burbulų mašina"},
            {"title": "Daugiau...",    "payload": "ADDON_MORE"},
            {"title": "Be priedų →",   "payload": "ADDON_NONE"},
        ],
    )

async def pick_addon(psid: str, addon: str):
    sess = get_session(psid)
    if addon == "NONE":
        await start_contacts(psid)
        return
    if addon == "MORE":
        await send_quick_replies(psid, "Visi priedai:", [
            {"title": a, "payload": f"ADDON_{a}"} for a in ADDONS_LIST[:9]
        ] + [{"title": "Tęsti be priedų →", "payload": "ADDON_NONE"}])
        return
    sess["order"].setdefault("priedai", []).append(addon)
    await send_quick_replies(psid, f"'{addon}' pridėta! Dar?", [
        {"title": "Dar priedų",      "payload": "ADDON_MORE"},
        {"title": "Tęsti toliau →",  "payload": "ADDON_NONE"},
    ])

async def start_contacts(psid: str):
    sess = get_session(psid)
    sess["step"] = "contact_0"
    steps = FLOW_STEPS.get(sess["flow"], [])
    if steps:
        await send_text(psid, steps[0][1])
    else:
        await finalize(psid)

async def handle_contact_step(psid: str, text: str):
    sess = get_session(psid)
    flow  = sess["flow"]
    steps = FLOW_STEPS.get(flow, [])
    step_idx = int(sess["step"].split("_")[1])

    # Save current answer
    field = steps[step_idx][0]
    sess["order"][field] = text.strip()

    next_idx = step_idx + 1
    if next_idx < len(steps):
        sess["step"] = f"contact_{next_idx}"
        await send_text(psid, steps[next_idx][1])
    else:
        await finalize(psid)

async def handle_escalation(psid: str, text: str):
    await db.escalations.insert_one({
        "source":     "facebook_messenger",
        "psid":       psid,
        "message":    text,
        "status":     "new",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await send_text(psid, "Jūsų žinutė perduota savininkui. Susisieksime artimiausiu metu!")
    await send_quick_replies(psid, "Ar galiu kuo nors dar padėti?",
                             [{"title": "Grįžti į meniu", "payload": "MENU"}])
    reset_session(psid)

async def finalize(psid: str):
    sess = get_session(psid)
    order  = sess["order"]
    flow   = sess["flow"]
    oid    = str(uuid.uuid4())

    # Persist to MongoDB (status: pending — same as web chatbot)
    doc = {
        "id":         oid,
        "flow_type":  flow,
        "source":     "facebook_messenger",
        "psid":       psid,
        "form_data":  dict(order),
        "status":     "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.orders.insert_one({k: v for k, v in doc.items() if k != "_id"})
        logger.info("Messenger order saved: %s (%s)", oid, flow)
    except Exception as e:
        logger.error("DB insert failed: %s", e)

    # Trigger n8n notification (email + Telegram bk_ok/bk_no)
    await notify_n8n(oid, flow, order)

    # Confirm to user
    lines = []
    label_map = {
        "vardas": "Vardas", "kontaktinis": "Kontaktas", "imonesP": "Įmonė",
        "telefonas": "Tel.", "epastas": "El. paštas",
        "data": "Data", "vieta": "Adresas", "adresas": "Adresas",
        "vaikuSkaicius": "Vaikų sk.", "sveciumSkaicius": "Svečių sk.",
        "dalyviai": "Dalyviai", "batutas": "Batutas",
    }
    for k, v in order.items():
        if v and k not in ("priedai",):
            lines.append(f"  {label_map.get(k, k)}: {v}")
    if order.get("priedai"):
        lines.append(f"  Priedai: {', '.join(order['priedai'])}")

    summary = "\n".join(lines)
    await send_text(psid,
        f"Ačiū! Jūsų užklausa gauta:\n\n{summary}\n\n"
        "Savininkas susisieks su jumis telefonu artimiausiu metu.")
    await send_quick_replies(psid, "Ar galiu kuo nors dar padėti?",
                             [{"title": "Grįžti į meniu", "payload": "MENU"}])
    reset_session(psid)

# ── Main dispatcher ───────────────────────────────────────────────────────────
async def dispatch(psid: str, text: str, payload: str | None = None):
    sess    = get_session(psid)
    tl      = text.lower().strip()

    # Global resets
    if tl in ("meniu", "menu", "pradžia", "restart", "/start", "atšaukti", "cancel"):
        reset_session(psid); await show_menu(psid); return

    # Postback / quick-reply payloads
    if payload:
        if payload in ("MENU", "GET_STARTED"):
            reset_session(psid); await show_menu(psid); return
        if payload.startswith("FLOW_"):
            flow = payload[5:].lower()
            await start_flow(psid, flow); return
        if payload.startswith("TRAMP_"):
            await pick_trampoline(psid, payload[6:]); return
        if payload.startswith("ADDON_"):
            await pick_addon(psid, payload[6:]); return
        # Fallback — treat as text
        text = payload

    # Step-based routing
    step = sess["step"]

    if step == "menu":
        await show_menu(psid)
    elif step == "trampoline":
        await pick_trampoline(psid, text)
    elif step == "addon":
        await pick_addon(psid, text)
    elif step == "escalation":
        await handle_escalation(psid, text)
    elif step == "faq":
        await send_text(psid, "Kreipkitės tiesiogiai:\nTel: +37068558996\nEl. p.: info@batutynas.lt")
        await show_menu(psid)
    elif step.startswith("contact_"):
        await handle_contact_step(psid, text)
    else:
        await show_menu(psid)

# ── Webhook endpoints ─────────────────────────────────────────────────────────
@app.get("/messenger/webhook")
async def verify(request: Request):
    """Facebook one-time webhook verification."""
    p = dict(request.query_params)
    if p.get("hub.verify_token") == VERIFY_TOKEN and p.get("hub.challenge"):
        return PlainTextResponse(p["hub.challenge"])
    raise HTTPException(403, "Verification failed")

@app.post("/messenger/webhook")
async def receive(request: Request):
    """Receive messages and postbacks from Messenger Platform."""
    body = await request.json()
    if body.get("object") != "page":
        raise HTTPException(400, "Not a page event")
    for entry in body.get("entry", []):
        for event in entry.get("messaging", []):
            psid = event["sender"]["id"]
            if msg := event.get("message"):
                pl   = msg.get("quick_reply", {}).get("payload")
                text = msg.get("text", "")
                await dispatch(psid, text, pl)
            elif pb := event.get("postback"):
                await dispatch(psid, pb.get("title", ""), pb.get("payload"))
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "batutynas-messenger-bot-v2"}
