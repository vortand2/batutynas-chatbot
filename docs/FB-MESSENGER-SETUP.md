# Facebook Messenger Chatbot — Setup Guide

## Prerequisites

- Facebook Page (e.g. facebook.com/batutynas)
- Facebook Developer Account (developers.facebook.com)
- N8N instance (self-hosted or cloud)
- Anthropic API key (for Claude)
- The booking notification workflow already imported (tool-booking-notify.json)

## Step 1: Create Facebook App

1. Go to https://developers.facebook.com
2. Click "My Apps" > "Create App"
3. Select "Business" type
4. Name it (e.g. "Batutynas Chatbot")
5. After creation, click "Add Product" > "Messenger" > "Set Up"

## Step 2: Connect Your Facebook Page

1. In the Messenger settings, under "Access Tokens"
2. Click "Add or Remove Pages"
3. Select your Facebook Page (e.g. Batutynas)
4. Grant all permissions
5. Click "Generate Token" for your page
6. **Copy the Page Access Token** — you'll need this for n8n

## Step 3: Import N8N Workflow

1. Open your N8N instance
2. Import `n8n-workflows/fb-messenger-main.json`
3. Make sure `tool-booking-notify.json` is already imported and active

## Step 4: Set Environment Variables in N8N

Go to Settings > Environment Variables and add:

```
FB_PAGE_ACCESS_TOKEN=<your page access token from Step 2>
FB_VERIFY_TOKEN=<any strong random string you choose>
FB_APP_SECRET=<from App Settings > Basic > App Secret>
FB_MESSENGER_SYSTEM_PROMPT=<paste contents of prompts/fb-messenger-system-prompt.md>
TOOL_BOOKING_NOTIFY_WORKFLOW_ID=<id of booking notify workflow>
```

Notes:
- `FB_VERIFY_TOKEN` can be any string you choose — you'll use the same string in Step 5
- `FB_APP_SECRET` is used for verifying webhook request signatures (recommended for security)

## Step 5: Configure Webhook in Facebook Developer Console

1. In the Messenger settings, scroll to "Webhooks"
2. Click "Add Callback URL"
3. **Callback URL**: `https://your-n8n-instance.com/webhook/batutynas-fb-messenger`
4. **Verify Token**: The same string you set in `FB_VERIFY_TOKEN` (e.g. `batutynas-verify-token-2026`)
5. Click "Verify and Save"
6. Under "Webhooks Fields", subscribe to:
   - `messages` — to receive text messages
   - `messaging_postbacks` — to receive button taps

## Step 6: Set Up "Get Started" Button (Optional but Recommended)

Run this command to set the Get Started button for your page:

```bash
curl -X POST "https://graph.facebook.com/v21.0/me/messenger_profile?access_token=YOUR_PAGE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "get_started": {
      "payload": "GET_STARTED"
    }
  }'
```

This shows a "Get Started" button when users open Messenger for the first time.

## Step 7: Activate Workflow

1. In n8n, activate the FB Messenger workflow
2. Make sure the booking notification workflow is also active

## Step 8: Test

Test via Messenger:

1. Open Messenger
2. Search for your Page name
3. If it's your first time, tap "Get Started" — you should see a welcome message with quick reply buttons (Nuomos kainos, Batutų katalogas, Užsakyti batutą, Pristatymo zonos)
4. Or send "Sveiki" — the AI agent will respond with a greeting
5. Test the full booking flow:
   - Tap "Užsakyti batutą"
   - Select a date
   - Select a location
   - Select event type
   - Enter contact info
   - Select a trampoline from the carousel
   - Verify you receive the booking confirmation
5. Check your admin email for the booking notification

## Troubleshooting

### Webhook verification fails
- Ensure your n8n workflow is active BEFORE setting up the webhook in Facebook
- Check that `FB_VERIFY_TOKEN` matches exactly in both n8n and Facebook
- The webhook URL must be HTTPS
- Check n8n execution logs for errors

### Messages not received
- Verify the webhook subscription includes `messages` and `messaging_postbacks`
- Check that the Page Access Token is valid and not expired
- Ensure the Facebook App is in "Live" mode (not just Development)

### Bot responds slowly or not at all
- Check n8n execution logs
- Verify Anthropic API key is valid
- Facebook requires a response within 5 seconds — the workflow sends 200 OK immediately, then processes asynchronously

### Carousel images not showing
- Image URLs must be publicly accessible HTTPS URLs
- Images should be at least 1:1.91 aspect ratio
- Check that the Zyro CDN URLs are accessible

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
    |                             (welcome)   (Claude)
    |                                  |         |
    |                                  +----+----+
    |                                       |
    |                                Format for Messenger
    |                                (markers -> API payload)
    |                                       |
    v                                       v
Facebook User <----Send API----- HTTP Request to Graph API
```

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `FB_PAGE_ACCESS_TOKEN` | Yes | Facebook Page Access Token |
| `FB_VERIFY_TOKEN` | Yes | Custom string for webhook verification |
| `FB_APP_SECRET` | Recommended | App Secret for webhook signature verification |
| `FB_MESSENGER_SYSTEM_PROMPT` | No | System prompt (falls back to built-in) |
| `TOOL_BOOKING_NOTIFY_WORKFLOW_ID` | Yes | ID of the booking notification workflow |
| `ADMIN_EMAIL` | Yes | Email for booking notifications |
| `SMTP_FROM` | Yes | Sender email for notifications |
