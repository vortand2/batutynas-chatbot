# Facebook Messenger Chatbot — Setup Guide

## Prerequisites

- A Facebook Page (e.g. facebook.com/batutynas)
- A Meta Developer Account (developers.facebook.com)
- N8N instance (self-hosted or cloud) with HTTPS URL
- Google AI Studio API key (for Gemini 2.5 Flash)
- The booking notification workflow already imported (tool-booking-notify.json)

## Step 1: Create a Meta App

1. Go to https://developers.facebook.com and log in with your Facebook account
2. Click **My Apps** in the top menu
3. Click **Create App**
4. You will see a **Use Case** selection screen. Select **Other**, then click **Next**
5. On the **App Type** screen, select **Business**, then click **Next**
6. Fill in:
   - **App name**: e.g. "Batutynas Chatbot"
   - **Contact email**: your email
   - **Business portfolio**: select your business portfolio if you have one, or leave as default
7. Click **Create App**

## Step 2: Add Messenger Product

1. In your app dashboard, look at the left sidebar
2. Click **Add Product**
3. Find the **Messenger** tile and click **Set Up**
4. Messenger will now appear under "Products" in the left sidebar

> **Note**: If you don't see Messenger in the product list, make sure you selected **Other** as use case and **Business** as app type in Step 1. Other app types (like "Consumer", "Gaming") may not show Messenger as an available product.

## Step 3: Connect Your Facebook Page & Get Tokens

1. In the left sidebar, click **Messenger** > **Settings**
2. Scroll to the **Access Tokens** section
3. Click **Add or Remove Pages**
4. A Facebook login window will open — sign in and select your Page (e.g. Batutynas)
5. Click **Next**, grant all requested permissions, then click **Done**
6. Back in the developer console, click **Generate Token** next to your page
7. A dialog will show your **Page Access Token** — **copy it and save it somewhere safe** (you'll need it in Step 5)

Also get your **App Secret**:
1. In the left sidebar, click **App Settings** > **Basic**
2. Click **Show** next to **App Secret**
3. Copy and save this too

## Step 4: Import N8N Workflow

1. Open your N8N instance
2. Import `n8n-workflows/tool-booking-notify.json` first — activate it and note its **workflow ID** (visible in the URL bar, e.g. `/workflow/12345`)
3. Import `n8n-workflows/fb-messenger-main.json`
4. In the **Gemini 2.5 Flash** node, connect your Google AI (PaLM/Gemini) API credential

## Step 5: Replace Placeholders in the Workflow

After importing, open the workflow in n8n and update these placeholder values:

### 5a. Extract & Route node (Code node)
Open the code and find/replace this string:
- `"PASTE_YOUR_FB_VERIFY_TOKEN_HERE"` — replace with any secret string you choose (e.g. `"batutynas-verify-2026"`) — you'll use the same string in Step 6

> **Note**: Signature verification (App Secret) is disabled because n8n cannot reliably verify HMAC signatures. The webhook is still secure because only Facebook knows your verify token and webhook URL.

### 5b. Send to Messenger node (Code node)
Open the code and find/replace:
- `"PASTE_YOUR_FB_PAGE_ACCESS_TOKEN_HERE"` — replace with your Page Access Token from Step 3

### 5c. Tool: Booking Notify node
Open the node settings and change the Workflow ID:
- `PASTE_YOUR_BOOKING_WORKFLOW_ID_HERE` — replace with the workflow ID of your tool-booking-notify workflow from Step 4

### 5d. System Prompt
The system prompt is already embedded in the AI Agent node from `prompts/fb-messenger-system-prompt.md`. No changes needed unless you want to customize it.

## Step 6: Configure Webhook in Facebook

1. **First, activate the workflow in n8n** — the webhook must be live before Facebook can verify it
2. In the Facebook Developer Console, go to **Messenger** > **Settings**
3. Scroll to the **Webhooks** section
4. Click **Add Callback URL**
5. Fill in:
   - **Callback URL**: `https://your-n8n-instance.com/webhook/batutynas-fb-messenger`
   - **Verify Token**: the exact same string you set in Step 5a (e.g. `batutynas-verify-2026`)
6. Click **Verify and Save** — Facebook will send a GET request to your n8n webhook to confirm it works
7. After verification succeeds, click **Add Subscriptions** for your page and select:
   - `messages` — to receive text messages
   - `messaging_postbacks` — to receive button taps
8. Click **Save**

## Step 7: Set Up "Get Started" Button (Recommended)

Run this command in your terminal (replace `YOUR_PAGE_ACCESS_TOKEN`):

```bash
curl -X POST "https://graph.facebook.com/v21.0/me/messenger_profile?access_token=YOUR_PAGE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "get_started": {
      "payload": "GET_STARTED"
    }
  }'
```

This shows a "Get Started" button when someone opens a conversation with your page for the first time.

## Step 8: Switch App to Live Mode

By default, your app is in **Development** mode — only you and added test users can message the bot.

1. At the top of the developer console, you'll see an **App Mode** toggle
2. Switch it from **Development** to **Live**
3. You may need to provide a **Privacy Policy URL** and **Terms of Service URL** for your app (under App Settings > Basic)
4. For full public access, you'll need to submit for **App Review** — request the `pages_messaging` permission

> **For testing**: You can keep the app in Development mode and add test users under **App Roles** > **Roles**. Test users can message the bot without app review.

## Step 9: Test

1. Open **Messenger** (app or messenger.com)
2. Search for your Facebook Page name
3. Tap the **Get Started** button — you should see a welcome message with quick reply buttons
4. Test the full booking flow:
   - Tap "Uzsakyti batuta"
   - Select a date
   - Select a location
   - Select event type
   - Enter contact info
   - Select a trampoline from the carousel
   - Verify you receive the booking confirmation
5. Check your admin email for the booking notification

## Troubleshooting

### Can't find Messenger in the product list
- Go back to **My Apps** and delete the app
- Create a new app: Use Case = **Other**, App Type = **Business**
- Messenger should now appear when you click **Add Product**

### Webhook verification fails
- Make sure the n8n workflow is **active** before clicking Verify in Facebook
- The verify token must match **exactly** (case-sensitive) between n8n and Facebook
- The webhook URL must be **HTTPS** with a valid SSL certificate
- Check n8n execution logs for errors — look at the "Executions" tab to see if the webhook was triggered at all
- **If your n8n version doesn't support "Allow Multiple HTTP Methods":** The webhook is set to GET by default (for verification). If the feature is not available:
  1. Keep the webhook set to GET, activate the workflow, and verify with Facebook
  2. After verification succeeds, open the webhook node and change HTTP Method to **POST**
  3. Save and reactivate the workflow — Facebook only verifies once, all messages come via POST
- **If verification keeps failing**, test the webhook URL manually with curl:
  ```bash
  curl "https://your-n8n.com/webhook/batutynas-fb-messenger?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
  ```
  You should see `test123` in the response. If you see HTML/iframe content instead, set the environment variable `N8N_INSECURE_DISABLE_WEBHOOK_IFRAME_SANDBOX=true` and restart n8n

### Messages not received
- Verify the webhook subscription includes `messages` and `messaging_postbacks`
- Check that the Page Access Token is valid and not expired
- If in Development mode, make sure the message sender is a test user or app admin

### Bot responds slowly or not at all
- Check n8n execution logs
- Verify the Google AI (Gemini) API key is valid and has credits
- Facebook expects a response within 5 seconds — the workflow sends 200 OK immediately, then processes in the background

### Carousel images not showing
- Image URLs must be publicly accessible HTTPS URLs
- Facebook caches images — changes may take time to appear
- Check that the Zyro CDN image URLs are accessible from outside your network

## Architecture

```
Facebook User
    |
    v
Facebook Platform --webhook--> n8n Workflow
    |                              |
    |                    +---------+---------+
    |                    |                   |
    |               GET request         POST request
    |               (verify)            (message)
    |                    |                   |
    |              Return challenge    Extract sender
    |                                  + message
    |                                       |
    |                                  +---------+
    |                                  |         |
    |                             Get Started  AI Agent
    |                             (welcome)   (Gemini)
    |                                  |         |
    |                                  +----+----+
    |                                       |
    |                                Format for Messenger
    |                                (markers -> API payload)
    |                                       |
    v                                       v
Facebook User <----Send API----- HTTP Request to Graph API
```

## Placeholder Reference

These placeholders need to be replaced in the workflow after importing:

| Placeholder | Location | Description |
|---|---|---|
| `PASTE_YOUR_FB_VERIFY_TOKEN_HERE` | Extract & Route code | Your chosen webhook verification string |
| `PASTE_YOUR_FB_PAGE_ACCESS_TOKEN_HERE` | Send to Messenger code | Page Access Token |
| `PASTE_YOUR_BOOKING_WORKFLOW_ID_HERE` | Tool: Booking Notify | Workflow ID of booking notification workflow |
