# ARCHIVED — Legacy Chatwoot-era Chatbot

**DO NOT EDIT. DO NOT REFERENCE IN NEW WORK.**

This directory contains the old Chatwoot-era chatbot implementation. It has been **replaced** by the React-based chatbot at `frontend/src/components/ChatWidget.jsx` (served at http://localhost:5173/).

Archived on 2026-04-08 (Session 36).

## Contents

- `demo/` — standalone offline demo HTML chatbot (`demo/index.html`)
- `chat-widget/` — embeddable IIFE chat widget (`chat-widget.js` + `chat-widget.css`)
- `chatwoot/` — Chatwoot Agent Bot enricher (`enrich-chatwoot.js`) and test harnesses

## Why archived

The production chatbot is now the React ChatWidget inside `frontend/`. The Chatwoot agent-bot + standalone IIFE widget are no longer the canonical customer-facing surfaces. Any changes to chatbot UI, flows, add-ons, or form validation must happen in `frontend/src/components/ChatWidget.jsx`.

## If you need something from here

Reference, don't run. Copy the pattern to the React widget rather than re-activating these files.
