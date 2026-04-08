# Batutynas Chatwoot Integration — Setup Guide

This guide connects the Batutynas chatbot to **Chatwoot** so it works with both the website widget and Facebook Messenger from a single inbox.

## Architecture

```
Website  → Chatwoot Web Widget ─┐
Messenger → Chatwoot FB Page ───┤
                                ├→ Chatwoot Agent Bot webhook → n8n
                                ├→ n8n: AI Agent (Gemini + Pinecone)
                                ├→ n8n: Enrich → Chatwoot message format
                                └→ n8n: POST messages back via Chatwoot API
```

---

## Prerequisites

- n8n instance (self-hosted or cloud)
- Existing credentials: Gemini API, Pinecone, OpenAI (same as chat-main-v2)
- `tool-booking-notify.json` workflow already imported
- Facebook Page (for Messenger integration)

---

## Step 1: Create Chatwoot Account

### Option A: Cloud (Easiest)
1. Go to https://app.chatwoot.com and sign up
2. Create an account (free tier works for testing)

### Option B: Self-Hosted
1. Follow https://www.chatwoot.com/docs/self-hosted/deployment/docker
2. Set up with Docker Compose

Note your:
- **Chatwoot URL** (e.g., `https://app.chatwoot.com` or your self-hosted URL)
- **Account ID** (visible in the URL after login: `/app/accounts/1/...`)

---

## Step 2: Create Website Inbox

1. Go to **Settings → Inboxes → Add Inbox**
2. Select **Website**
3. Configure:
   - **Channel Name**: `Batutynas.lt`
   - **Website Domain**: `batutynas.lt`
   - **Widget Color**: `#6C3CE1`
   - **Welcome Title**: `Batutynas.lt`
   - **Welcome Tagline**: `Sveiki! Kuo galiu padėti?`
4. Copy the **embed script** for later use on the website
5. In inbox settings, set **Auto Assignment** to disabled (bot handles everything)
6. **IMPORTANT — Disable Pre-Chat Form** to skip the landing screen:
   - Go to **Settings → Inboxes → Click your Website inbox → Pre Chat Form tab**
   - Set **Enable pre chat form** to **No**
   - Click **Update**
   - This makes the widget open directly to chat instead of showing a form/landing page first

### Widget Embed Code (recommended)

Use `expanded_bubble` type for a more inviting launcher with visible text:

```html
<script>
  window.chatwootSettings = {
    position: 'right',
    type: 'expanded_bubble',
    launcherTitle: 'Sveiki! Parašykite mums',
    darkMode: 'light',
    showPopoutButton: false
  };
</script>
<!-- Then include the standard Chatwoot SDK script -->
```

---

## Step 3: Create Facebook Messenger Inbox

1. Go to **Settings → Inboxes → Add Inbox**
2. Select **Messenger**
3. Click **Connect with Facebook** and authorize your Facebook Page
4. Select the Facebook Page for Batutynas
5. Save the inbox

---

## Step 4: Create Agent Bot

### Via Chatwoot API (Recommended)

```bash
# Replace with your Chatwoot URL and admin access token
CHATWOOT_URL="https://app.chatwoot.com"
ADMIN_TOKEN="YOUR_ADMIN_API_TOKEN"

# Create the agent bot
curl -X POST "$CHATWOOT_URL/platform/api/v1/agent_bots" \
  -H "api_access_token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Batutynas AI Bot",
    "description": "AI chatbot for Batutynas.lt",
    "outgoing_url": "YOUR_N8N_WEBHOOK_URL/webhook/batutynas-chatwoot",
    "account_id": YOUR_ACCOUNT_ID
  }'
```

The response will include the bot's `access_token` — **save this**, you'll need it in Step 6.

### Via Settings UI (if available)
1. Go to **Settings → Integrations → Agent Bots** (or **Applications**)
2. Create a new bot
3. Set the webhook URL to your n8n endpoint
4. Note the bot's API access token

### Assign Bot to Inboxes
```bash
# Assign to website inbox
curl -X POST "$CHATWOOT_URL/api/v1/accounts/$ACCOUNT_ID/agent_bots" \
  -H "api_access_token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_bot": {"name": "Batutynas AI", "outgoing_url": "YOUR_N8N_URL/webhook/batutynas-chatwoot"}}'
```

Or assign via the Inbox settings UI → **Agents** tab → select your bot.

---

## Step 5: Import n8n Workflow

1. Open your n8n instance
2. Go to **Workflows → Import from File**
3. Select `chatwoot-main.json`
4. The workflow contains these nodes:
   - **Chatwoot Webhook** — receives events from Chatwoot
   - **Filter & Extract** — parses message/button clicks, detects channel
   - **Respond Immediately** — returns 200 OK to Chatwoot instantly
   - **AI Agent** — Gemini 2.5 Flash with Chatwoot-adapted system prompt
   - **Enrich for Chatwoot** — converts markers to Chatwoot message objects
   - **Send to Chatwoot** — POSTs messages back via Chatwoot API

---

## Step 6: Configure Workflow Credentials

### AI & Knowledge Base (reuse existing)
1. **Gemini 2.5 Flash** node → select your Google AI credential
2. **Pinecone Knowledge Base** node → select your Pinecone credential
3. **OpenAI Embeddings** node → select your OpenAI credential
4. **Tool: Booking Notify** node → set `workflowId` to your booking notify workflow ID

### Chatwoot API (new)
In the **Send to Chatwoot** code node, update these constants:

```javascript
const CHATWOOT_URL = 'https://app.chatwoot.com';  // Your Chatwoot URL
const ACCOUNT_ID = '1';                             // Your account ID
const API_TOKEN = 'your-agent-bot-access-token';    // From Step 4
```

### Enrich for Chatwoot (important!)
The **Enrich for Chatwoot** node contains a placeholder. You must:
1. Open `enrich-chatwoot.js` from this directory
2. Copy the **entire file contents**
3. Paste into the **Enrich for Chatwoot** code node in n8n

---

## Step 7: Activate & Test

1. **Activate** the workflow in n8n
2. Open your Chatwoot dashboard
3. Go to the website inbox and start a test conversation
4. Send "Sveiki" — you should see the main menu with 5 options
5. Click an option — verify the bot responds correctly
6. Test the full booking flow: Date → Address → Guests → Trampoline → Phone → Confirm

### Testing Facebook Messenger
1. Open your Facebook Page
2. Click "Send Message" or use Messenger
3. Send "Sveiki"
4. Verify the bot responds (note: `cards` content type won't render on Messenger — you'll see text + buttons instead)

---

## Chatwoot Limitations to Know

| Feature | Web Widget | Facebook Messenger |
|---------|------------|-------------------|
| `text` | Yes | Yes |
| `input_select` (buttons) | Yes | Yes |
| `cards` (image + title + actions) | Yes | **NO** |
| `form` (input fields) | Yes | **NO** |

The enrichment code automatically detects the channel and adapts:
- **Web Widget**: Full experience with cards, forms, and buttons
- **Messenger**: Text-based fallback with input_select buttons

### Event Handling
When a user clicks an `input_select` option, Chatwoot fires a `message_updated` event (not `message_created`). The Filter & Extract node handles both events.

---

## Differences from HTML Widget Version

| Feature | HTML Widget | Chatwoot |
|---------|------------|----------|
| Location picker | City buttons + address input | AI asks as plain text |
| Addon selection | Multi-select with Continue button | Iterative (pick one → "more?" → repeat) |
| Date picker | 4 Saturdays + date input | 4 Saturdays as input_select |
| Progress bar | CSS dots | Not used (simpler flow) |
| Cards | HTML grid with images | Chatwoot `cards` type (web) / text (Messenger) |
| Forms | HTML input fields | Chatwoot `form` type (web) / text prompt (Messenger) |

---

## Troubleshooting

### Bot not responding
1. Check n8n workflow is **active**
2. Check Chatwoot webhook URL is correct and reachable
3. Check n8n execution logs for errors
4. Verify the Agent Bot is assigned to the inbox

### Messages not appearing in Chatwoot
1. Verify `API_TOKEN`, `ACCOUNT_ID`, and `CHATWOOT_URL` in the Send node
2. Check n8n logs for HTTP errors from the Chatwoot API
3. Test the API manually:
```bash
curl -X POST "$CHATWOOT_URL/api/v1/accounts/$ACCOUNT_ID/conversations/CONV_ID/messages" \
  -H "api_access_token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message", "content_type": "text", "message_type": "outgoing"}'
```

### Bot responding to its own messages
The Filter & Extract node skips outgoing messages (`message_type === 'outgoing'`). If you still see loops, check that the Agent Bot's messages are correctly marked as outgoing.

### Buttons not working
If clicking an input_select button doesn't trigger the bot:
- Chatwoot sends `message_updated` (not `message_created`) for button clicks
- The Filter & Extract node handles both events
- Check that `content_attributes.submitted_values` is being parsed correctly

---

## File Reference

| File | Purpose |
|------|---------|
| `chatwoot-main.json` | n8n workflow — import into n8n |
| `enrich-chatwoot.js` | Enrichment code — paste into n8n Enrich node |
| `enrich-chatwoot-test.js` | Browser wrapper — used by test page |
| `test-chatwoot.html` | Visual test page — open in browser |
| `SETUP.md` | This file |
