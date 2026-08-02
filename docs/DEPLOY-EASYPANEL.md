# Batutynas Chatbot — Diegimas ant EasyPanel VPS

## Serveris
- **Hostinger KVM 1** — 4GB RAM, 1 vCPU, 50GB NVMe
- **EasyPanel** (Docker) — jau veikia n8n ir Chatwoot
- **n8n URL**: https://n8n-n8n.0uvai5.easypanel.host

## RAM biudžetas (po diegimo)
| Servisas | RAM |
|----------|-----|
| EasyPanel | ~200MB |
| PostgreSQL (Chatwoot) | ~400MB |
| Redis (Chatwoot) | ~100MB |
| Chatwoot | ~600MB |
| n8n | ~400MB |
| **MongoDB (naujas)** | **~300MB** |
| **FastAPI backend (naujas)** | **~150MB** |
| **nginx frontend (naujas)** | **~50MB** |
| **Viso** | **~2.2GB / 4GB** |

---

## 1. Paruošti kodą serveryje

```bash
# Prisijungti per SSH
ssh root@<VPS-IP>

# Klonuoti repozitoriją
git clone https://github.com/vortand2/batutynas-chatbot.git /opt/batutynas
cd /opt/batutynas

# Sukurti .env (nukopijuoti iš lokalo arba užpildyti rankiniu būdu)
cp .env.example .env
nano .env
```

### .env reikšmės (iš Obsidian credentials):
```env
DOMAIN=https://batutynas.lt
DB_NAME=batutynas_db
CORS_ORIGINS=https://batutynas.lt,https://www.batutynas.lt
OWNER_EMAIL=dovydasdobrovolskis@gmail.com
RESEND_API_KEY=                    # iš resend.com (nemokamas planas)
GEMINI_API_KEY=<iš Obsidian>       # naujausias raktas
N8N_BASE_URL=https://n8n-n8n.0uvai5.easypanel.host
N8N_WEBHOOK_URL=https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-booking-notify
CALENDAR_BRIDGE_URL=https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-availability
ADMIN_PASSWORD=<saugus slaptažodis>
N8N_SYNC_SECRET=<N8N_SYNC_SECRET>
BRIDGE_SECRET=<turi sutapti su n8n 'Batutynas Bridge Auth' kredencialu>
```

---

## 2. Paleisti Docker Compose

```bash
cd /opt/batutynas
docker compose up -d --build
```

Build užtruks ~3 min (pirmas kartas). Po to:

```bash
# Patikrinti ar visi 3 servisai veikia
docker compose ps
# Turėtumėte matyti: mongo, backend, frontend — visi "Up"

# Žiūrėti logus
docker compose logs -f backend    # FastAPI klaidos
docker compose logs -f frontend   # nginx klaidos
```

---

## 3. Cloudflare DNS

Kadangi domenas `batutynas.lt` jau naudojamas per Cloudflare (arba Hostinger):

**Variantas A — Subdomain (rekomenduojama pradžiai):**
1. Cloudflare → DNS → pridėti A įrašą:
   - Type: `A`
   - Name: `chat` (arba `app`)
   - IPv4: `<VPS IP adresas>`
   - Proxy: **oranžinis debesis**
2. Cloudflare → SSL/TLS → **Full**
3. Chatbot bus pasiekiamas: `https://chat.batutynas.lt`
4. Atitinkamai pakeisti `DOMAIN` ir `CORS_ORIGINS` `.env` faile

**Variantas B — Tiesiogiai `batutynas.lt`:**
1. Jei `batutynas.lt` A record jau rodo į šį VPS — nieko keisti nereikia
2. Jei rodo į Hostinger — reikia pakeisti į VPS IP
3. **Dėmesio:** tai paveiks esamą svetainę!

---

## 4. Patikrinti

```bash
# API veikia?
curl https://chat.batutynas.lt/api/
# → {"message":"Batutynas API veikia"}

# Admin prisijungimas
curl -X POST https://chat.batutynas.lt/api/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_PASSWORD>"}'
# → {"token":"...","day":"2026-03-31"}

# n8n sync webhook
curl -X POST https://chat.batutynas.lt/api/webhook/n8n-sync \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: <N8N_SYNC_SECRET>" \
  -d '{"orderId":"test","status":"confirmed","source":"test"}'
# → {"success":false,"order_id":"test","matched":0} (normalu — "test" neegzistuoja)
```

---

## 5. Hostinger embed atnaujinimas

Pakeisti esamą embed kodą Hostinger svetainėje:

```html
<!-- SENAS (GitHub Pages widget) — pašalinti -->
<!-- <script src="https://vortand2.github.io/batutynas-chatbot/chat-widget/chat-widget.js" defer></script> -->

<!-- NAUJAS (jūsų serveris) -->
<script src="https://chat.batutynas.lt/embed.js" defer></script>
```

**Kur:** Hostinger → Website → Edit Website → Settings → Custom HTML → Before `</body>` tag

---

## 6. Atnaujinimas

```bash
cd /opt/batutynas
git pull origin master
docker compose up -d --build
```

MongoDB duomenys saugomi Docker volume `mongo_data` — išlieka po visų atnaujinimų.

---

## 7. Atsarginė kopija

```bash
# Vienkartinė
bash /opt/batutynas/scripts/backup.sh

# Automatinė naktinė (cron)
crontab -e
# Pridėti:
0 2 * * * /opt/batutynas/scripts/backup.sh >> /opt/batutynas/backups/backup.log 2>&1
```

---

## Problemų sprendimas

### Port 80 užimtas
```bash
sudo lsof -i :80
# Jei EasyPanel naudoja 80 portą, pakeisti docker-compose.yml:
# ports: "8080:80"  # ir atitinkamai Cloudflare proxy
```

### MongoDB nepasiekiamas
```bash
docker compose logs mongo
# Patikrinti ar volume egzistuoja:
docker volume ls | grep mongo
```

### Frontend build klaidos
```bash
docker compose logs frontend
# Dažna priežastis: yarn.lock trūksta arba pasenęs
# Sprendimas: Docker Dockerfile jau naudoja --no-frozen-lockfile
```
