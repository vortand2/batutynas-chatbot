# Batutynas — savininko vadovas

Kasdienis sistemos naudojimas. Viskas, ko reikia, kad gerai dirbtum kiekvieną dieną. Be technikos.

---

## Ką sistema daro už tave

- **Kas rytą 07:00** — gauni į Telegram ryto apžvalgą: šiandienos ir rytojaus užsakymai + Tauragės orai + mėnesio skaičiai.
- **Kas vakarą 21:00** — vakaro apžvalga: dienos rezultatai, artimiausios 3 dienos, rytojaus orai.
- **Google Tasks** — kai įsirašai užsakymą į "Batutynas Tauragė" sąrašą, per 10 min. jis pasirodo dashboard'e.
- **Svetainės chatbot'as** — kalbasi su klientais, paruošia užklausas, atsiunčia tau į Telegram su mygtukais "Patvirtinti / Atmesti".
- **Maršrutų planuotojas** — kas rytą padeda suplanuoti, kuris automobilis veža ką ir kur.
- **Telegram botas `@Batutynas_bot`** — atsako į tavo klausimus ("kas šiandien?", "kada laisva Candy Pop?"), supranta ir balso žinutes.
- **Monitoringas** — jei kas neveikia, Telegram praneša.

---

## 1. Kasdienis darbas (rytas → vakaras)

### Rytas

1. **07:00** — pažiūri Telegram ryto apžvalgą. Pamatai:
   - šiandienos užsakymus (kas, kur, už kiek)
   - rytojaus užsakymus
   - **rytojaus orai Tauragėje** (temperatūra, lietaus tikimybė, vėjas/gūsiai, saugumo ženklas)
   - mėnesio statistika (užsakymų skaičius ir bendros pajamos)

2. **Vėjo saugumo ženklai** (pripučiamiems batutams):

| Ženklas | Vėjas / gūsiai | Reikšmė |
|---|---|---|
| 🟢 saugu | iki 19 km/h | Viskas gerai, statomi kaip įprasta |
| 🟡 dėmesio | 20–29 km/h | Stebėk sąlygas, priminimas vairuotojui |
| 🟠 rizika | 30–39 km/h | Galvok, ar atidėti, ypač aukštesnius |
| 🔴 PAVOJINGA | 40+ km/h | **Neleidžiama** — skambink klientams dėl perkėlimo |

Svarbu: ženklas skaičiuojamas pagal **didesnį** iš dviejų — jei gūsiai stiprūs, o vėjas ramus, vis tiek matysi tikrąją riziką.

3. **Prisijungi prie dashboard'o**: https://batutynas-chatbot.vercel.app/admin
   - Slaptažodis: `__ADMIN_PASSWORD__`
   - Matai kalendorių, šiandienos sąrašą, laukiančias užklausas.

### Per dieną

- Naujas užsakymas → įrašai į **Google Tasks** "Batutynas Tauragė" sąrašą (pvz. "Mega raketa už 200 · 061234567 · Taikos g. 12, Tauragė"). Per 10 min pasirodo dashboard'e su teal "📋 IŠ GOOGLE TASKS" ženkleliu.
- Klientas skambina pasikeisti duomenis → atidarai dashboard'ą, ieškai per paiešką (ignoruoja lietuviškas raides), taisai.
- Nauja svetainės užklausa → į Telegram atkeliauja 🆕 pranešimas su mygtukais "✅ Patvirtinti" / "❌ Atmesti" / "✏️ Redaguoti".

### Vakaras

- **21:00** — vakaro apžvalga Telegram: kas šiandien įvyko (užsakymų skaičius, pajamos), artimiausios 3 d., rytojaus orai su ta pačia saugumo skale.

---

## 2. Kaip pridėti užsakymą

Trys būdai. Rinkis pagal patogumą — visi rodo dashboard'e.

### A. Google Tasks (rekomenduojama — telefono klaviatūra)

Atsidarai Google Tasks → "Batutynas Tauragė" sąrašą → **+ Pridėti užduotį**. Į pavadinimą rašai kaip įpratęs, pavyzdžiui:

```
Mega raketa už 200
Birutės g. 15, Dirkintai
061234567
Jono 7-asis gimtadienis
```

Per 10 minučių viskas atsiras dashboard'e. Sistema pati atskirs įrangą, kainą, telefoną, adresą.

**Patarimai:**
- Priedai (prie įrangos): `kolonėlė`, `cukraus vata`, `šerbetas`, `burbulų mašina`, `VR`, `putų šou`, `dūmų mašina`, `JBL`, `prailgintuvas` ir kt. Sistema juos atpažįsta.
- Daugiadieniai: antrą dieną pridėk "2 diena" pavadinime ir adresas tas pats — sistema sujungs į vieną užsakymą su "Multi-day" žyma.
- Pagalbinės užduotys sau ("nurašyti", "paskambinti", "pasiimti kėdes") į dashboard'ą nepatenka — sistema atskiria tikrus užsakymus nuo asmeninių priminimų.

### B. Google Calendar (tiesiai kalendoriuje)

Jei iš karto įvedi su tiksliu laiku — atidarai Google Calendar, sukuri įvykį, pavadinime nurodai įrangą ir kainą. Pasirodys dashboard'e beveik iš karto.

### C. Dashboard "Naujas" mygtukas

Spaudžia **Naujas** viršuje (arba violetinį + apačioje telefone). Užpildai formą → sukuriamas Google Calendar įvykis automatiškai.

---

## 3. Dashboard — ką matai ir ką spaudi

**Adresas:** https://batutynas-chatbot.vercel.app/admin (slaptažodis `__ADMIN_PASSWORD__`)

### Viršutinė juosta

- **Kalendorius** (pirma kortelė) — mėnesio vaizdas.
- **Laukiančios** (su skaitikliu) — chatbot užklausos, laukia tavo patvirtinimo.
- **Maršrutas** — dienos maršrutų planuotojas (žr. 6 skyrių).
- **Mėnesio strėlės + "Šiandien"** — judėjimas tarp mėnesių.
- **Apskritos rodyklės** — atnaujinti duomenis iš serverio.
- **Naujas** — pridėti užsakymą ranka.
- **Išėjimo piktograma** — atsijungti.

### Stats korteles (4 skaičiai)

- Šiandienos užsakymai
- Savaitės pajamos (+ % lyginant su praeita savaite)
- Mėnesio užsakymai
- Laisvos įrangos vienetai šiandien

### Įrangos filtras

Žemiau stats — filtrų mygtukai su įrangos pavadinimais. Spaudi vieną → kalendorius ir sąrašas filtruojasi pagal tą įrangą. **Visi** — grąžina visus.

### Kalendorius

Mėnesio tinklelis. Dienose matosi taškai:
- **Violetinis** — patvirtintas Google Calendar užsakymas
- **Gintaro** — laukianti chatbot užklausa
- **Teal** — sinchronizuotas iš Google Tasks

Spaudi dieną → dešinėje (arba apačioje telefone) matosi tos dienos sąrašas.

### Dienos sąrašas (dešinė pusė)

Kiekviena kortelė rodo:
- Įrangą + ikoną
- Klientą, telefoną (paspaudimas skambina), adresą
- Priedus
- Kainą
- Trukmę

**Ženkleliai kortelės viršuje:**
- Teal **📋 IŠ GOOGLE TASKS · PATVIRTINTA** — atėjęs per Tasks
- Pilkas **✅ PRISTATYTA** — užsakymas jau praėjo (skaičiuojama pagal paskutinę dieną, ne pradžią)
- Geltonas **Laukia** — chatbot užklausa

**Mygtukai apačioje priklauso nuo užsakymo tipo:**
- Įprastas (iš Calendar): **Redaguoti** (visi laukai) / **Ištrinti** (su patvirtinimu)
- Sinchronizuotas (iš Tasks): **Perkelti** (klausia naujos datos formatu YYYY-MM-DD) / **Ištrinti** (išima **tik iš dashboard'o** — Google Tasks ir Calendar lieka nepaliesti)
- Laukianti užklausa: **Patvirtinti → Kalendorių** / raudonas ✕ atmesti

### Paieška

Paieškos langas dienos sąraše. Rašai **bet ką** — vardą, telefoną, adresą, įrangą, priedus. Ieško per **visus** mėnesio užsakymus (ne tik pasirinktą dieną). Nepaiso lietuviškų ą/č/š/ž — "astuonkojis" suras "Aštuonkojis".

Rezultatai rikiuojami: **šiandienos → būsimų → praeities**.

### Įrangos būsenos lentelė (apačioje)

Kiekviena įranga ir ar laisva šiandien ("LAISVA" žalia / "UŽIMTA" raudona). Dešinėje paieška — rašyk "mega" → matai tik Mega įrangą.

### Laisvos datos (šalia dienos sąrašo)

Išskleidžiamas meniu + **Ieškoti** mygtukas. Parodo artimiausias 8 laisvas datas per 30 d. pasirinktai įrangai. Naudinga, kai klientas klausia "kada laisvas Candy Pop?". Greitesnis būdas — parašyti Telegram botui `/kada Candy Pop` (žr. 7 skyrių).

### Sveikatos juosta (raudona, pasirodo tik kai yra problema)

Jei n8n arba duomenų bazė neveikia, viršuje matai raudoną juostą su konkrečia priežastimi. Jei nėra — viskas tvarkoje.

---

## 4. Svetainės chatbot'as

Gyvas **batutynas.lt** svetainėje — apatinis dešinys violetinis apskritimas. Po 3 sek. pasirodo pranešimas: "Norite užsisakyti batutą arba paklausti? Susisiekite!".

### Ką klientas gali daryti

**Pagrindinis meniu** (5 mygtukai po pasisveikinimo):

| Mygtukas | Ką daro |
|---|---|
| **Vaiko gimtadieniui** | Gido procesas: įranga → priedai → kontaktai |
| **Įmonės renginiui** | Tas pats su įmonių akcentu |
| **Šventės nuomai** | Tas pats bendram naudojimui |
| **Pirkti batutą** | 6 pirkinio kategorijos (čiuožyklos, kliūčių ruožai, 2-jų dalių, pripučiami žaidimai, kompaktiškos, individuali gamyba) → el. pašto forma katalogui |
| **Kalbėti su žmogumi** | Užpildoma forma → žinutė keliauja tau |

Taip pat klientas gali **tiesiog rašyti klausimą laisva forma** — AI (Gemini) atsakys lietuviškai (arba ta pačia kalba, kuria klausia — rusiškai, angliškai).

### Kaip vyksta rezervacija

1. Klientas išrenka įrangą iš nuotraukų tinklelio.
2. Išrenka priedus (cukraus vata, popcorn, VR, sumo ir t.t.).
3. Užpildo formą: vardas, telefonas (privalomas), data, adresas (privalomas), svečių skaičius.
4. Data parenkama iš **gyvo kalendoriaus** — jau užimtos dienos matosi pilkos, jų nepasirinksi. Tai skaito Google Calendar automatiškai.
5. Paspaudžia "Siųsti" → matosi konfeti + "Užklausa pateikta!" + "Savininkas susisieks telefonu."
6. **Tau ateina Telegram pranešimas** 🆕 su visais duomenimis ir mygtukais.

**Svarbu:** chatbot'as **NEĮRAŠO** užsakymo į Google Calendar automatiškai. Tu pats paskambini klientui, susitari, tada paspaudi **Patvirtinti → Kalendorių** dashboard'e (5 skyrius) — tada įrašoma.

### Ribos ir dalykai, kuriuos verta žinoti

- **Darbo valandos 08:00–21:00** — formaliai taip, bet vizualiai klientas mato "Aktyvus dabar" bet kuriuo paros metu. Jei reikia "offline" režimo — paprašyk techniko įjungti.
- **Kainos** — AI pagal instrukciją atsakys "nuo 30€" ir nukreipia skambinti. Tikslios kainos — tik per tavo skambutį.
- **Atmintis** — botas **neatpažįsta** ankstesnių klientų. Jei tas pats klientas rašo antrą kartą, sistema jam kaip svetimam — klaus visko iš naujo.
- **Kai API "nukrenta"** — klientas matys klaidą ir pranešimo pas tave **neateis**. Tavo monitoringo botas perspės, jei backend'as ilgiau neveikia (8 skyrius).
- **Geltona akcijų juosta** viršuje šiuo metu išjungta. Jei norisi paskelbti akciją (pvz., "Gegužės: -20% batutams"), paprašyk techniko įjungti.
- **Katalogo siuntimas** — klientas, paspaudęs "Pirkti batutą", tikisi gauti PDF el. paštu. **Automatinio siuntimo nėra** — tu pats privalai nusiųsti katalogą po skambučio.

### Kai klientas prašo kalbėti su žmogumi

Mato formą: vardas, telefonas/el. paštas, žinutė → paspaudžia siųsti → tau **ateina Telegram pranešimas**. Tu pats susisieki. Chat'e tiesiogiai bendrauti **negalima** — tai vienpusis pranešimas.

---

## 5. Laukiančios užklausos (chatbot)

**Kortelė "Laukiančios"** rodo klientų užklausas iš svetainės. Kai spaudi **Patvirtinti → Kalendorių**:

1. Atsidaro forma su kliento duomenimis (įranga, data, kaina, adresas, priedai).
2. Gali pakoreguoti bet kokį lauką prieš patvirtinimą.
3. Paspaudi **Patvirtinti** → sukuriamas Google Calendar įvykis, kortelė dingsta.

Atmesti užklausą → raudonas ✕ mažas mygtukas dešinėje. Be grįžimo, dingsta iškart.

**Kada tai naudoti:** klientas atsiuntė užklausą per svetainės chatbotą. Skambini klientui patvirtinti detales, paspaudi Patvirtinti → Kalendorių.

---

## 6. Maršrutų planuotojas ("Maršrutas" kortelė)

Kasdienis maršrutų planavimas — kuris automobilis veža ką ir kur.

### Ryto procesas

1. **Pasirink pristatymo datą** (viršuje — "Pristatymo data")
2. Paspaudi **Gauti užsakymus** (violetinis mygtukas) → sistema įkelia visus tos dienos patvirtintus užsakymus kaip sustojimus.
3. Patikrini sustojimus:
   - 🟢 žalios varneles — adresas patvirtintas, galima vežti
   - 🔴 raudoni ✕ — adreso Google neatpažino, taisai ranka (automatiškai persitikrina po 1 sek.)
4. **Pridedi automobilius** (trys dydžiai: Mažas=3, Didelis=4, Labai didelis=6 sustojimai):
   - Spaudi atitinkamą mygtuką **Automobiliai** skiltyje
   - **Pervardyti** → gali įrašyti vairuotojo vardą ("Tomas") arba numerį
5. **Rekomenduoti** (žalias mygtukas) → sistema paskirsto sustojimus automobiliams, optimizuoja maršrutą, parodo km ir minutes kiekvienam.
6. Perbraukimo ("drag") funkcija — jei matai, kad kažkas netinkamai, traukia kortelę tarp automobilių.
7. **Optimizuoti** (kiekvienam automobiliui atskirai) → perdėlioja tvarką pagal trumpiausią kelią.

### Vakaro / paėmimo (kita diena)

Paėmimo data gali būti **kita** nei pristatymo — atsidarai **Daugiau nustatymų** → nustatai "Paėmimo data" ir **Gauti užsakymus** paima tuos pačius adresus kaip paėmimo sustojimus.

### Žemėlapis ir nuoroda vairuotojui

Dešinėje pusėje matosi Google Maps žemėlapis. Viršuje trys mygtukai:
- **Pilnas** — visa diena (Pagramantis → pristatymai → Tauragė → paėmimai → Pagramantis)
- **Pristatymas** — tik rytas
- **Paėmimas** — tik vakaras

Po žemėlapiu yra **Kopijuoti** (nukopijuoja maršruto URL į buferį) ir **Atidaryti Maps**. Nuorodą siunti vairuotojui per SMS/Telegram — jis atidarys Google Maps telefone su tikra navigacija.

### Statistika apačioje (per automobilį)

- Pristatymo km ir minutės (mėlyna)
- Paėmimo km ir minutės (gintaro)
- Bendra km
- Žaliai — kiek km sutaupyta dėka optimizavimo

**Svarbu:** jei perkeli sustojimą ar keiti pajėgumą — statistika dingsta, reikia iš naujo paspausti **Optimizuoti**.

---

## 7. Telegram botas — `@Batutynas_bot`

Gali rašyti botui tekstu arba **garsiniu pranešimu** (lietuviškai). Pagrindinės komandos:

| Komanda | Ką daro |
|---|---|
| `/siandien` arba "kas šiandien" | Šiandienos užsakymų sąrašas |
| `/rytoj` | Rytojaus užsakymai |
| `/savaite` | Artimiausios 7 dienos |
| `/laisvi rytoj` | Kas laisva/užimta tą dieną (data — "rytoj", "06-15", "birželio 6") |
| `/kada Candy Pop` | Artimiausios laisvos datos tai įrangai |
| `/nauja Candy Pop Rita 06-15 185` | Sukuria užsakymą (kainos ir telefono gali trūkti) |
| `/atsaukti <event-id>` | Ištrina užsakymą iš Calendar *(retas atvejis — paprasčiau per dashboard'ą)* |
| `/surask rita` | Randa užsakymus šį mėnesį pagal vardą/raktažodį |
| `/statistika` | Mėnesio užsakymų ir pajamų santrauka |
| `/pagalba` | Komandų sąrašas |

Veikia lietuvių kalba be tikslių raidžių (ą→a, š→s ir t.t.).

### Kai gauni pranešimą iš svetainės chatbot'o

Atrodys maždaug taip:

```
🆕 Nauja užklausa iš svetainės!
━━━━━━━━━━━━━━━━━━
Rita Kazlauskienė
+370 612 34567
2026-05-15
Candy Pop
Birutės g. 15, Tauragė
Renginys: gimtadienis 10 vaikų

💡 Paskambinkite klientui patvirtinti datą.

[✅ Patvirtinti] [❌ Atmesti] [✏️ Redaguoti]
```

Paspaudęs **Patvirtinti** → sistema įrašo užsakymą į Google Calendar. **Atmesti** → tik užrašo atmetimo statusą. **Redaguoti** → atsidaro Telegram Mini App su pilna forma pataisymui prieš patvirtinant.

---

## 8. Monitoringas — kai kažkas neveikia

Sistema automatiškai tikrina **backend'ą** ir **Calendar Bridge** kas 15 min. Jei kuris nors neveikia **30 min iš eilės**, gausi į Telegram:

```
Batutynas monitoringas

🚨 Backend nepasiekiamas (30 min): HTTP 503
```

Jei neveikia ilgiau, dar sykį praneša po **2 val.** ir po **24 val.** — užtikrina, kad nepamiršsi.

Kai viskas vėl veikia — gausi žalią pranešimą:

```
✅ Backend vėl veikia po 2 val. (HTTP 200)
```

**Ką daryti:** tau pačiam nieko daryti nereikia — susisiek su techniku (žr. apačią). Daugumos problemų sprendimas — restartuoti serverį — trunka 5 min.

> Pastaba: sistema **netikrina** svetainės frontend'o (batutynas.lt pagrindinis puslapis ir chatbot'o mygtukas). Jei klientas pasakys, kad jam nepasirodo chatbot'o apskritimas — tai atskira problema, kurios monitoringas nepagauna.

---

## 9. Svarbu atsiminti

### Google Calendar = pagrindinis šaltinis

Viskas, kas Google Calendar'e, yra "tiesa". Dashboard tik rodo.

- **Taisyti užsakymą** → dashboard'e **Redaguoti** (arba tiesiog Google Calendar mobilioje aplikacijoje)
- **Atšaukti** → **Ištrinti** dashboard'e arba kalendoriuje
- **Rankinius Calendar įvykius** (ne per sistemą sukurtus) dashboard'as neištrins — tokius naikini tiesiai Google Calendar'e

### Google Tasks užsakymai — specialios taisyklės

- "Ištrinti" sinchronizuotą užsakymą dashboard'e **NEPANAIKINA** Google Task. Tasks lieka.
- Jei ištrynei iš dashboard'o ir nori grąžinti — nepavyks, nes Google Tasks saugo tik ~30 dienų senų užbaigtų užduočių. **Geriau ne trinti, o "Perkelti" į naują datą.**

### Darbo valandos

Formaliai chatbot'as skirtas **08:00–21:00**, bet **vizualiai** klientai gali rašyti bet kada — užklausos vis tiek ateina. Jei nori tikro "offline" režimo nakčiai — paprašyk techniko įjungti. Kol kas — užklausas gauni ir naktį; atsakai ryte.

### Naujas darbuotojas (vėliau)

Kai norėsi dalytis dashboard'u su darbuotoju — **duodi jam tą patį slaptažodį** (`__ADMIN_PASSWORD__`). Kai darbuotojas išeina — slaptažodį pakeisk (paprašyk techniko). Darbuotojas **nemato** n8n, serverio, kodo — tik dashboard'ą.

---

## 10. Kur kreiptis, jei įstrigai

**Dashboard neužsikrauna / rodo tuščią:**
1. Telefone / kompiuteryje paspausk **Ctrl+Shift+R** (atsinaujina be cache'o).
2. Patikrink, ar yra internetas.
3. Jei nepadeda — susisiek su techniku.

**Dashboard užsikrauna, bet rodo 0 užsakymų (nors žinai, kad yra):**
1. Pažiūrėk viršuje, kuris mėnuo pasirinktas — gal ne šis. Spausk mygtukus **< / >** arba **Šiandien**.
2. Patikrink, ar aktyvuota įrangos filtravimo kortelė (jei violetinė — rodo tik tą įrangą). Spausk **Visi** grąžinti visus.
3. Spausk manualaus atnaujinimo mygtuką (apskritos rodyklės viršuje).
4. Dar nieko? Susisiek su techniku.

**Ryto/vakaro pranešimas neatėjo 07:00/21:00:**
- Tikriausiai serveris trumpam buvo nukritęs. Patikrink https://batutynas-chatbot.vercel.app/admin — jei dashboard veikia, greičiausiai tik kitas pranešimas vėluoja.
- Jei ir dashboard neveikia — susisiek su techniku.

**Telegram botas nebeatsako:**
1. Parašyk `/start` į `@Batutynas_bot`.
2. Jei tyli — restart'uok Telegram.
3. Jei vis tyli — techniko pagalba.

**Google Tasks nesinchronizuoja:**
- Palauk iki 15 min. (ciklai 10 min., plius laikas apdoroti).
- Jei po 20 min. dashboard'e vis tiek nėra — susisiek su techniku.

**Telefonas techniko:**
`_________________________` (įrašyk savo techniko numerį)

---

## 11. Savaitinis "patikrinimas" (2 min)

Kartą per savaitę verta padaryti:

1. Atsidaryk dashboard'ą → patikrink Stats kortelių skaičiai atitinka tavo nuojautą (užsakymų skaičius panašus į tai, ką atsimeni).
2. Atsidaryk Laukiančios kortelę → įsitikink, kad nėra užmirštų užklausų senai.
3. Žvilgtelk į raudoną sveikatos juostą (jei jos nėra — viskas gerai).
4. Patikrink, kad Google Tasks "Batutynas Tauragė" sąraše nėra užstrigusių užduočių, kurios turėjo susisinchronizuoti.

Viskas. Jei kažkas netinkama — susisiek su techniku.

---

**Klausimai, problemos, pageidavimai** → susisiek su techniku (kontaktas aukščiau).
