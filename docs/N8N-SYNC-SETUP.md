# n8n Sync Node — MongoDB užsakymų sinchronizavimas

## Problema
Kai savininkas paspaudžia `bk_ok` arba `bk_no` Telegram'e, EmergentChat MongoDB
duomenų bazėje užsakymo statusas turi būti atnaujintas (`confirmed` arba `rejected`).

## Sprendimas
Pridėti HTTP Request node prie Booking Notification workflow (arba Telegram Bot V3),
kuris kviečia chatbot'o sync endpoint'ą.

## Endpoint
```
POST https://chat.batutynas.lt/api/webhook/n8n-sync
```

## Headers
```
Content-Type: application/json
x-sync-secret: <N8N_SYNC_SECRET>
```

## Body (bk_ok atveju)
```json
{
  "orderId": "{{ $json.orderId }}",
  "status": "confirmed",
  "source": "telegram"
}
```

## Body (bk_no atveju)
```json
{
  "orderId": "{{ $json.orderId }}",
  "status": "rejected",
  "source": "telegram"
}
```

## n8n HTTP Request Node konfigūracija

### Pavadinimas: "Sync to Chatbot DB"

| Parametras | Reikšmė |
|-----------|---------|
| Method | POST |
| URL | `https://chat.batutynas.lt/api/webhook/n8n-sync` |
| Authentication | None (naudojamas custom header) |
| Send Headers | Yes |
| Header Name 1 | `x-sync-secret` |
| Header Value 1 | `<N8N_SYNC_SECRET>` |
| Body Content Type | JSON |
| Specify Body | Using Fields Below |
| Body Parameters | `orderId` = `{{ $json.orderId }}`, `status` = `confirmed` arba `rejected`, `source` = `telegram` |

### Kur pridėti
1. Atidarykite **Booking Notification** workflow (ID: `0RTcCw1WcdEJDZYo`)
2. Raskite Telegram Callback apdorojimo dalį (kur `bk_ok::` ir `bk_no::` yra parsinami)
3. Po sėkmingo apdorojimo (kai atsakoma savininkui Telegram'e), pridėkite HTTP Request node
4. Sujunkite: `[bk_ok/bk_no apdorojimas] → [Sync to Chatbot DB]`

### Alternatyva — Telegram Bot V3
Jei bk_ok/bk_no apdorojimas vyksta Telegram Bot V3 workflow'e:
1. Atidarykite workflow ID: `DTcHNEn9NYbAy0QW`
2. Raskite `bk_confirm` / `bk_reject` apdorojimo šaką
3. Pridėkite HTTP Request node po `Format BK Reply` arba `Reply to Booking` node

## Atsakymo formatas
```json
// Sėkmė:
{"success": true, "order_id": "uuid-here", "status": "confirmed", "matched": 1}

// Nerastas:
{"success": false, "order_id": "uuid-here", "matched": 0}
```

## SVARBU
- `orderId` turi būti **MongoDB UUID** (pvz., `a1b2c3d4-e5f6-...`), ne PostgreSQL integer
- Booking Notification siunčia `bk_ok::<orderId>` formatą su UUID
- Jei `matched: 0` — užsakymas gali būti iš kito šaltinio (senasis widget), tai normalu
