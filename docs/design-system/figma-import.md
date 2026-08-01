# Importing Batutynas design system into Figma + Claude Design

This folder contains everything a designer needs to build a Figma file or feed Claude Design. Pick the path that matches your tool.

---

## What's in this folder

| File | Format | What it is |
|---|---|---|
| `design-tokens.json` | W3C Design Tokens | Master token source. Figma Tokens Studio imports directly. |
| `design-tokens.css` | CSS custom properties | Same tokens for web build / Tailwind config. |
| `brand-style-guide.html` | Self-contained HTML | Living style guide — colors, type, components, voice. Open in browser, paste into Figma via plugin. |
| `brand-style-guide.pdf` | PDF | Print version of the style guide. |
| `mood-board.html` / `mood-board.pdf` | HTML + PDF | All website screenshots + brand voice quotes in one document. |
| `design-inputs.pdf` | PDF | Full evidence audit (the master MD doc as PDF). |
| `../screenshots/` | PNG x 13 | Live website screenshots, desktop + mobile. |

The master MD document lives at the repo root: `../../DESIGN-SYSTEM-INPUTS.md`.

---

## Path 1 — Claude Design (anthropic.com)

Claude Design accepts: PDFs, images, text descriptions. It does **not** require Figma files.

**Upload in this order:**
1. `design-inputs.pdf` — the full evidence brief.
2. `mood-board.pdf` — visual reference of current site + brand voice.
3. `brand-style-guide.pdf` — the proposed system in one page.
4. `design-tokens.json` — paste the JSON inline as additional context.

Then prompt Claude Design with one of:
- *"Using the attached brand evidence, design a public marketing page for batutynas.lt private events service."*
- *"Redesign the owner admin dashboard preserving the locked status colors in §6 of the inputs doc."*
- *"Design a customer chatbot widget skin using the locked palette."*

---

## Path 2 — Figma (real .fig file)

Real `.fig` files are Figma's proprietary binary. They can only be created from inside Figma. But the work to set up the file is small once you import these inputs.

### Step A — Import tokens
1. Open Figma → install plugin **"Tokens Studio for Figma"** (free).
2. Plugin → Settings → JSON → paste `design-tokens.json`.
3. Plugin → Apply tokens → all colors, fonts, radii, spacing become Figma styles + variables.

### Step B — Import the style guide as Figma layers
1. Install plugin **"html.to.design"** (free tier works) OR **"Figma to HTML/CSS/Tailwind"** in reverse.
2. Open `brand-style-guide.html` in a browser, copy URL or paste the file path.
3. Plugin → import URL → produces a fully-layered Figma frame with all components.
4. Result: real layered Figma file — buttons, badges, chat bubbles, calendar dots, type specimens.

### Step C — Drop screenshots as reference frames
1. In Figma, drag all files from `../screenshots/` into the canvas.
2. Arrange in a "Reference" page beside the new system page.

### Step D — Save as `.fig`
- Figma → File → Save local copy → produces a real `.fig` file you can share.

---

## Path 3 — Penpot (open-source Figma alternative)

Penpot natively imports SVG + tokens.
1. Create new file in Penpot.
2. Import `design-tokens.json` via Penpot's Tokens panel.
3. Paste components from `brand-style-guide.html` (Penpot has a paste-HTML mode in beta).
4. Export as `.penpot` archive.

---

## Path 4 — Quick designer handoff (no tool)

Send these 3 files in an email or Slack:
1. `design-inputs.pdf`
2. `mood-board.pdf`
3. `brand-style-guide.pdf`

The designer reads them, opens Figma, and builds. The PDFs contain everything they need without requiring any plugin or import step.

---

## How the inputs were generated

Every value in this folder traces to one of:
- Live `batutynas.lt` HTML (parsed 2026-05-19, 7 pages, cached at `/tmp/bat-*.html`)
- Production React code at `frontend/src/components/{ChatWidget,AdminDashboard,RoutePlanner}.jsx`
- Production AI system prompt at `prompts/chat-system-prompt.md`
- Owner workflow doc `SAVININKUI.md`
- Existing brand spec `design_guidelines.json`
- 13 fresh screenshots captured via headless Chrome

No invented brand attributes. Every claim in the master MD is sourced with a file path or URL.

---

## When tokens conflict

Three sources contributed tokens. Conflicts resolved as follows:

| Conflict | Resolution | Why |
|---|---|---|
| Marketing hero color (CSS inline said `#18172A`, screenshot says purple) | Use purple `#7C3AED` | Screenshot is ground truth |
| Chatbot price floor (30 €) vs Site FAQ (50 €) | Use 50 € | Customer-facing site is canonical |
| Fleet size (chatbot 18 vs site 13) | 13 batutai + 5 atrakcijos | Customer-facing site is canonical |
| Equipment naming (LT "Mega raketa" vs EN "Mega Rocket") | LT customer-side | Customer language wins |
| Team copy ("Mūsų komanda" vs solo reality) | Imply founder, not team | Don't invent fictional staff |

---

## Regenerating these files

When evidence changes (site rebuild, new chatbot version, etc.):

```bash
# Re-capture screenshots
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1440,3500 \
  --screenshot=docs/screenshots/desktop-home.png \
  https://www.batutynas.lt/

# Re-generate PDFs
bash scripts/md-to-pdf.sh DESIGN-SYSTEM-INPUTS.md docs/design-system/design-inputs.pdf
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --print-to-pdf=docs/design-system/brand-style-guide.pdf \
  --print-to-pdf-no-header \
  file://$(pwd)/docs/design-system/brand-style-guide.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --print-to-pdf=docs/design-system/mood-board.pdf \
  --print-to-pdf-no-header \
  file://$(pwd)/docs/design-system/mood-board.html
```

---

*Generated 2026-05-19. Re-run the audit pipeline when batutynas.lt has a major content change.*
