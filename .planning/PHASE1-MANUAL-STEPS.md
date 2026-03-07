# Phase 1: Manual Steps Required

These steps must be completed by the operator in n8n and Chatwoot admin panels.
Code changes have already been applied — these are the configuration steps.

---

## 1. Revoke & Rotate Chatwoot API Token (CRITICAL)

The token `<REDACTED-ROTATE-IN-CHATWOOT>` was exposed in git history.

**Steps:**
1. Log into Chatwoot Super Admin panel
2. Go to **Super Admin → Agent Bots** (or Platform Apps)
3. Find the bot used by n8n
4. Click **Regenerate Access Token**
5. Copy the new token
6. In n8n, go to **Settings → Variables**
7. Create variable: `CHATWOOT_API_TOKEN` = `<new-token>`
8. Test: send a message through the widget and verify Chatwoot receives it

**Verification:** Old token `<REDACTED-ROTATE-IN-CHATWOOT>` should return 401 when used.

---

## 2. Set Chatwoot Base URL Variable

**Steps:**
1. In n8n, go to **Settings → Variables**
2. Create variable: `CHATWOOT_BASE_URL` = `https://batutynas-chatwoot-chatwoot.0uvai5.easypanel.host/api/v1/accounts/1`

The code falls back to the hardcoded URL if the variable isn't set, but setting it explicitly is recommended.

---

## 3. Purge Old Token from Git History

**Prerequisites:** Install BFG Repo-Cleaner (`brew install bfg`)

**Steps:**
1. Create a backup: `git clone --mirror <repo-url> backup-repo.git`
2. Create a file `tokens.txt` with the exposed token:
   ```
   <REDACTED-ROTATE-IN-CHATWOOT>
   ```
3. Run BFG:
   ```bash
   bfg --replace-text tokens.txt backup-repo.git
   ```
4. Clean up:
   ```bash
   cd backup-repo.git
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```
5. Force push:
   ```bash
   git push --force
   ```
6. **Notify all collaborators** to re-clone the repository
7. Delete `tokens.txt`

**Verification:** `git log -p --all -S '<REDACTED-ROTATE-IN-CHATWOOT>'` returns no results.

---

## 4. Create Chat Bearer Token Credential

**Steps:**
1. Generate a secure random token:
   ```bash
   openssl rand -hex 32
   ```
2. In n8n, go to **Credentials → Add Credential**
3. Select **Header Auth**
4. Configure:
   - **Name:** `Chat Bearer Token`
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer <generated-token>`
5. Save the credential
6. Open the **Batutynas: Chat Support Agent v2** workflow
7. Click the **Chat Webhook** node
8. Verify the `Chat Bearer Token` credential is linked (should be automatic from JSON import)
9. Copy the token value for use in the widget embed snippet

---

## 5. Update Widget Embed Snippet

Update the production embed code on batutynas.lt to include the auth token:

```html
<script src="https://your-cdn/chat-widget.js"></script>
<link rel="stylesheet" href="https://your-cdn/chat-widget.css">
<script>
  BatutynasChat.init({
    webhookUrl: 'https://your-n8n-instance/webhook/batutynas-chat',
    authToken: '<paste-your-bearer-token-here>'
  });
</script>
```

**Note:** The `authToken` value is the same token used in step 4 (without the `Bearer ` prefix — the widget adds it automatically).

---

## 6. Create Error Workflow with Email Notification

**Steps:**
1. In n8n, create a new workflow: **"Batutynas: Error Handler"**
2. Add an **Error Trigger** node
3. Add a **Send Email** node connected to it:
   - **To:** `info@batutynas.lt` (or operator email)
   - **Subject:** `[Batutynas Bot] Workflow Error: {{ $json.workflow.name }}`
   - **Body:**
     ```
     Workflow: {{ $json.workflow.name }}
     Error: {{ $json.execution.error.message }}
     Time: {{ $json.execution.startedAt }}
     Execution ID: {{ $json.execution.id }}
     ```
4. Save and activate the error workflow
5. Go to **each chat workflow** → Settings → Error Workflow → select "Batutynas: Error Handler"
6. Test by intentionally causing an error (e.g., invalid credential)

**Verification:** Simulated error sends notification email.

---

## 7. Document FB Messenger HMAC Limitation (FR-1.5)

The FB Messenger workflow (`fb-messenger-main.json`) cannot verify HMAC signatures because n8n does not expose the raw request body needed for signature computation.

**Risk acceptance:**
- FB Messenger webhook is protected by the verification challenge (GET request token)
- The webhook URL itself acts as a shared secret
- Meta validates the Page Access Token on outbound messages
- This is an accepted limitation documented here per FR-1.5

---

## Checklist

- [ ] Chatwoot token revoked and new one set in n8n variable
- [ ] Chatwoot base URL set in n8n variable
- [ ] Git history purged of old token
- [ ] Chat Bearer Token credential created in n8n
- [ ] Widget embed snippet updated with authToken
- [ ] Error workflow created and linked to all chat workflows
- [ ] All workflows re-imported/synced with latest JSON
- [ ] End-to-end test: widget sends message → gets response
- [ ] End-to-end test: request without token → gets 401
