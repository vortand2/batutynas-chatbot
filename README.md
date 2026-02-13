# Batutynas.lt — AI Chatbot

AI-powered customer support chatbot for [Batutynas.lt](https://batutynas.lt), a Lithuanian inflatable trampoline rental company based in Tauragė.

## What's included

| File | Description |
|---|---|
| `demo/index.html` | Self-contained demo page with mock AI and full branding |
| `chat-widget/chat-widget.js` | Embeddable chat widget (vanilla JS, no dependencies) |
| `chat-widget/chat-widget.css` | Widget styles with purple/indigo theme |
| `n8n-workflows/chat-main.json` | N8N AI agent workflow (Claude + static knowledge) |
| `n8n-workflows/tool-booking-notify.json` | N8N sub-workflow for booking email notifications |
| `prompts/chat-system-prompt.md` | Full system prompt with all business knowledge |
| `embed-snippet.html` | One-liner embed code for Zyro |
| `docs/SETUP.md` | Deployment guide |
| `docs/config-template.env` | Required environment variables |

## Quick start

Open `demo/index.html` in your browser to see the chatbot in action with mock AI responses.

## Demo features

The demo handles 14+ conversation topics:

1. Greetings (LT/EN)
2. Services overview
3. Private party pricing
4. Public event services
5. Delivery areas
6. Available trampolines (with product cards)
7. Safety rules
8. Booking inquiry flow (collects date, location, event type, contact)
9. FAQ answers (10+ questions)
10. Weather/cancellation policy
11. Working hours
12. Contact info
13. Custom manufacturing
14. Escalation to human

## Architecture

```
Customer --> Chat Widget (JS) --> N8N Webhook --> AI Agent (Claude)
                                                       |
                                                Static knowledge:
                                                - Services & pricing
                                                - FAQ (10+ items)
                                                - Delivery areas
                                                - Safety rules
                                                - Booking flow
                                                       |
                                                --> Booking notification
                                                    (email to admin)
```

## Deployment

See [docs/SETUP.md](docs/SETUP.md) for full deployment instructions.

## Tech stack

- **Frontend**: Vanilla JS chat widget (no framework dependencies)
- **Backend**: N8N workflow automation
- **AI**: Claude (Anthropic) via N8N AI Agent node
- **Platform**: Zyro website (embedded via `<script>` tag)
- **Language**: Lithuanian primary, English secondary
