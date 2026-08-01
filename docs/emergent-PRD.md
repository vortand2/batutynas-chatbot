# Batutynas Chatbot - PRD

## Sukurta: 2026-02-01

## Apibūdinimas
Pokalbių roboto valdiklis (widget) batutų nuomos ir pardavimo įmonei "Batutynas" Lietuvoje. Įterptas kaip slankus mygtukas apatiniame dešiniame puslapio kampe.

## Architektūra
- **Frontend**: React + Tailwind CSS, violetinė tema (violet-600), animacijos CSS keyframes
- **Backend**: FastAPI + MongoDB (motor async)
- **El. paštas**: Resend API (veikia kai nustatytas RESEND_API_KEY)
- **Duomenų bazė**: MongoDB - kolekcijos: `orders`, `escalations`

## Įgyvendinta

### 5 Srautai (visi veikia):
1. **Vaiko gimtadienis** (`birthday`) - Vardas, telefonas, data, vieta, vaiko amžius
2. **Įmonės renginys** (`company`) - Įmonės pavadinimas, kontaktinis asmuo, tel., data, dalyviai, vieta
3. **Šventės nuoma** (`party`) - Vardas, tel., data, vieta, batuto dydis (dropdown)
4. **Batuto pirkimas** (`purchase`) - Vardas, tel., batuto dydis (dropdown), pristatymo adresas
5. **DUK ir kontaktai** (`faq`) - 6 DUK accordion, kontaktai, eskalacijos mygtukas

### Eskalacija (Human-in-the-loop):
- Mygtukas "Kalbėti su žmogumi" DUK skiltyje
- Forma: Vardas, kontaktas, žinutė
- Siunčia el. laišką į dovydasdobrovolskis@gmail.com

### API Endpoints:
- `POST /api/orders` - Išsaugo užsakymą + siunčia el. laišką savininkui
- `POST /api/escalation` - Išsaugo eskalaciją + siunčia el. laišką
- `GET /api/orders` - Gauti visus užsakymus
- `GET /api/escalations` - Gauti visas eskalacijas

### Funkcijos:
- Tiekiamos lietuviškos etiketės ir tekstas
- Atsakingas dizainas (mobile-friendly)
- Grįžti į pradžią mygtukas po pateikimo
- Neskaitytos žinutės indikatorius (geltona taškas)
- Žalia online statuso lemputė antraštėje
- CSS animacijos: widget atvėrimas, žinutės atsiradimas, pulsavimas

## Konfigūracija
```
OWNER_EMAIL=dovydasdobrovolskis@gmail.com
RESEND_API_KEY=<reikia nustatyti iš resend.com>
```

## P0 - Atlikta
- [x] Visi 5 srautai su batutų pasirinkimu ir priedais
- [x] **Gemini 2.5 Flash AI** – laisvo teksto klausimai lietuviškai, suvokia pokalbio kontekstą
- [x] AI atsako tik lietuviškai, nukreipia į srautus kai reikia rezervuoti
- [x] Mobilus dizainas – 82vh bottom sheet, deškinė pusė lango pusė darbalaukyje
- [x] Animuotas rašymo indikatorius (3 šokinėjantys taškai)
- [x] **n8n webhook** palaikymas (N8N_WEBHOOK_URL konfigūruojamas .env)
- [x] MongoDB išsaugojimas, el. pašto pranešimai (Resend)
- [x] **Mobilaus UI/UX auditas ir taisymai** (2026-03-31):
  - Header mygtukai 44px (buvo 36/40px) – tinkamas lietimo plotas
  - Input juosta `pb-14 sm:pb-4` – nebeblokuojama Emergent banner'io
  - `h-[82dvh]` – dinaminis klaviatūros fix'as (keyboard nebeuždengia input)
  - Status tekstas sutrumpintas, nebeslenka į 2 eilutes
- [x] **Progreso juosta (StepBar)** – rodoma po header'io kiekvienoje fazėje: Batutas → Priedai → Forma → Patvirtinta
- [x] **Date picker patobulinta v2**: Shadcn Calendar su violetine antrašte, užimtų datų indikatorius, `/api/availability` endpoint (2026-03-31)
- [x] **Feature 5 – Slide animacija**: `slideInRight` kiekvienam srautų žingsniui (trampoline/addons/form/faq)
- [x] **Feature 7 – Skeleton loading**: `ImgSkeleton` shimmer batutų kortelėms ir modalams
- [x] **Feature 10 (scope)** – `DISCOUNT_BANNER = null` konstanta viršuje – pakeisti į string, kai norite rodyti akcijų juostą
- [x] **Availability API** – `GET /api/availability?batutas=X&month=YYYY-MM` – grąžina užimtas datas; calendar jas automatiškai išjungia
- [x] **Batuto detalių modal** – informacijos (ℹ) mygtukas ant kiekvienos kortelės, atidaro pilną vaizdą su aprašymu
- [x] **Confetti animacija** – spalvoti konfeti 2.5s po sėkmingo užsakymo pateikimo
- [x] **Keyboard fix** – `dvh` vienetai automatiškai keičia aukštį kai atsidaro klaviatūra
- [x] **El. paštas pirkimo formoje** – katalogas siunčiamas el. paštu (2026-03-31)
- [x] **„Kalbėti su žmogumi" pagrindiniame meniu** – 6-as mygtukas, raudonas, tiesiogiai atidaro eskalacijos formą (2026-03-31)
- [x] **Įmonės pavadinimas tik įmonės sraute** – patvirtinta, kad kituose srautuose jo nėra
  - Gimtadienis: Pilis + žaidimų centrai + dviejų dalių + kliūčių ruožai
  - Įmonės renginys: Fantazijų parkas + Džiumandži parkas + visi (be Pilis)
  - Šventė: žaidimų centrai + dviejų dalių + kliūčių ruožai (be Pilis, be didžiųjų parkų)
- [x] **Sumažintas widget dydis**: darbalaukis 400×540px, mobilusis 82vh (buvo 480×640 / 92vh)

## Papildoma įgyvendinta

## Admin Dashboard `/admin` (2026-02):
- **Slaptažodžio apsauga**: login ekranas, SHA256 dienos raktas, `ADMIN_PASSWORD=<ADMIN_PASSWORD>` `.env`
- **Laukiančios tab**: rodo chatbot užsakymus su statusu `pending` iš MongoDB
- **Patvirtinti → Kalendorių**: savininkas peržiūri → patikslina duomenis → `batutynas-calendar-create` sukuria Google Calendar įvykį
- **Atmesti**: pakeičia statusą į `rejected`
- Atsijungimo mygtukas, „Kaip veikia srautas" instrukcijos
- Pilnas valdymo panelės puslapis React aplikacijoje `/admin` maršrute
- Statistikos kortelės: Šiandien, Savaitės pajamos, Mėnesio, Laisva įranga
- Mėnesio kalendorius su spalvotais rezervacijų taškais, dienų detalių panelis
- Kurti/redaguoti/ištrinti rezervaciją (kviečia `batutynas-calendar-create/update/delete`)
- Įrangos būsenos lentelė, artimiausių laisvų datų paieška (`batutynas-next-free`)
- Backend proxy: `/api/admin/dashboard`, `/api/admin/next-free`, `/api/admin/booking/*`

### n8n pilna integracija (.env 2026-02):
- `N8N_BASE_URL` = `https://n8n-n8n.0uvai5.easypanel.host`
- `N8N_WEBHOOK_URL` = `batutynas-booking-notify` (tinkamas užsakymų formatas)
- `CALENDAR_BRIDGE_URL` = `batutynas-availability` (aktyvus)

### Availability API adapteris (2026-02):
- `CALENDAR_BRIDGE_URL` kintamasis — aktyvus, proxy prie n8n
- Lygiagretiems GET užklausoms kiekvienai mėnesio dienai (`asyncio.gather`)
- Lankstus atsakymo parseris, `source` laukas atsakyme

### Adresų laukų etiketės (2026-02):
- Gimtadienis/įmonė/šventė: `Miestas / vieta` → `Pilnas adresas`

## Diegimas (Self-hosting, 2026-02)
- [x] `docker-compose.yml` – MongoDB + FastAPI + nginx React (3 servisai)
- [x] `backend/Dockerfile` + `requirements.prod.txt` (minimali priklausomybių rinkinys)
- [x] `frontend/Dockerfile` (multi-stage: node build → nginx serve)
- [x] `frontend/nginx.conf` – `/api/*` proxy į backend, SPA fallback, gzip, cache
- [x] `.env.example` – visi aplinkos kintamieji su komentarais lietuviškai
- [x] `DEPLOY.md` – detalus diegimo vadovas (VPS + Cloudflare SSL)
- [x] `README.md` – visas vadovas vienoje vietoje GitHub'ui (diegimas, n8n, Telegram, Hostinger, backup)
- [x] `n8n_workflows.json` – 7 workflow'ai su pilnomis instrukcijomis ir n8n node konfigūracija
- [x] `scripts/backup.sh` – naktinė MongoDB atsarginė kopija (automatinė per cron, 30 dienų rotacija)
- [x] `scripts/restore.sh` – atkūrimo skriptas
- [x] **`emergentintegrations` pakeistas `google-genai`** – `server.py` dabar visiškai nepriklausomas nuo Emergent

## P1 - Backlog
- [ ] Resend API raktas (naudotojas turi sukurti sąskaitą resend.com)
- [ ] Batutynas.lt logotipas widget antraštėje
- [ ] Kainų sąrašas formos pasirinkimuose
- [ ] Administratoriaus panelė užsakymams peržiūrėti
- [ ] SMS pranešimas savininkui (Twilio)

## P2 - Idėjos
- [ ] Kelių kalbų palaikymas (EN/LT)
- [ ] Batuto prieinamumo kalendorius
- [ ] Išmanios rekomendacijos pagal renginį
