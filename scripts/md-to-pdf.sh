#!/bin/bash
# Convert markdown file to a nicely-styled PDF using Chrome headless.
# Usage: md_to_pdf.sh <input.md> <output.pdf> <title>

set -euo pipefail

MD="$1"
PDF="$2"
TITLE="${3:-Document}"
TMP_HTML=$(mktemp -t md2pdf).html
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 1. Convert markdown to HTML via markdown-it
/Users/dovydasdobrovolskis/.claude/venvs/tools/bin/python3 - <<PYEOF > "$TMP_HTML"
import sys
from markdown_it import MarkdownIt

with open("$MD", encoding="utf-8") as f:
    md_text = f.read()

md = MarkdownIt("default", {"html": True, "typographer": True})
md.enable("table")
md.enable("strikethrough")
html_body = md.render(md_text)

print(f"""<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<title>$TITLE</title>
<style>
  @page {{ size: A4; margin: 1.8cm 1.6cm 1.8cm 1.6cm; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #222;
    max-width: 100%;
  }}
  h1 {{
    font-size: 22pt;
    font-weight: 700;
    color: #7c3aed;
    border-bottom: 3px solid #7c3aed;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 18px;
  }}
  h2 {{
    font-size: 15pt;
    font-weight: 700;
    color: #4c1d95;
    margin-top: 24px;
    margin-bottom: 10px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    page-break-after: avoid;
  }}
  h3 {{
    font-size: 11.5pt;
    font-weight: 600;
    color: #374151;
    margin-top: 14px;
    margin-bottom: 6px;
    page-break-after: avoid;
  }}
  p {{ margin: 6px 0; }}
  ul, ol {{ margin: 4px 0 8px 0; padding-left: 22px; }}
  li {{ margin: 2px 0; }}
  code {{
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 9pt;
    background: #f3f4f6;
    color: #111;
    padding: 1px 5px;
    border-radius: 3px;
  }}
  pre {{
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 9pt;
    overflow-x: auto;
    page-break-inside: avoid;
  }}
  pre code {{ background: transparent; padding: 0; font-size: 9pt; }}
  table {{
    border-collapse: collapse;
    margin: 8px 0;
    width: 100%;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }}
  th, td {{
    border: 1px solid #d1d5db;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }}
  th {{
    background: #f9fafb;
    font-weight: 600;
    color: #111;
  }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  blockquote {{
    border-left: 3px solid #a78bfa;
    background: #f5f3ff;
    padding: 6px 12px;
    margin: 8px 0;
    color: #4c1d95;
    font-style: normal;
  }}
  hr {{
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 18px 0;
  }}
  a {{ color: #7c3aed; text-decoration: none; }}
  strong {{ color: #111; }}
  /* avoid awkward page breaks inside short tables / callouts */
  table, blockquote, pre {{ page-break-inside: avoid; }}
</style>
</head>
<body>
{html_body}
</body>
</html>""")
PYEOF

# 2. Render via Chrome headless
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="$PDF" \
  --no-margins \
  --virtual-time-budget=2000 \
  "file://$TMP_HTML" 2>/dev/null

echo "✓ $PDF ($(du -h "$PDF" | cut -f1))"
rm -f "$TMP_HTML"
