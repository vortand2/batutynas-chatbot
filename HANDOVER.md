# Batutynas — Owner Runbook

One-page operational reference for the business automation system. Aimed at the owner (eddobr@gmail.com) and — later — 2–3 employees with dashboard-only access.

---

## Daily "is it working?" check (30 seconds)

1. **Morning briefing arrived?** Telegram from `@Batutynas_bot` at 07:00 EEST. If yes → system is green.
2. **Evening check arrived?** Same bot at 21:00 EEST.
3. **Dashboard loads?** `https://batutynas-chatbot.vercel.app/admin` (password: `__ADMIN_PASSWORD__`) — should show orders, not a 500 error.

If any one of these is missing, see *Troubleshooting* below.

---

## What lives where

| Thing | Where | Who it belongs to |
|---|---|---|
| Admin dashboard | `https://batutynas-chatbot.vercel.app/admin` | Vercel (auto-deploys from GitHub master) |
| Backend API | `https://batutynas-chatbot.0uvai5.easypanel.host/api` | Easypanel on Hostinger VPS `batutynas-vps` |
| n8n workflows | `https://n8n-n8n.0uvai5.easypanel.host` | Easypanel on same VPS |
| Google Calendar | `eddobr@gmail.com` primary calendar | Google (source of truth for bookings) |
| Google Tasks list `Batutynas Tauragė` | Google Tasks | Google (auto-synced to dashboard every 10 min) |
| Telegram bot | `@Batutynas_bot` / `t.me/Batutynas_bot` | owned by your Telegram account |
| Website chatbot | `https://vortand2.github.io/batutynas-chatbot/demo/` | GitHub Pages (from this repo) |
| Code | GitHub `vortand2/batutynas-chatbot` | your GitHub account |
| Secrets | Obsidian `Projects/batutynas-chatbot/credentials/` | your Obsidian vault |

---

## Access

- **Admin dashboard:** password `__ADMIN_PASSWORD__` (in `.env` as `ADMIN_PASSWORD`). Same password for future employees — just share it. If you fire someone, change `ADMIN_PASSWORD` in the backend `.env` and redeploy (below). All active sessions expire next day.
- **Everything else:** logins are in Obsidian `Projects/batutynas-chatbot/credentials/n8n-api.md`.

---

## Health monitoring

A **Uptime Monitor** n8n workflow (`Batutynas: Uptime Monitor`, id `a80oNUpDMuNfMOp8`) runs every 15 min and pings three critical endpoints. If any fails **twice in a row**, you get a Telegram alert like:

> 🚨 Batutynas nepasiekiamas: Backend (mongo down)

Falsealarms are suppressed by requiring two consecutive failures. No alert = all green.

Manual health probe (run anytime):

```bash
curl -s https://batutynas-chatbot.0uvai5.easypanel.host/api/health | jq
# → { "ok": true, "mongo": true, "calendar_bridge": true, "timestamp": "..." }
```

`ok: false` means something is broken. Status code is 503 in that case.

---

## Deploying changes

### Frontend (React dashboard) — automatic

Push to GitHub `master` branch → Vercel rebuilds + redeploys within 1 min. No action needed from you.

### Backend (FastAPI) — manual

Backend does NOT auto-deploy (Easypanel config doesn't have a Git webhook). To release changes:

```bash
ssh batutynas-vps 'cd /opt/batutynas && git pull && docker compose up -d --build backend'
```

Takes ~60 seconds. The `backend` container rebuilds and restarts; `mongo` keeps running.

### n8n workflows

Edit in the n8n UI (`https://n8n-n8n.0uvai5.easypanel.host`) → Save → workflow is live immediately. No deployment step.

---

## Troubleshooting

### "Morning/evening briefing didn't arrive"

1. Open n8n → workflow `Batutynas: Morning Briefing V2 (Calendar)` (id `8SuYKMdFcsg2992D`) OR `Evening Check V2` (`1zQidq9TNo8RwTQk`).
2. Click **Executions** tab. If the latest trigger run status is red → click it, read the error in the node that failed.
3. Common causes: Gemini API key revoked, Telegram bot token rotated, Calendar Bridge webhook timing out.
4. Manual test: click **Execute Workflow** in the n8n editor. If it succeeds now, the scheduled run will succeed next time.

### "Google Tasks aren't syncing to the dashboard"

1. Open n8n → workflow `Batutynas: Tasks → Dashboard (future only, auto-confirm)` (id `Oi5fvZXMXZoiAy2v`).
2. **Executions** tab. The workflow fires every 10 min. If recent runs are red:
   - Most common: backend was briefly down. It self-heals within an hour.
   - Second most common: Google Tasks OAuth credential expired → re-authorize the `Google Tasks OAuth` credential in n8n (Settings → Credentials).
3. Synced orders appear in the dashboard with a **teal "📋 IŠ GOOGLE TASKS"** badge.

### "Dashboard shows 0 bookings but I know I have some"

1. Check which month selector is active (top of dashboard).
2. Check the date range filter — dashboard shows the selected month only.
3. If GCal events are missing, check that Calendar Bridge (n8n workflow `f8oH71aJgatCBOvu`) is active.
4. Hard refresh the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) — sometimes cached data hides after the backend updates.

### "Telegram bot stopped responding"

1. Open Telegram → `@Batutynas_bot` → `/start`. Should reply.
2. If no reply, verify webhook: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` — should point to `https://n8n-n8n.0uvai5.easypanel.host/webhook/batutynas-telegram-v3` with 0 pending updates.
3. If webhook is missing, re-register: n8n workflow `Telegram Bot V3` → click the Telegram Webhook node → Copy URL → `curl -F "url=<URL>" https://api.telegram.org/bot<TOKEN>/setWebhook`

### "Chatbot widget on website not loading"

1. Check GitHub Pages is up: `https://vortand2.github.io/batutynas-chatbot/demo/`.
2. Verify `prompts/chat-system-prompt.md` hasn't been corrupted by a bad edit.
3. Check `Batutynas: Widget Chat Backend` workflow (id `wZRUMZw8dNvbsYwu`) executions — if erroring, the Gemini API key may have rotated.

### "Backend is offline / 502 / 503"

1. SSH in: `ssh batutynas-vps`
2. `docker compose -f /opt/batutynas/docker-compose.yml ps` — check `backend` is `Up`.
3. If `Exit` or `Restarting`: `docker compose -f /opt/batutynas/docker-compose.yml logs --tail=50 backend` to see why.
4. Force restart: `docker compose -f /opt/batutynas/docker-compose.yml up -d --force-recreate backend`

### "Easypanel itself is down (can't SSH, can't reach any `.0uvai5.easypanel.host` URL)"

Easypanel is the control plane on your Hostinger VPS. If the entire host is unreachable:

1. Log into Hostinger hPanel → VPS → check server status / reboot if hung.
2. If the VPS is up but SSH is refused, use Hostinger's browser console to get in.
3. Once in: `systemctl status docker` → if stopped, `systemctl start docker`.
4. Then `cd /opt/batutynas && docker compose up -d` to resurrect all Batutynas containers.
5. Easypanel itself runs in Docker — if its container is broken, reboot the VPS from Hostinger UI.

Hostinger support: `support@hostinger.com` / live chat on hpanel.hostinger.com. Have your VPS ID ready.

### "Vercel frontend deploys but dashboard breaks"

The dashboard calls `/api/*` relative to its origin. Vercel rewrites `/api/*` → the Easypanel backend via `frontend/vercel.json`. If the dashboard loads but shows "Serverio klaida" everywhere, either:

1. Backend is down (see above)
2. Vercel project environment variables were changed. Check Vercel dashboard → project `batutynas-chatbot` → Settings → Environment Variables. Expected:
   - `REACT_APP_GOOGLE_MAPS_KEY` (for the Route Planner embedded maps)
   - No backend URL needed — it's a relative `/api` rewrite in `vercel.json`.

---

## Rotating API keys

### Gemini API key (happens ~every 6 months when Google flags reuse)

1. Go to `https://aistudio.google.com/app/apikey` → create new key.
2. Paste into n8n credential `Google Gemini(PaLM) Api account` AND into 4 workflows that hard-code it: `Morning Briefing V2`, `Evening Check V2`, `Widget Chat Backend`, `Telegram Bot V3` (if xAI/Groq ever swapped to Gemini).
3. Also update `GEMINI_API_KEY` in backend `.env` → redeploy backend (command above).
4. Record the rotation date in `Projects/batutynas-chatbot/credentials/n8n-api.md`.

### Google Maps API key

Same console (`https://console.cloud.google.com/apis/credentials`). Update `GOOGLE_MAPS_API_KEY` in backend `.env` → redeploy.

### Telegram bot token

Very rare. `@BotFather` → `/token` → select `@Batutynas_bot` → generate new token. Update in n8n credential `Batutynas Telegram Bot` + in `.env` → redeploy backend.

### N8N_SYNC_SECRET (shared between backend and 3 n8n workflows)

Used by: Tasks → Dashboard sync (posts to `/api/webhook/n8n-tasks-import`) and both briefings (fetch `/api/internal/synced-bookings`). The current value was once visible in a published Vercel JS bundle.

To rotate:

1. Pick a new strong value (e.g. `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`).
2. SSH in: `ssh batutynas-vps`, edit `/opt/batutynas/.env` and change `N8N_SYNC_SECRET=<new>`, save.
3. `docker compose -f /opt/batutynas/docker-compose.yml up -d --force-recreate backend`.
4. In n8n, open these 3 workflows and update the `x-sync-secret` header in the HTTP nodes that call the backend:
   - `Oi5fvZXMXZoiAy2v` — Tasks → Dashboard → "Create Pending Order" node
   - `8SuYKMdFcsg2992D` — Morning Briefing V2 → "Prepare Weather" code node (hardcoded string in the inline `httpRequest` call)
   - `1zQidq9TNo8RwTQk` — Evening Check V2 → same pattern
5. Run each workflow once manually to confirm the new secret works.

---

## MongoDB backup & restore

MongoDB runs in the `batutynas-mongo-1` Docker container. Daily backup to a file on the host:

```bash
ssh batutynas-vps 'docker compose -f /opt/batutynas/docker-compose.yml exec -T mongo \
  mongodump --db batutynas_db --archive --gzip' > ~/batutynas-backup-$(date +%F).gz
```

Put that one-liner in a `crontab -e` on your laptop (or the VPS) to run nightly:

```cron
0 3 * * * ssh batutynas-vps '...' > ~/backups/batutynas-$(date +\%F).gz
```

**Restore** (destructive — wipes current DB, use carefully):

```bash
cat ~/batutynas-backup-2026-04-19.gz | ssh batutynas-vps 'docker compose -f /opt/batutynas/docker-compose.yml exec -T mongo \
  mongorestore --drop --gzip --archive --db batutynas_db'
```

The synced-orders collection is the most important — without it, past Google Tasks syncs are lost (Google Tasks itself only retains ~30 days of completed tasks).

---

## Adding an employee (dashboard only)

The current model is one shared admin password. To add employees **without** them seeing the codebase or n8n:

**Easy way (recommended):** share the URL + password. They see the dashboard, cannot deploy code, cannot touch workflows. When they leave, change the password (see *Access* above).

**If you want separate logins per employee later:** backend needs a user table + login flow. Not built yet. Ping your developer to add it — estimate ~1 session of work.

---

## Critical files in this repo

| File | Purpose |
|---|---|
| `backend/server.py` | FastAPI backend — all API endpoints |
| `frontend/src/components/AdminDashboard.jsx` | The dashboard |
| `frontend/src/components/RoutePlanner.jsx` | Delivery route planner |
| `frontend/src/components/ChatWidget.jsx` | Website chatbot widget |
| `prompts/chat-system-prompt.md` | Chatbot's Lithuanian personality |
| `n8n-workflows/*.py` | Python builders for n8n workflows |
| `scripts/reparse-synced-orders.md` | Safe recipes for updating existing synced orders |
| `CLAUDE.md` | Developer handbook — read this before changing code |

---

## What NOT to do

- ❌ **Don't** replace Google Calendar with any other system — it's the source of truth for bookings.
- ❌ **Don't** edit n8n workflow JSON files directly — regenerate from the Python builder, or edit in the n8n UI.
- ❌ **Don't** delete synced orders and expect them to re-sync — Google Tasks only retains ~30 days of history. Use `scripts/reparse-synced-orders.md` recipes instead.
- ❌ **Don't** connect FB Messenger until you've tested the website chatbot thoroughly — the code is ready but not hooked up on purpose.
- ❌ **Don't** commit `.env` files or anything in `credentials/` to git.

---

## Known open items (non-blocking)

- `build-daily-summaries-v2.py` (Python builder) is out of sync with live briefing workflows. Patches applied directly via REST API are documented in the builder's docstring. Re-sync if you ever need to rebuild briefings from scratch.
- `N8N_SYNC_SECRET` was leaked in an old Vercel bundle. Low exploit risk (owner-only system) but rotate if paranoid.
- Voice booking via Telegram (voice message → create booking) has never been tested with a real recording. If you rely on it, do one real-world test first.
- Some synced orders (~14 from 2026-04-11 batch) have `customer_name` that's actually an address fragment — cosmetic only, doesn't break anything.

---

**If you're stuck and none of this helps**, grep the repo for the error message first (`grep -r "Nepavyko" .` etc) — most user-facing strings have comments explaining where they come from.
