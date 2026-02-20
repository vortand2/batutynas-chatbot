# Batutynas.lt Chatbot — Setup Guide

## Prerequisites

- N8N instance (self-hosted or cloud)
- Google AI Studio API key (for Gemini 2.5 Flash)
- Pinecone account (free tier — 100K vectors)
- OpenAI API key (for embeddings only)
- SMTP credentials (for booking notifications)

## Step 1: Create Pinecone Index

1. Go to https://app.pinecone.io, create account
2. Create a new index:
   - **Name:** `batutynas`
   - **Dimensions:** `1536`
   - **Metric:** `cosine`
   - **Type:** Serverless, AWS us-east-1
3. Note the API key from API Keys section

## Step 2: Get API Keys

| Service | URL | Cost |
|---------|-----|------|
| Google AI Studio (Gemini) | https://aistudio.google.com/apikey | Free |
| Pinecone | https://app.pinecone.io | Free tier (100K vectors) |
| OpenAI (embeddings only) | https://platform.openai.com/api-keys | ~$0.02/1M tokens |

## Step 3: Import N8N Workflows

1. Open your N8N instance
2. Import `n8n-workflows/ingest-website.json` — website ingestion pipeline
3. Import `n8n-workflows/tool-booking-notify.json` — booking notification sub-workflow
4. Import `n8n-workflows/chat-main-v2.json` — main chat agent (Gemini + Pinecone)

> **Note:** `chat-main.json` is the old Claude-based workflow. Keep it for reference but use `chat-main-v2.json` going forward.

## Step 4: Configure Credentials

In N8N, create the following credentials:

### Google AI (Gemini)
- Go to Settings > Credentials > Add Credential > Google AI (PaLM/Gemini)
- Enter your API key from Google AI Studio
- Referenced by: `chat-main-v2.json` (node: "Gemini 2.5 Flash")

### Pinecone API
- Go to Settings > Credentials > Add Credential > Pinecone
- Enter your API key
- Referenced by: `ingest-website.json` (node: "Store in Pinecone") and `chat-main-v2.json` (node: "Pinecone Knowledge Base")

### OpenAI API (embeddings only)
- Go to Settings > Credentials > Add Credential > OpenAI
- Enter your API key
- Referenced by: `ingest-website.json` and `chat-main-v2.json` (nodes: "OpenAI Embeddings")

### SMTP (for booking emails)
- Go to Settings > Credentials > Add Credential > SMTP
- Configure your email provider settings
- Referenced by: `tool-booking-notify.json` (node: "Send Email to Admin")

## Step 5: Configure Placeholders in Workflows

After importing, replace placeholder values directly in the workflow nodes:

### chat-main.json (legacy Claude version)
- **Tool: Booking Notify** node: replace `PASTE_YOUR_BOOKING_WORKFLOW_ID_HERE` with the actual workflow ID of your booking notification workflow

### chat-main-v2.json (Gemini + RAG version)
- Check the workflow for any placeholder values and replace them with your actual credentials/IDs
- The system prompt is already embedded from `prompts/chat-system-prompt.md`

### tool-booking-notify.json
- Verify the admin email (`info@batutynas.lt`) and sender address are correct in the email node

## Step 6: Run Website Ingestion

1. Open the "Batutynas: Website Ingestion" workflow
2. Click "Execute Workflow" (manual trigger)
3. Wait for all URLs to be processed (~32 pages)
4. Verify in Pinecone dashboard: should have ~100-160 vectors in namespace `batutynas-lt`

### Re-indexing
When website content changes:
1. (Optional) Delete namespace `batutynas-lt` in Pinecone dashboard for a full refresh
2. Edit the URL List node if new pages were added
3. Re-run the ingestion workflow

## Step 7: Activate Workflows

1. Activate the booking notification workflow first
2. Note its workflow ID (visible in the URL bar, e.g. `/workflow/12345`)
3. Paste that ID into the chat workflow's "Tool: Booking Notify" node
4. Activate the main chat v2 workflow
5. Note the webhook URL (shown in the Chat Webhook node)

## Step 8: Embed on Zyro Site

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

## Step 9: Test

| # | Test | Expected |
|---|------|----------|
| 1 | "Sveiki" | Lithuanian greeting, no RAG call |
| 2 | "Kokius batutus turite?" | Retrieves products from Pinecone, lists them |
| 3 | "Kiek kainuoja Mega Rocket?" | Specific price from RAG |
| 4 | "Noriu užsakyti batutą" | Date picker appears (`[DATE_PICKER]`) |
| 5 | Complete booking flow (5 steps) | Email sent, confirmation card shows |
| 6 | "Ar batutai saugūs?" | Safety info from RAG |
| 7 | "Ar pristatote į Kauną?" | Delivery zone info from RAG |
| 8 | "Koks oras šiandien?" | Brief answer + redirect to services |
| 9 | "Noriu kalbėti su žmogumi" | Phone/email contacts |
| 10 | Follow-up question | Remembers context (16-msg window) |

## Troubleshooting

### Chat bubble doesn't appear
- Check browser console for JS errors
- Ensure the CSS file is loaded
- Verify the script URL is accessible

### Chat sends but gets no response
- Check N8N workflow execution log
- Verify webhook URL matches exactly
- Check CORS settings in the Chat Webhook node (Access-Control-Allow-Origin header)

### Booking emails not arriving
- Check SMTP credentials in N8N
- Verify ADMIN_EMAIL is correct
- Check spam folder
- Review N8N execution log for email errors

### RAG returns no results
- Verify Pinecone has vectors: check dashboard for namespace `batutynas-lt`
- Re-run ingestion pipeline if empty
- Check OpenAI API key for embeddings

### Ingestion fails on a URL
- The URL may have changed or be behind a redirect
- Update the URL List code node with correct URLs
- Some pages may return <100 chars — these are skipped (expected)

## Architecture

```
Customer -> Chat Widget (JS) -> N8N Webhook -> AI Agent v3.1 (Gemini 2.5 Flash)
                                                    |
                                            ├── Pinecone RAG (product/price/FAQ knowledge)
                                            │       └── OpenAI Embeddings
                                            ├── Window Buffer Memory (16 msgs)
                                            └── Tool: Booking Notify
                                                    (email to admin)
```

Business knowledge is stored in Pinecone (indexed from batutynas.lt). The system prompt contains only personality, booking flow markers, and escalation rules.

## Cost Comparison

| Component | Old (v1) | New (v2) |
|-----------|----------|----------|
| LLM | Claude Sonnet 4 (~$3/$15 per 1M tokens) | Gemini 2.5 Flash (~$0.075/$0.30 per 1M tokens) |
| Knowledge | 190-line system prompt | Pinecone RAG (free tier) |
| Embeddings | N/A | OpenAI text-embedding-3-small (~$0.02/1M tokens) |
| **Estimated monthly** | **~$30-50** | **~$1-3** |
