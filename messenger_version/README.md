# Batutynas – Facebook Messenger Bot

Ši versija yra tiesioginė web chatboto adaptacija **Facebook Messenger** platformai.
Naudoja tuos pačius srautus, MongoDB ir logika – tik perduoda žinutes per Messenger API.

---

## Kaip veikia

1. Naudotojas rašo į Batutynas Facebook puslapį
2. Facebook siunčia žinutę į šio serverio webhook
3. Serveris apdoroja žinutę pagal srautą ir atsako per Graph API
4. Naudotojas gauna atsakymą tiesiai Messenger lange

---

## Reikalavimai

- Python 3.11+
- MongoDB (tas pats kaip pagrindinis projektas)
- Facebook Developer paskyra

---

## Žingsnis po žingsnio: Setup

### 1. Facebook App kūrimas

1. Eikite į [developers.facebook.com](https://developers.facebook.com)
2. Sukurkite naują App → pasirinkite **Business**
3. Pridėkite **Messenger** produktą
4. Sukurkite arba pasirinkite Facebook puslapį (Batutynas puslapį)
5. Sugeneruokite **Page Access Token** (Messenger → Settings → Access Tokens)

### 2. Konfigūracija

Nukopijuokite `.env.example` į `.env`:

```bash
cp .env.example .env
```

Užpildykite:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=batutynas
FB_PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxx   ← iš Facebook Developer Console
FB_VERIFY_TOKEN=koks_nors_slaptazodis     ← sugalvokite bet ką
```

### 3. Paleidimas

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8002
```

### 4. Webhook registravimas (reikia viešo URL)

Rekomenduojama: [ngrok](https://ngrok.com) arba deploy į Emergent/Railway/Render.

```bash
# Lokaliam testui:
ngrok http 8002
```

Facebook Developer Console → Messenger → Webhooks:
- **Callback URL**: `https://your-domain.com/messenger/webhook`
- **Verify Token**: tas pats kaip `.env` faile
- **Subscriptions**: `messages`, `messaging_postbacks`

Spauskite **Verify and Save**.

### 5. Get Started mygtuko konfigūracija

```bash
curl -X POST "https://graph.facebook.com/v19.0/me/messenger_profile" \
  -H "Content-Type: application/json" \
  -d '{
    "get_started": {"payload": "GET_STARTED"},
    "greeting": [{"locale": "default", "text": "Sveiki! Esu Batutynas batutų asistentas."}]
  }' \
  "?access_token=YOUR_PAGE_ACCESS_TOKEN"
```

---

## Srautų palyginimas: Web vs Messenger

| Funkcija             | Web chatbot         | Messenger bot         |
|----------------------|---------------------|-----------------------|
| Batutų pasirinkimas  | Vizualios kortelės  | Quick replies (9 vnt) |
| Datos pasirinkimas   | Kalendarinis picker | Laisvas tekstas       |
| Priedai              | Čekboxai            | Quick replies         |
| Confetti animacija   | Taip                | Ne (tekstas)          |
| Progreso juosta      | Taip                | Ne (tekstas)          |
| AI (Gemini)          | Taip                | Lengvai pridedama     |

---

## Duomenų bazė

Užsakymai saugomi MongoDB toje pačioje `orders` kolekcijoje su `"source": "facebook_messenger"` lauku – galima atskirti nuo web užsakymų.

---

## Pridėti Gemini AI

Norint pridėti Gemini atsakymus laisviems klausimams:

```python
# Įdėti į server.py
from emergentintegrations.llm.chat import LlmChat, UserMessage

async def ask_gemini(text: str) -> str:
    chat = LlmChat(api_key=os.environ["GEMINI_API_KEY"],
                   session_id="messenger-general",
                   system_message="Tu esi Batutynas batutų nuomos asistentas. Atsakyk lietuviškai.")
    resp = await chat.send_message(UserMessage(content=text))
    return resp.content
```

---

## Palaikymas

Klausimai: info@batutynas.lt | +37068558996
