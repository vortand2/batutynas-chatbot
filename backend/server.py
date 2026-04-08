from fastapi import FastAPI, APIRouter, Header, HTTPException, Body, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import math
import logging
import asyncio
import hashlib
import resend
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Union
import uuid
from datetime import datetime, timezone, timedelta
from google import genai as _genai
from google.genai import types as _gtypes
from bin_pack import bin_pack as _bin_pack, get_default_units
try:
    from clarke_wright import clarke_wright_assign as _cw_assign, has_coordinates as _has_coords
    _HAS_CW = True
except ImportError:
    _HAS_CW = False
    def _has_coords(_stops): return False  # noqa: E704
    def _cw_assign(_stops, _vehicles): return {}, []  # noqa: E704

# ── Add-on size reference (units per add-on item) ─────────────────────────────
# 'full' = takes entire vehicle; float = fractional trampoline-equivalent slots
_ADDON_UNITS: dict[str, float | str] = {
    # Large items
    "disco pavilijonas":      1.0,
    "disco":                  1.0,
    "banketo stalai ir kėdės": "full",
    "banketo stailai":        "full",   # common typo
    "banketo":                "full",
    "stalai ir kėdės":        "full",
    "mechaninis jautis":      2.0,
    "mechanical bull":        2.0,
    "bull":                   2.0,
    "mega dart":              2.0,
    "dart":                   2.0,
    # Chatbot add-ons (medium)
    "pūtų šou":               0.5,
    "pūtų":                   0.5,
    "bubble":                 0.5,
    "sumo kostiumai":         0.5,
    "sumo":                   0.5,
    # Chatbot add-ons (small machines)
    "cukraus vata":           0.3,
    "popcorn aparatas":       0.3,
    "popcorn":                0.3,
    "šerbeto aparatas":       0.3,
    "šerbetas":               0.3,
    "virtuali realybė":       0.3,
    "vr":                     0.3,
    # Chatbot add-ons (compact)
    "jbl partybox":           0.2,
    "jbl":                    0.2,
    "burbulų mašina":         0.2,
    "burbulai":               0.2,
    "instax mini":            0.1,
    "instax":                 0.1,
}


def _get_addon_units(addon: str) -> float | str:
    """Detect the size (unit cost) of a single add-on item."""
    name = addon.lower().strip()
    for key, units in _ADDON_UNITS.items():
        if key in name:
            return units
    # Heuristic: names containing large-item keywords
    if any(kw in name for kw in ("mega ", "giga ", "jautis", "bull")):
        return 2.0
    # Small service items
    if any(kw in name for kw in ("šou", "show", "foto", "dekor", "muzika", "dj ")):
        return 0.5
    return 0.5   # unknown add-on → treat as small (half slot)


def _calculate_order_units(equipment: str, addons: list[str]) -> float | str:
    """Total unit cost for one order = equipment + all add-ons.

    Returns 'full' if any item requires a full vehicle, otherwise a float sum.
    """
    base = get_default_units(equipment)
    if base == "full":
        return "full"

    total = float(base)
    for addon in addons:
        au = _get_addon_units(addon)
        if au == "full":
            return "full"
        total += float(au)
    return round(total, 2)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Security headers middleware ───────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        response.headers.setdefault('X-XSS-Protection', '1; mode=block')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        return response

app.add_middleware(SecurityHeadersMiddleware)

OWNER_EMAIL          = os.environ.get('OWNER_EMAIL', 'dovydasdobrovolskis@gmail.com')
RESEND_API_KEY       = os.environ.get('RESEND_API_KEY', '')
GEMINI_API_KEY       = os.environ.get('GEMINI_API_KEY', '')
N8N_BASE_URL         = os.environ.get('N8N_BASE_URL', '').rstrip('/')
N8N_WEBHOOK_URL      = os.environ.get('N8N_WEBHOOK_URL', '')
CALENDAR_BRIDGE_URL  = os.environ.get('CALENDAR_BRIDGE_URL', '')
ADMIN_PASSWORD       = os.environ.get('ADMIN_PASSWORD', '')
N8N_SYNC_SECRET      = os.environ.get('N8N_SYNC_SECRET', '')   # shared secret for /webhook/n8n-sync
GOOGLE_MAPS_API_KEY  = os.environ.get('GOOGLE_MAPS_API_KEY', '')  # Geocoding + Directions API

VALID_FLOW_TYPES = {'birthday', 'company', 'party', 'purchase', 'faq'}

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# ── Admin auth helpers ────────────────────────────────────────────────────────

def _admin_token(day: str) -> str:
    return hashlib.sha256(f"{ADMIN_PASSWORD}:{day}".encode()).hexdigest()

def _today() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')

def _yesterday() -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')

def _verify_admin_token(token: str) -> bool:
    if not ADMIN_PASSWORD or not token:
        return False
    return token in (_admin_token(_today()), _admin_token(_yesterday()))

async def require_admin(x_admin_token: Optional[str] = Header(None)):
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(status_code=401, detail="Neteisingas arba pasibaigęs sesijos raktas")

FLOW_LABELS = {
    'birthday': 'Vaiko gimtadienis',
    'company':  'Įmonės renginys',
    'party':    'Šventės nuoma',
    'purchase': 'Batuto pirkimas',
}

FIELD_LABELS = {
    'vardas': 'Vardas', 'telefonas': 'Tel. numeris', 'data': 'Renginio data',
    'vieta': 'Vieta', 'vaikuSkaicius': 'Vaikų skaičius', 'sveciumSkaicius': 'Svečių skaičius',
    'dalyviai': 'Dalyvių skaičius', 'imonesP': 'Įmonės pavadinimas',
    'kontaktinis': 'Kontaktinis asmuo', 'batutas': 'Pasirinktas batutas',
    'priedai': 'Priedai', 'adresas': 'Pristatymo adresas',
}

# ── Gemini system prompt ─────────────────────────────────────────────────────
BATUTYNAS_SYSTEM_PROMPT = """Tu esi Batutynas.lt pagalbos asistentas. Visada atsakyk TIKTAI LIETUVIŠKAI. \
Būk draugiškas, šiltas ir trumpas (maks. 3 sakiniai). Niekada nekalbėk apie pašalines temas.

APIE ĮMONĘ: Batutynas.lt – batutų nuoma ir pardavimas Lietuvoje nuo 2015 m. \
EN14960 sertifikuota įranga. Privačios šventės: Tauragės apskritis, Šilutė, Kelmė, Raseiniai, Rietavas. \
Vieši renginiai: visa Lietuva. Darbo laikas: I–VII 8:00–21:00.

BATUTAI NUOMAI: Pilis (iki 5 m.), Monstrai, Chameleonas, Candy Pop, Aštuonkojis, Vienaragiai \
(žaidimų centrai), Mega raketa, Mega ufonautai, Mega waikiki (dviejų dalių), \
Mega ruožas, Giga ruožas (kliūčių ruožai).

PRIEDAI – 1 NEMOKAMAS su bet kokiu batutu (atskirai 20–45 €): \
Cukraus vata, Popcorn aparatas, Šerbeto aparatas, JBL PartyBox, Virtuali realybė, \
Burbulų mašina, Instax Mini, Sumo kostiumai.

PIRKIMUI: Čiuožyklos, Kliūčių ruožai, 2-jų dalių batutai, Pripučiami žaidimai, \
Kompaktiškos aikštelės, Individuali gamyba su logotipu.

SAUGA: Maks. 1 vaikas vienu metu. Vaikai iki 6 m. – prižiūrimi suaugusiojo. Tik be batų.

KONTAKTAI: +37064880388 | info@batutynas.lt | batutynas.lt

SVARBU: Jei klientas nori rezervuoti, užsisakyti arba sužinoti kainą – \
paprašyk jų naudoti pokalbio mygtukus (Vaiko gimtadieniui, Įmonės renginiui, Šventės nuomai, Pirkti batutą). \
Kainos derinamos su savininku po užklausos pateikimo."""

# ── Models ───────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    flow_type: str
    form_data: Dict[str, Any]

class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    flow_type: str
    form_data: Dict[str, Any]
    status: str = "pending"   # pending | confirmed | rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EscalationCreate(BaseModel):
    name: str
    contact: str
    message: str

class Escalation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: str
    message: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChatRequest(BaseModel):
    session_id: str
    message: str

# ── Email helpers ─────────────────────────────────────────────────────────────

def _email_base(title: str, created_at: str, rows_html: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:20px 24px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">{title}</h2>
        <p style="color:#ede9fe;margin:4px 0 0;font-size:12px;">Gautas: {created_at}</p>
      </div>
      <div style="border:1px solid #e9d5ff;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">{rows_html}</table>
      </div>
      <p style="margin-top:16px;color:#9ca3af;font-size:11px;text-align:center;">
        Batutynas chatbot sistema &bull; batutynas.lt
      </p>
    </div>"""

def _rows(data: dict) -> str:
    html = ''
    for i, (k, v) in enumerate(data.items()):
        bg = '#faf5ff' if i % 2 == 0 else '#ffffff'
        label = FIELD_LABELS.get(k, k)
        html += (f'<tr style="background:{bg};">'
                 f'<td style="padding:10px 16px;font-weight:600;color:#6d28d9;font-size:13px;width:40%;">{label}</td>'
                 f'<td style="padding:10px 16px;color:#374151;font-size:13px;">{v}</td></tr>')
    return html

async def send_email(subject: str, html: str):
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set – skipping email")
        return
    try:
        recipients = [OWNER_EMAIL]
        if "info@batutynas.lt" not in recipients:
            recipients.append("info@batutynas.lt")
        params = {"from": "Batutynas <onboarding@resend.dev>", "to": recipients, "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error("Email send failed: %s", e)

# ── n8n webhook ───────────────────────────────────────────────────────────────

async def trigger_n8n(order: Order):
    if not N8N_WEBHOOK_URL:
        return
    try:
        fd = order.form_data
        is_purchase = order.flow_type == 'purchase'
        payload = {
            "requestType":          "catalog" if is_purchase else "booking",
            "orderId":              order.id,
            "flowType":             order.flow_type,
            # Fields matching n8n Parse Booking Data expected names:
            "contact_name":         fd.get('vardas') or fd.get('kontaktinis', 'Nenurodyta'),
            "contact_phone":        fd.get('telefonas', ''),
            "email":                fd.get('epastas', ''),
            "location":             fd.get('vieta') or fd.get('adresas', ''),
            "trampoline_preference": fd.get('batutas', ''),
            "addons":               fd.get('priedai', ''),
            "date":                 fd.get('data', ''),
            "guest_count":          fd.get('vaikuSkaicius') or fd.get('sveciumSkaicius') or fd.get('dalyviai', ''),
            "group_type":           order.flow_type,
            "company":              fd.get('imonesP', ''),
            "createdAt":            order.created_at,
            # Also send with old names for backward compatibility
            "name":                 fd.get('vardas') or fd.get('kontaktinis', 'Nenurodyta'),
            "phone":                fd.get('telefonas', ''),
            "address":              fd.get('vieta') or fd.get('adresas', ''),
            "equipment":            fd.get('batutas', ''),
            "guests":               fd.get('vaikuSkaicius') or fd.get('sveciumSkaicius') or fd.get('dalyviai', ''),
        }
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(N8N_WEBHOOK_URL, json=payload)
        logger.info("n8n booking-notify triggered for order %s", order.id)
    except Exception as e:
        logger.error("n8n webhook failed: %s", e)

# ── Routes ────────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Batutynas API veikia"}


@api_router.post("/webhook/n8n-sync")
async def n8n_sync(body: Dict[str, Any], x_sync_secret: Optional[str] = Header(None)):
    """
    Sync endpoint: called by n8n / Telegram bot when owner clicks bk_ok / bk_no.
    Updates the MongoDB order status so the dashboard stays in sync.

    Required payload:
      { "orderId": "<mongodb_order_id>", "status": "confirmed" | "rejected" }

    Optional payload fields:
      { "bkId": "<postgres_id>", "source": "telegram" | "n8n", "calendarEventId": "..." }

    Secure with x-sync-secret header matching N8N_SYNC_SECRET env var.
    """
    if N8N_SYNC_SECRET and x_sync_secret != N8N_SYNC_SECRET:
        raise HTTPException(401, "Invalid sync secret")

    order_id = str(body.get("orderId", "")).strip()
    status   = str(body.get("status", "confirmed")).strip().lower()

    if not order_id:
        raise HTTPException(400, "orderId is required")
    if status not in ("confirmed", "rejected"):
        raise HTTPException(400, "status must be 'confirmed' or 'rejected'")

    update_fields: Dict[str, Any] = {
        "status":      status,
        "synced_from": body.get("source", "n8n"),
        "synced_at":   datetime.now(timezone.utc).isoformat(),
    }
    if body.get("bkId"):
        update_fields["external_bk_id"] = str(body["bkId"])
    if body.get("calendarEventId"):
        update_fields["calendar_event_id"] = str(body["calendarEventId"])

    result = await db.orders.update_one({"id": order_id}, {"$set": update_fields})

    if result.matched_count == 0:
        logger.warning("n8n-sync: order %s not found", order_id)
        return {"success": False, "order_id": order_id, "matched": 0}

    logger.info("n8n-sync: %s → %s (via %s)", order_id, status, body.get("source", "n8n"))
    return {"success": True, "order_id": order_id, "status": status, "matched": result.matched_count}


@api_router.post("/orders", response_model=Order)
async def create_order(data: OrderCreate):
    if data.flow_type not in VALID_FLOW_TYPES:
        raise HTTPException(400, f"Neteisingas flow_type. Galimi: {', '.join(sorted(VALID_FLOW_TYPES))}")
    if len(str(data.form_data)) > 10_000:
        raise HTTPException(413, "form_data per didelis")
    order = Order(flow_type=data.flow_type, form_data=data.form_data)
    await db.orders.insert_one(order.model_dump())
    flow_label = FLOW_LABELS.get(data.flow_type, data.flow_type)
    html = _email_base(f"Naujas užsakymas – {flow_label}", order.created_at, _rows(order.form_data))
    await send_email(f"Batutynas: Naujas užsakymas – {flow_label}", html)
    asyncio.create_task(trigger_n8n(order))
    return order


@api_router.post("/escalation", response_model=Escalation)
async def create_escalation(data: EscalationCreate):
    esc = Escalation(**data.model_dump())
    await db.escalations.insert_one(esc.model_dump())
    data_dict = {'Vardas': esc.name, 'Kontaktas': esc.contact, 'Žinutė': esc.message}
    html = _email_base("Eskalacijos pranešimas – reikalinga pagalba", esc.created_at, _rows(data_dict))
    await send_email("Batutynas: Eskalacijos pranešimas", html)
    return esc


# ── Gemini client & per-session chat management ───────────────────────────────
_gemini_client: "_genai.Client | None" = None
_chat_sessions: "dict[str, object]" = {}


def _get_gemini_client() -> "_genai.Client":
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = _genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


def _get_chat_session(session_id: str):
    """Return (or lazily create) an async chat session for this session_id."""
    if session_id not in _chat_sessions:
        chat = _get_gemini_client().aio.chats.create(
            model="gemini-2.5-flash",
            config=_gtypes.GenerateContentConfig(
                system_instruction=BATUTYNAS_SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=400,
            ),
        )
        _chat_sessions[session_id] = chat
        # Prevent unbounded memory growth (keep last 500 sessions)
        if len(_chat_sessions) > 500:
            _chat_sessions.pop(next(iter(_chat_sessions)))
    return _chat_sessions[session_id]


def clean_ai_response(text: str) -> str:
    """Strip Gemini 2.5 Flash thinking traces from response."""
    import re
    # Remove THOUGHT:/thinking blocks that may leak into response
    cleaned = re.sub(r'(THOUGHT|THINKING):.*?(?=\n[A-ZĄČĘĖĮŠŲŪŽ]|\Z)', '', text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = cleaned.strip()
    return cleaned if cleaned else text.strip()


@api_router.post("/chat")
async def chat(data: ChatRequest):
    if not GEMINI_API_KEY:
        return {"reply": "Atsiprašome, AI asistentas šiuo metu neveikia. Skambinkite: +37064880388"}
    try:
        chat_session = _get_chat_session(data.session_id)
        response = await chat_session.send_message(data.message)
        return {"reply": clean_ai_response(response.text or "")}
    except Exception as e:
        logger.error("Gemini chat error: %s", e)
        # Reset broken session so next message starts fresh
        _chat_sessions.pop(data.session_id, None)
        return {"reply": "Atsiprašome, įvyko klaida. Skambinkite tiesiogiai: +37064880388"}


def _parse_bridge_response(data: dict) -> bool:
    """
    Flexible parser for external calendar bridge responses.
    Returns True when the date is booked/unavailable.

    Supported response shapes:
      {"booked": true}
      {"available": false}
      {"reserved": true}
      {"status": "booked" | "reserved" | "unavailable" | "taken"}
      {"is_available": false}
      {"free": false}
    """
    if data.get("booked") is True:
        return True
    if data.get("available") is False:
        return True
    if data.get("is_available") is False:
        return True
    if data.get("reserved") is True:
        return True
    if data.get("free") is False:
        return True
    status = str(data.get("status", "")).lower()
    if status in ("booked", "reserved", "unavailable", "taken", "occupied"):
        return True
    return False


async def _check_date_bridge(client: httpx.AsyncClient, batutas: str, date_str: str) -> bool:
    """One HTTP GET to the external bridge for a single date. Returns True = booked."""
    try:
        r = await client.get(
            CALENDAR_BRIDGE_URL,
            params={"date": date_str, "equipment": batutas},
            timeout=8,
        )
        r.raise_for_status()
        return _parse_bridge_response(r.json())
    except Exception as exc:
        logger.warning("Calendar bridge error for %s on %s: %s", batutas, date_str, exc)
        return False  # treat bridge errors as available (do not block users)


async def _booked_from_bridge(batutas: str, month: str) -> list[str]:
    """
    Fetch booked dates for *batutas* in *month* (YYYY-MM) by querying
    CALENDAR_BRIDGE_URL once per day in parallel.
    """
    import calendar as cal_lib
    year, m = map(int, month.split("-"))
    days = cal_lib.monthrange(year, m)[1]
    dates = [f"{month}-{str(d).zfill(2)}" for d in range(1, days + 1)]
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_check_date_bridge(client, batutas, d) for d in dates],
            return_exceptions=False,
        )
    return [dates[i] for i, booked in enumerate(results) if booked]


@api_router.get("/availability")
async def get_availability(batutas: str, month: str):
    """
    Returns booked dates for a trampoline in a given month.
    Query params: batutas=<name>&month=YYYY-MM
    Response: {"batutas": "...", "month": "...", "booked_dates": ["YYYY-MM-DD", ...], "source": "..."}

    Sources:
      "calendar_bridge" — fetched from CALENDAR_BRIDGE_URL (set in .env)
      "mongodb"         — fallback: dates found in local orders collection
    """
    if CALENDAR_BRIDGE_URL:
        booked = await _booked_from_bridge(batutas, month)
        return {"batutas": batutas, "month": month, "booked_dates": booked, "source": "calendar_bridge"}

    # ── MongoDB fallback ───────────────────────────────────────────────────────
    cursor = db.orders.find(
        {"form_data.batutas": batutas, "form_data.data": {"$regex": f"^{month}"}},
        {"form_data.data": 1, "_id": 0},
    )
    orders = await cursor.to_list(length=None)
    booked = list({o["form_data"]["data"] for o in orders if o.get("form_data", {}).get("data")})
    return {"batutas": batutas, "month": month, "booked_dates": booked, "source": "mongodb"}


@api_router.get("/orders")
async def get_orders():
    return await db.orders.find({}, {"_id": 0}).to_list(200)


@api_router.get("/escalations")
async def get_escalations():
    return await db.escalations.find({}, {"_id": 0}).to_list(200)


# ── Admin auth ────────────────────────────────────────────────────────────────

@api_router.post("/admin/auth")
async def admin_login(body: Dict[str, Any]):
    pwd = body.get("password", "")
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "ADMIN_PASSWORD not configured")
    if pwd != ADMIN_PASSWORD:
        raise HTTPException(401, "Neteisingas slaptažodis")
    day = _today()
    return {"token": _admin_token(day), "day": day}


@api_router.get("/admin/verify")
async def admin_verify(x_admin_token: Optional[str] = Header(None)):
    return {"valid": _verify_admin_token(x_admin_token or '')}


# ── Pending orders (chatbot → awaiting confirmation) ─────────────────────────

@api_router.get("/admin/pending-orders")
async def get_pending_orders(_=Depends(require_admin)):
    cursor = db.orders.find(
        {"status": {"$in": ["pending", "submitted"]}},
        {"_id": 0}
    ).sort("created_at", -1)
    return await cursor.to_list(length=200)


@api_router.post("/orders/{order_id}/confirm")
async def confirm_order(order_id: str, extra: Dict[str, Any] = Body({}), _=Depends(require_admin)):
    """
    Confirms a pending chatbot order and creates a Google Calendar event via n8n.
    Optional body fields: price, startDate, durationDays, notes
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Užsakymas nerastas")

    fd = order.get("form_data", {})
    payload = {
        "equipment":     extra.get("equipment")     or fd.get("batutas", ""),
        "customer_name": extra.get("customer_name") or fd.get("vardas") or fd.get("kontaktinis", ""),
        "phone":         extra.get("phone")         or fd.get("telefonas", ""),
        "address":       extra.get("address")       or fd.get("vieta") or fd.get("adresas", ""),
        "startDate":     extra.get("startDate")     or fd.get("data", ""),
        "durationDays":  int(extra.get("durationDays", 1)),
        "price":         float(extra.get("price", 0)) if extra.get("price") else 0,
        "addons":        extra.get("addons", fd.get("priedai", [])),
        "notes":         extra.get("notes", f"Chatbot užsakymas #{order_id[:8]}"),
        "source":        "chatbot",
        "guests":        fd.get("vaikuSkaicius") or fd.get("sveciumSkaicius") or fd.get("dalyviai", ""),
        "company":       fd.get("imonesP", ""),
    }

    calendar_result = None
    if N8N_BASE_URL:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(_n8n_url("batutynas-calendar-create"), json=payload)
                r.raise_for_status()
                calendar_result = r.json()
            logger.info("Calendar event created for order %s", order_id)
        except Exception as e:
            logger.error("Calendar create failed for order %s: %s", order_id, e)
            raise HTTPException(502, f"Nepavyko sukurti kalendoriaus įvykio: {e}")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": datetime.now(timezone.utc).isoformat(),
            "calendar_payload": payload,
        }}
    )
    return {"success": True, "order_id": order_id, "calendar": calendar_result}


@api_router.post("/orders/{order_id}/reject")
async def reject_order(order_id: str, _=Depends(require_admin)):
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Užsakymas nerastas")
    return {"success": True, "order_id": order_id}


# ── Admin Dashboard proxy routes ──────────────────────────────────────────────
# These routes proxy requests to the n8n Calendar Bridge so the frontend
# never needs to know the n8n URL. Set N8N_BASE_URL in .env to enable.

def _n8n_url(path: str) -> str:
    return f"{N8N_BASE_URL}/webhook/{path}"


@api_router.get("/admin/dashboard")
async def admin_dashboard(month: str = "", _=Depends(require_admin)):
    if not N8N_BASE_URL:
        return {
            "bookings": [], "stats": {}, "equipment": [],
            "source": "no_n8n",
            "error": "N8N_BASE_URL aplinkos kintamasis nenustatytas backend'e",
        }
    try:
        params = {"month": month} if month else {}
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(_n8n_url("batutynas-dashboard-v2"), params=params)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.error("admin_dashboard proxy error: %s", e)
        return {"bookings": [], "stats": {}, "equipment": [], "error": str(e)}


@api_router.get("/admin/health")
async def admin_health(_=Depends(require_admin)):
    """Diagnostic endpoint — surfaces config + live reachability of the
    subsystems the dashboard depends on (MongoDB, n8n Calendar Bridge, Gemini).
    Used by the dashboard to show a status banner when something is broken.
    """
    mongo_ok = False
    pending_count = 0
    last_order_at = None
    try:
        pending_count = await db.orders.count_documents({"status": {"$in": ["pending", "submitted"]}})
        latest = await db.orders.find({}, {"_id": 0, "created_at": 1}).sort("created_at", -1).limit(1).to_list(1)
        last_order_at = latest[0].get("created_at") if latest else None
        mongo_ok = True
    except Exception as e:
        logger.error("admin_health mongo error: %s", e)

    n8n_reachable = False
    n8n_error = None
    if N8N_BASE_URL:
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(_n8n_url("batutynas-dashboard-v2"), params={"month": _today()[:7]})
                n8n_reachable = r.status_code < 500
        except Exception as e:
            n8n_error = str(e)[:200]

    return {
        "n8n_configured":     bool(N8N_BASE_URL),
        "n8n_base_url":       N8N_BASE_URL or None,
        "n8n_reachable":      n8n_reachable,
        "n8n_error":          n8n_error,
        "mongo_ok":           mongo_ok,
        "gemini_configured":  bool(GEMINI_API_KEY),
        "pending_orders_count": pending_count,
        "last_order_at":      last_order_at,
    }


@api_router.get("/admin/next-free")
async def admin_next_free(equipment: str, days: int = 30, _=Depends(require_admin)):
    if not N8N_BASE_URL:
        return {"freeDates": [], "error": "N8N_BASE_URL not configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(_n8n_url("batutynas-next-free"), params={"equipment": equipment, "days": min(days, 90)})
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.error("admin_next_free proxy error: %s", e)
        return {"freeDates": [], "error": str(e)}


def _safe_json(r: httpx.Response) -> dict:
    """Parse JSON response safely – return raw text if body is empty or non-JSON."""
    try:
        return r.json()
    except Exception:
        return {"ok": True, "status": r.status_code, "raw": (r.text or "")[:300]}


@api_router.post("/admin/booking/create")
async def admin_booking_create(body: Dict[str, Any], _=Depends(require_admin)):
    if not N8N_BASE_URL:
        raise HTTPException(503, "N8N_BASE_URL not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(_n8n_url("batutynas-calendar-create"), json=body)
            r.raise_for_status()
            return _safe_json(r)
    except httpx.HTTPStatusError as e:
        logger.error("admin_booking_create HTTP error: %s", e)
        raise HTTPException(502, f"n8n klaida: {e.response.status_code}")
    except Exception as e:
        logger.error("admin_booking_create proxy error: %s", e)
        raise HTTPException(502, str(e))


@api_router.post("/admin/booking/update")
async def admin_booking_update(body: Dict[str, Any], _=Depends(require_admin)):
    if not N8N_BASE_URL:
        raise HTTPException(503, "N8N_BASE_URL not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(_n8n_url("batutynas-calendar-update"), json=body)
            r.raise_for_status()
            return _safe_json(r)
    except httpx.HTTPStatusError as e:
        logger.error("admin_booking_update HTTP error: %s", e)
        raise HTTPException(502, f"n8n klaida: {e.response.status_code}")
    except Exception as e:
        logger.error("admin_booking_update proxy error: %s", e)
        raise HTTPException(502, str(e))


@api_router.post("/admin/booking/delete")
async def admin_booking_delete(body: Dict[str, Any], _=Depends(require_admin)):
    if not N8N_BASE_URL:
        raise HTTPException(503, "N8N_BASE_URL not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(_n8n_url("batutynas-calendar-delete"), json=body)
            r.raise_for_status()
            return _safe_json(r)
    except httpx.HTTPStatusError as e:
        logger.error("admin_booking_delete HTTP error: %s", e)
        raise HTTPException(502, f"n8n klaida: {e.response.status_code}")
    except Exception as e:
        logger.error("admin_booking_delete proxy error: %s", e)
        raise HTTPException(502, str(e))


# ── Route Planner endpoints ───────────────────────────────────────────────────
# Standalone: these 3 endpoints power the RoutePlanner.jsx admin feature.
# To integrate into another system, add these endpoints and set GOOGLE_MAPS_API_KEY.

@api_router.get("/admin/route/orders")
async def get_route_orders(date: str, x_admin_token: Optional[str] = Header(None)):
    """Return orders for a given date (YYYY-MM-DD) for route planning.
    Merges two data sources:
      1. MongoDB (chatbot orders with form_data.data matching)
      2. n8n Calendar Bridge (Google Calendar bookings for that date)
    Includes add-ons with their unit costs factored into the total stop units."""
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")

    result = []
    seen_ids = set()

    # ── Source 1: MongoDB chatbot orders ──────────────────────────────────────
    orders = await db.orders.find(
        {"status": {"$in": ["confirmed", "pending"]}, "form_data.data": date},
        {"_id": 0},
    ).to_list(200)
    for o in orders:
        fd = o.get("form_data", {})
        equipment = fd.get("batutas", "") or ""
        raw_addons = fd.get("priedai", []) or []
        if isinstance(raw_addons, str):
            addons = [a.strip() for a in raw_addons.split(",") if a.strip()]
        else:
            addons = [str(a).strip() for a in raw_addons if a]
        total_units = _calculate_order_units(equipment, addons)
        oid = o.get("id", "")
        seen_ids.add(oid)
        result.append({
            "orderId":   oid,
            "name":      fd.get("vardas") or fd.get("kontaktinis", "N/A"),
            "phone":     fd.get("telefonas", ""),
            "equipment": equipment,
            "addons":    addons,
            "units":     total_units,
            "address":   fd.get("vieta") or fd.get("adresas", ""),
            "flowType":  o.get("flow_type", ""),
            "status":    o.get("status", ""),
            "source":    "chatbot",
        })

    # ── Source 2: n8n Calendar Bridge (Google Calendar) ───────────────────────
    if N8N_BASE_URL:
        try:
            month = date[:7]  # YYYY-MM
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(_n8n_url("batutynas-dashboard-v2"), params={"month": month})
                r.raise_for_status()
                cal_data = r.json()
            # Calendar Bridge stores event dates in UTC; Lithuanian events starting at
            # midnight EEST (UTC+3) appear as the *previous* UTC day.
            # Accept both the requested date and the day before to handle this offset.
            prev_date = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
            for b in cal_data.get("bookings", []):
                # Only include bookings matching the target date (or prev UTC-day)
                if b.get("event_date") not in (date, prev_date):
                    continue
                bid = b.get("id") or b.get("calendarEventId", "")
                if bid in seen_ids:
                    continue
                seen_ids.add(bid)
                # equipment may be a list of dicts [{name, icon, category}] or a string
                raw_equip = b.get("equipment") or b.get("raw_summary", "") or ""
                if isinstance(raw_equip, list):
                    equipment = ", ".join(e.get("name", "") for e in raw_equip if isinstance(e, dict) and e.get("name"))
                else:
                    equipment = str(raw_equip)
                raw_addons = b.get("addons", []) or []
                if isinstance(raw_addons, str):
                    addons = [a.strip() for a in raw_addons.split(",") if a.strip()]
                else:
                    addons = [str(a).strip() for a in raw_addons if a]
                total_units = _calculate_order_units(equipment, addons)
                result.append({
                    "orderId":   bid,
                    "name":      b.get("customer_name", "N/A"),
                    "phone":     b.get("customer_phone", ""),
                    "equipment": equipment,
                    "addons":    addons,
                    "units":     total_units,
                    "address":   b.get("delivery_address", ""),
                    "flowType":  "calendar",
                    "status":    b.get("status", "Confirmed"),
                    "source":    "calendar",
                })
        except Exception as e:
            logger.warning("Calendar Bridge fetch for route orders failed: %s", e)
            # Silently fall back to MongoDB-only results

    return {"orders": result, "date": date}


@api_router.post("/admin/route/validate-addresses")
async def validate_route_addresses(data: Dict[str, Any], x_admin_token: Optional[str] = Header(None)):
    """Validate a list of addresses using Google Maps Geocoding API.
    Returns formatted address + lat/lng for valid addresses.
    Falls back to Nominatim (OSM) if no GOOGLE_MAPS_API_KEY is set."""
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")
    addresses = data.get("addresses", [])
    results = []
    async with httpx.AsyncClient(timeout=10) as client:
        for addr in addresses:
            if not addr or not addr.strip():
                results.append({"original": addr, "valid": False, "error": "Tuščias adresas"})
                continue
            query = addr.strip()
            if "lietuva" not in query.lower() and "lithuania" not in query.lower():
                query += ", Lietuva"
            try:
                if GOOGLE_MAPS_API_KEY:
                    # Google Maps Geocoding API
                    resp = await client.get(
                        "https://maps.googleapis.com/maps/api/geocode/json",
                        params={"address": query, "key": GOOGLE_MAPS_API_KEY, "language": "lt"},
                    )
                    geo = resp.json()
                    if geo.get("status") == "OK" and geo.get("results"):
                        r = geo["results"][0]
                        results.append({
                            "original":  addr,
                            "formatted": r["formatted_address"],
                            "lat": r["geometry"]["location"]["lat"],
                            "lng": r["geometry"]["location"]["lng"],
                            "valid": True,
                        })
                    else:
                        results.append({"original": addr, "valid": False, "error": geo.get("status", "NOT_FOUND")})
                else:
                    # Fallback: Nominatim (OSM) – no API key required
                    resp = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={"q": query, "format": "json", "limit": 1, "countrycodes": "lt"},
                        headers={"User-Agent": "batutynas-route-planner/1.0"},
                    )
                    hits = resp.json()
                    if hits:
                        h = hits[0]
                        results.append({
                            "original":  addr,
                            "formatted": h.get("display_name", addr),
                            "lat": float(h["lat"]),
                            "lng": float(h["lon"]),
                            "valid": True,
                        })
                    else:
                        results.append({"original": addr, "valid": False, "error": "NOT_FOUND"})
            except Exception as exc:
                results.append({"original": addr, "valid": False, "error": str(exc)[:120]})
    return {"results": results}


@api_router.post("/admin/route/optimize")
async def optimize_route(data: Dict[str, Any], x_admin_token: Optional[str] = Header(None)):
    """Optimize stop order using Google Maps Directions API with waypoint optimization.
    Returns optimized_order (index array), total_distance_km, total_duration_min."""
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")
    addresses = data.get("addresses", [])  # already-validated formatted addresses
    origin    = data.get("origin", "Pagramantis, Lietuva")
    if not origin.lower().endswith("lietuva") and not origin.lower().endswith("lithuania"):
        origin += ", Lietuva"
    if len(addresses) < 2:
        return {"optimized_order": list(range(len(addresses))), "total_distance_km": 0, "total_duration_min": 0}
    if not GOOGLE_MAPS_API_KEY:
        return {"optimized_order": list(range(len(addresses))), "error": "GOOGLE_MAPS_API_KEY not set", "total_distance_km": 0, "total_duration_min": 0}
    waypoints_str = "optimize:true|" + "|".join(addresses)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params={
                    "origin":      origin,
                    "destination": origin,   # round trip back to base
                    "waypoints":   waypoints_str,
                    "mode":        "driving",
                    "key":         GOOGLE_MAPS_API_KEY,
                    "language":    "lt",
                },
            )
            result = resp.json()
        if result.get("status") == "OK" and result.get("routes"):
            route = result["routes"][0]
            order = route.get("waypoint_order", list(range(len(addresses))))
            legs  = route["legs"]
            total_dist = round(sum(leg["distance"]["value"] for leg in legs) / 1000, 1)
            total_time = sum(leg["duration"]["value"] for leg in legs) // 60
            return {
                "optimized_order":    order,
                "total_distance_km":  total_dist,
                "total_duration_min": total_time,
                "legs": [{"from": leg["start_address"], "to": leg["end_address"],
                          "dist": leg["distance"]["text"], "time": leg["duration"]["text"]} for leg in legs],
            }
        return {"optimized_order": list(range(len(addresses))), "error": result.get("status"), "total_distance_km": 0, "total_duration_min": 0}
    except Exception as exc:
        logger.error("Route optimize error: %s", exc)
        return {"optimized_order": list(range(len(addresses))), "error": str(exc), "total_distance_km": 0, "total_duration_min": 0}


# ── Multi-vehicle route optimization (two-segment logic) ─────────────────────
# Route: Pagramantis → [delivery stops] → wait in Tauragė → [pickup stops] → Pagramantis

async def _optimize_segment(
    client: httpx.AsyncClient,
    seg_origin: str,
    seg_destination: str,
    stops: list,
) -> dict:
    """Optimize a single route segment: seg_origin → stops → seg_destination.

    Uses Google Directions API with waypoint optimization.
    Returns optimized_order, km, min, legs, ordered_addresses.
    """
    if not stops:
        return {"optimized_order": [], "km": 0, "min": 0, "legs": [], "ordered_addresses": []}

    addresses = [s.get("formattedAddress") or s.get("address", "") for s in stops]

    if not GOOGLE_MAPS_API_KEY:
        return {
            "optimized_order": list(range(len(stops))),
            "km": 0, "min": 0, "legs": [],
            "ordered_addresses": addresses,
            "error": "No GOOGLE_MAPS_API_KEY",
        }

    waypoints_param = ("optimize:true|" + "|".join(addresses)) if len(stops) > 1 else addresses[0]

    try:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/directions/json",
            params={
                "origin":      seg_origin,
                "destination": seg_destination,
                "waypoints":   waypoints_param,
                "mode":        "driving",
                "key":         GOOGLE_MAPS_API_KEY,
                "language":    "lt",
            },
        )
        result = resp.json()
        if result.get("status") == "OK" and result.get("routes"):
            route = result["routes"][0]
            order = route.get("waypoint_order", list(range(len(addresses))))
            legs  = route["legs"]
            km    = round(sum(leg["distance"]["value"] for leg in legs) / 1000, 1)
            min_  = sum(leg["duration"]["value"] for leg in legs) // 60
            ordered = [addresses[i] for i in order] if len(order) == len(addresses) else addresses

            # ── Final-check: estimate savings vs. sequential (unoptimized) order ──
            savings_est = 0.0
            if len(stops) > 1:
                try:
                    orig_hav = _seq_haversine_km(stops)
                    opt_stops = [stops[i] for i in order] if len(order) == len(stops) else stops
                    opt_hav  = _seq_haversine_km(opt_stops)
                    savings_est = max(0.0, round(orig_hav - opt_hav, 1))
                except Exception:
                    pass

            return {
                "optimized_order":      order,
                "km": km, "min": min_,
                "ordered_addresses":    ordered,
                "savings_km_estimate":  savings_est,
                "legs": [
                    {"from": leg["start_address"], "to": leg["end_address"],
                     "dist": leg["distance"]["text"], "time": leg["duration"]["text"]}
                    for leg in legs
                ],
            }
        return {
            "optimized_order": list(range(len(addresses))),
            "km": 0, "min": 0, "legs": [], "ordered_addresses": addresses,
            "savings_km_estimate": 0.0,
            "error": result.get("status"),
        }
    except Exception as exc:
        logger.error("Segment optimize error: %s", exc)
        return {
            "optimized_order": list(range(len(addresses))),
            "km": 0, "min": 0, "legs": [], "ordered_addresses": addresses,
            "savings_km_estimate": 0.0,
            "error": str(exc)[:120],
        }


def _ensure_lietuva(loc: str) -> str:
    """Append ', Lietuva' if not already present."""
    loc_lower = loc.strip().lower()
    return loc.strip() if ("lietuva" in loc_lower or "lithuania" in loc_lower) else loc.strip() + ", Lietuva"


# ── Route efficiency helpers ───────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Straight-line distance between two lat/lng points in km (Haversine formula)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _seq_haversine_km(stops: list) -> float:
    """Total straight-line distance visiting stops in given order (Haversine)."""
    total = 0.0
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i + 1]
        la, lo = a.get("lat"), a.get("lng")
        lb, lo2 = b.get("lat"), b.get("lng")
        if la is not None and lo is not None and lb is not None and lo2 is not None:
            total += _haversine_km(float(la), float(lo), float(lb), float(lo2))
    return round(total, 1)


async def _optimize_vehicle_route(
    client: httpx.AsyncClient,
    origin: str,
    vstops: list,
    vehicle: dict,
    wait_location: str = "Tauragė",
) -> dict:
    """Two-segment route for one vehicle.

    Segment A (morning): origin → delivery stops → wait_location
    Segment B (evening): wait_location → pickup stops  → origin

    Returns combined stats + per-segment details.
    """
    cap = int(vehicle.get("capacity", 4))

    # Capacity used
    total_units = 0
    for s in vstops:
        u = s.get("units", 1)
        if u == "full":
            total_units = cap
        else:
            try:
                total_units += int(u)
            except (TypeError, ValueError):
                total_units += 1

    base = {"capacity_used": total_units, "capacity_max": cap}

    if not vstops:
        return {**base, "km": 0, "min": 0, "delivery_km": 0, "delivery_min": 0,
                "pickup_km": 0, "pickup_min": 0, "delivery_order": [], "pickup_order": [],
                "delivery_addresses": [], "pickup_addresses": [], "legs": []}

    wait_loc = _ensure_lietuva(wait_location)

    delivery_stops = [s for s in vstops if s.get("type", "delivery") == "delivery"]
    pickup_stops   = [s for s in vstops if s.get("type", "delivery") != "delivery"]

    # Segment A: Pagramantis → deliveries → Tauragė
    del_result = await _optimize_segment(client, origin, wait_loc, delivery_stops) \
        if delivery_stops else {"optimized_order": [], "km": 0, "min": 0, "legs": [], "ordered_addresses": []}

    # Segment B: Tauragė → pickups → Pagramantis
    pick_result = await _optimize_segment(client, wait_loc, origin, pickup_stops) \
        if pickup_stops else {"optimized_order": [], "km": 0, "min": 0, "legs": [], "ordered_addresses": []}

    total_km  = round(del_result["km"] + pick_result["km"], 1)
    total_min = del_result["min"] + pick_result["min"]
    total_savings = round(
        del_result.get("savings_km_estimate", 0.0) + pick_result.get("savings_km_estimate", 0.0), 1
    )

    return {
        **base,
        "km":   total_km,
        "min":  total_min,
        "savings_km_estimate": total_savings,
        # Delivery segment
        "delivery_km":        del_result["km"],
        "delivery_min":       del_result["min"],
        "delivery_order":     del_result["optimized_order"],
        "delivery_addresses": del_result["ordered_addresses"],
        # Pickup segment
        "pickup_km":          pick_result["km"],
        "pickup_min":         pick_result["min"],
        "pickup_order":       pick_result["optimized_order"],
        "pickup_addresses":   pick_result["ordered_addresses"],
        # Combined legs (A + B)
        "legs":               del_result["legs"] + pick_result["legs"],
    }


@api_router.post("/admin/route/optimize-multi")
async def optimize_route_multi(data: Dict[str, Any], x_admin_token: Optional[str] = Header(None)):
    """Multi-vehicle bin-packing + two-segment route optimization.

    Route per vehicle:
      Morning:  origin → delivery stops → wait_location (wait in Tauragė)
      Evening:  wait_location → pickup stops → origin (return to Pagramantis)

    Input:
    {
      "origin":        "Pagramantis, Lietuva",
      "wait_location": "Tauragė",            // where employee waits (default Tauragė)
      "vehicles":      [{"id": "v1", "name": "Auto 1", "capacity": 3}],
      "stops":         [{"id": "s1", "equipment": "...", "units": "full"|1,
                         "formattedAddress": "...", "type": "delivery"|"pickup"}],
      "auto_assign":   true,
      "assignments":   {"v1": ["s1"]}         // used when auto_assign=false
    }
    """
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")

    origin        = _ensure_lietuva(data.get("origin", "Pagramantis"))
    wait_location = data.get("wait_location", "Tauragė")
    vehicles      = data.get("vehicles", [])
    stops         = data.get("stops", [])
    auto_assign   = data.get("auto_assign", True)
    manual_assign = data.get("assignments", {})

    if not vehicles:
        return {"assignments": {}, "unassigned_stop_ids": [s["id"] for s in stops],
                "vehicle_routes": {}, "total_km": 0, "total_min": 0}

    # ── Bin packing ───────────────────────────────────────────────────────────
    # Pack only delivery stops first, then auto-assign pickups to same vehicle
    delivery_stops = [s for s in stops if s.get("type", "delivery") == "delivery"]
    pickup_stops   = [s for s in stops if s.get("type", "delivery") != "delivery"]

    if auto_assign:
        # Clarke-Wright (geo-aware, minimises total km) when coordinates are available.
        # Falls back to greedy bin-packing (FFD) when stops lack lat/lng or CW unavailable.
        # Note: frontend now handles assignment and sends auto_assign=false; this path
        # is a backend-only fallback (e.g. direct API calls).
        if _HAS_CW and _has_coords(delivery_stops):
            assignments, unassigned_ids = _cw_assign(delivery_stops, vehicles)
        else:
            assignments, unassigned_ids = _bin_pack(delivery_stops, vehicles)

        # Auto-assign pickup stops to the same vehicle as their delivery counterpart
        # Match by address (pickup has same formattedAddress as its delivery)
        addr_to_vehicle: Dict[str, str] = {}
        for vid, sids in assignments.items():
            for sid in sids:
                s = next((x for x in delivery_stops if x["id"] == sid), None)
                if s:
                    addr = (s.get("formattedAddress") or s.get("address", "")).strip().lower()
                    if addr:
                        addr_to_vehicle[addr] = vid

        pickup_unassigned = []
        for ps in pickup_stops:
            addr = (ps.get("formattedAddress") or ps.get("address", "")).strip().lower()
            target_vid = addr_to_vehicle.get(addr)
            if target_vid and target_vid in assignments:
                assignments[target_vid].append(ps["id"])
            elif vehicles:
                # Fallback: assign to first vehicle
                assignments[vehicles[0]["id"]].append(ps["id"])
            else:
                pickup_unassigned.append(ps["id"])
        unassigned_ids.extend(pickup_unassigned)
    else:
        assignments    = {v["id"]: list(manual_assign.get(v["id"], [])) for v in vehicles}
        assigned_set   = {sid for ids in assignments.values() for sid in ids}
        unassigned_ids = [s["id"] for s in stops if s["id"] not in assigned_set]

    # ── Per-vehicle route optimization (parallel) ────────────────────────────
    stop_index = {s["id"]: s for s in stops}

    async with httpx.AsyncClient(timeout=25) as client:
        tasks = [
            _optimize_vehicle_route(
                client, origin,
                [stop_index[sid] for sid in assignments.get(v["id"], []) if sid in stop_index],
                v,
                wait_location,
            )
            for v in vehicles
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    vehicle_routes: Dict[str, Any] = {}
    total_km  = 0.0
    total_min = 0
    total_savings = 0.0
    for i, v in enumerate(vehicles):
        vid = v["id"]
        r   = results[i]
        if isinstance(r, Exception):
            logger.error("Vehicle route error %s: %s", vid, r)
            vehicle_routes[vid] = {
                "km": 0, "min": 0,
                "delivery_km": 0, "delivery_min": 0, "delivery_order": [], "delivery_addresses": [],
                "pickup_km": 0, "pickup_min": 0, "pickup_order": [], "pickup_addresses": [],
                "capacity_used": 0, "capacity_max": v.get("capacity", 4), "legs": [],
                "savings_km_estimate": 0.0,
                "error": str(r),
            }
        else:
            vehicle_routes[vid] = r
            total_km    += r.get("km", 0)
            total_min   += r.get("min", 0)
            total_savings += r.get("savings_km_estimate", 0.0)

    return {
        "assignments":              assignments,
        "unassigned_stop_ids":      unassigned_ids,
        "vehicle_routes":           vehicle_routes,
        "total_km":                 round(total_km, 1),
        "total_min":                total_min,
        "total_savings_km_estimate": round(total_savings, 1),
    }


# ── Route plan storage (MongoDB) ──────────────────────────────────────────────

@api_router.post("/admin/route/save")
async def save_route_plan(data: Dict[str, Any], x_admin_token: Optional[str] = Header(None)):
    """Save an optimized route plan for a date. Overwrites any existing plan for that date."""
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")
    plan_date = data.get("date", "")
    if not plan_date:
        raise HTTPException(400, "date is required")
    plan = {
        "date":          plan_date,
        "vehicles":      data.get("vehicles", []),
        "stops":         data.get("stops", []),
        "total_km":      data.get("total_km", 0),
        "total_min":     data.get("total_min", 0),
        "google_maps_urls": data.get("google_maps_urls", {}),
        "saved_at":      datetime.now(timezone.utc).isoformat(),
    }
    await db.route_plans.update_one(
        {"date": plan_date},
        {"$set": plan},
        upsert=True,
    )
    return {"success": True, "date": plan_date}


@api_router.get("/admin/route/planned/{date}")
async def get_route_plan(date: str, x_admin_token: Optional[str] = Header(None)):
    """Retrieve a saved route plan for a specific date."""
    if not _verify_admin_token(x_admin_token or ''):
        raise HTTPException(401, "Neprisijungęs")
    plan = await db.route_plans.find_one({"date": date}, {"_id": 0})
    if not plan:
        return {"found": False, "date": date}
    return {"found": True, **plan}


# ── App setup ─────────────────────────────────────────────────────────────────

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
