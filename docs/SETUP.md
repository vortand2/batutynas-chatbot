# Batutynas.lt Chatbot — Setup Guide

## Prerequisites

- N8N instance (self-hosted or cloud)
- Anthropic API key (for Claude)
- SMTP credentials (for booking notifications)

## Step 1: Import N8N Workflows

1. Open your N8N instance
2. Import `n8n-workflows/chat-main.json` — this is the main chat agent
3. Import `n8n-workflows/tool-booking-notify.json` — this is the booking notification sub-workflow

## Step 2: Configure Credentials

In N8N, create the following credentials:

### Anthropic API
- Go to Settings > Credentials > Add Credential > Anthropic
- Enter your API key
- Update the credential ID in `chat-main.json` (node: "Claude LLM")

### SMTP (for booking emails)
- Go to Settings > Credentials > Add Credential > SMTP
- Configure your email provider settings
- Update the credential ID in `tool-booking-notify.json` (node: "Send Email to Admin")

## Step 3: Set Environment Variables

In N8N Settings > Environment Variables, set:

```
SITE_DOMAIN=https://batutynas.lt
ADMIN_EMAIL=info@batutynas.lt
SMTP_FROM=noreply@batutynas.lt
TOOL_BOOKING_NOTIFY_WORKFLOW_ID=<id-of-booking-notify-workflow>
BATUTYNAS_SYSTEM_PROMPT=<paste-contents-of-prompts/chat-system-prompt.md>
```

## Step 4: Activate Workflows

1. Activate the booking notification workflow first
2. Note its workflow ID
3. Set `TOOL_BOOKING_NOTIFY_WORKFLOW_ID` environment variable
4. Activate the main chat workflow
5. Note the webhook URL (shown in the Chat Webhook node)

## Step 5: Embed on Zyro Site

### Option A: Host files externally (recommended)

1. Upload `chat-widget/chat-widget.js` and `chat-widget/chat-widget.css` to a CDN or static host
2. In your Zyro site editor:
   - Go to Settings > Custom Code > Header
   - Add the CSS link:
     ```html
     <link rel="stylesheet" href="https://your-cdn.com/chat-widget.css">
     ```
   - Go to Settings > Custom Code > Footer
   - Add the script + init:
     ```html
     <script src="https://your-cdn.com/chat-widget.js"></script>
     <script>
       BatutynasChat.init({
         webhookUrl: 'https://your-n8n.com/webhook/batutynas-chat',
         storeName: 'Batutynas.lt',
         primaryColor: '#6C3CE1'
       });
     </script>
     ```

### Option B: Inline embed (simpler but harder to update)

Copy the contents of `embed-snippet.html` into your Zyro custom code footer section.

## Step 6: Test

1. Visit your Zyro site
2. Click the chat bubble
3. Test these scenarios:
   - Ask "Kiek kainuoja batuto nuoma?" — should get pricing info in Lithuanian
   - Ask "What trampolines do you have?" — should get service list in English
   - Ask "Noriu užsisakyti batutą" — should start booking flow
   - Ask "Ar pristatote į Kauną?" — should explain delivery areas

## Troubleshooting

### Chat bubble doesn't appear
- Check browser console for JS errors
- Ensure the CSS file is loaded
- Verify the script URL is accessible

### Chat sends but gets no response
- Check N8N workflow execution log
- Verify webhook URL matches exactly
- Check CORS settings (SITE_DOMAIN env var)

### Booking emails not arriving
- Check SMTP credentials in N8N
- Verify ADMIN_EMAIL is correct
- Check spam folder
- Review N8N execution log for email errors

## Architecture

```
Customer -> Chat Widget (JS) -> N8N Webhook -> AI Agent (Claude)
                                                    |
                                             System prompt with
                                             all business knowledge
                                                    |
                                             -> Booking notification
                                                (email to admin)
```

The system prompt contains ALL business knowledge (services, pricing, FAQ, delivery areas, safety rules). No external API calls needed — the AI has everything it needs in the prompt.
