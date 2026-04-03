from fastapi import FastAPI, APIRouter, Header, HTTPException, Body, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import hashlib
import resend
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
import uuid
from datetime import datetime, timezone
from google import genai as _genai
from google.genai import types as _gtypes

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
N8N_BASE_URL         = os.environ.get('N8N_BASE_URL', '')
N8N_WEBHOOK_URL      = os.environ.get('N8N_WEBHOOK_URL', '')
CALENDAR_BRIDGE_URL  = os.environ.get('CALENDAR_BRIDGE_URL', '')
ADMIN_PASSWORD       = os.environ.get('ADMIN_PASSWORD', '')
N8N_SYNC_SECRET      = os.environ.get('N8N_SYNC_SECRET', '')   # shared secret for /webhook/n8n-sync

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
        logger.warning("RESEND_API_KEY not set – skipping email"); return
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
            "requestType": "catalog" if is_purchase else "booking",
            "orderId":   order.id,
            "flowType":  order.flow_type,
            "name":      fd.get('vardas') or fd.get('kontaktinis', 'Nenurodyta'),
            "phone":     fd.get('telefonas', ''),
            "email":     fd.get('epastas', ''),
            "address":   fd.get('vieta') or fd.get('adresas', ''),
            "equipment": fd.get('batutas', ''),
            "addons":    fd.get('priedai', ''),
            "date":      fd.get('data', ''),
            "guests":    fd.get('vaikuSkaicius') or fd.get('sveciumSkaicius') or fd.get('dalyviai', ''),
            "company":   fd.get('imonesP', ''),
            "createdAt": order.created_at,
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
        return {"bookings": [], "stats": {}, "equipment": [], "source": "no_n8n"}
    try:
        params = {"month": month} if month else {}
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(_n8n_url("batutynas-dashboard-v2"), params=params)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.error("admin_dashboard proxy error: %s", e)
        return {"bookings": [], "stats": {}, "equipment": [], "error": str(e)}


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


@api_router.post("/admin/booking/create")
async def admin_booking_create(body: Dict[str, Any], _=Depends(require_admin)):
    if not N8N_BASE_URL:
        raise HTTPException(503, "N8N_BASE_URL not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(_n8n_url("batutynas-calendar-create"), json=body)
            r.raise_for_status()
            try:
                return r.json()
            except Exception:
                return {"success": True, "status": r.status_code}
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
            try:
                return r.json()
            except Exception:
                return {"success": True, "status": r.status_code}
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
            try:
                return r.json()
            except Exception:
                return {"success": True, "status": r.status_code}
    except Exception as e:
        logger.error("admin_booking_delete proxy error: %s", e)
        raise HTTPException(502, str(e))


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
