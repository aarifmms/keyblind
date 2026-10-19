# Agensi Listing Form - Keyblind

## Step 1 - Skill ZIP
Upload `keyblind-agensi.zip` (contains SKILL.md, config-template.json, setup.md). Frontmatter auto-populates Name + Summary.

## Step 2 - Skill Details

### Logo
Use `demo/thumbnail.png` or `browser-extension/icons/icon128.png`. Agensi recommends 512x512 - export that size from your logo source if you have it.

### Skill Name
Keyblind

### Summary (one line)
Encrypted secrets vault for AI agents - resolve API keys and tokens at runtime without leaking them to the LLM.

### Full Description
```
Encrypted secrets vault for AI agents. Store API keys, tokens, and passwords in an AES-256-GCM-encrypted vault and let your agent resolve them at runtime over MCP - the plaintext value never appears in the conversation transcript.

The problem: 100,000+ LLM conversations with exposed secrets were found indexed by search engines. AI agents read your .env files, copy-paste secrets into chat, and commit them accidentally.

How it works: secrets stay encrypted at rest and are resolved just-in-time through the MCP protocol. Your agent gets the value when it needs it, without the value ever touching the transcript. No cloud, no accounts, no telemetry - the vault lives on your machine and the encryption key is bound to it.

What you get:
- 16 MCP tools - secrets CRUD, TOTP 2FA, encrypted sharing, dead man's switch, .env sandbox, audit log
- One-command setup: npm i -g keyblind && keyblind setup-mcp
- Works with every MCP client - Claude Code, Cursor, Copilot, Windsurf, Cline, Zed
- Optional backends: 1Password, Bitwarden, env vars, AWS, GCP, Azure

Free: 5 secrets, all features. Fully usable - no purchase required.
```

## Step 3 - Demo

### The request (what the buyer types)
```
Deploy the billing worker. Pull STRIPE_LIVE_KEY and DATABASE_URL from Keyblind, then run the invoice sync.
```

### The result (what your agent delivers)
```
## Summary
Resolved 2 secrets at runtime and ran the sync. Neither value appeared in this transcript - the agent fetched them via Keyblind's MCP tools and injected them as environment variables.

| Secret | Status | Exposed in transcript |
| --- | --- | --- |
| STRIPE_LIVE_KEY | resolved | No |
| DATABASE_URL | resolved | No |

```bash
$ keyblind run -- node billing/sync.js
✔ Connected to database (production)
✔ Fetched 1,284 invoices from Stripe
✔ Synced 1,284 records in 3.2s
```

**What happened under the hood**
1. resolve_secret(STRIPE_LIVE_KEY) - value decrypted at runtime, never echoed
2. resolve_secret(DATABASE_URL) - same
3. Both injected into the process env for the sync script only

**Next steps**
- Set a 90-day rotation reminder for STRIPE_LIVE_KEY
- Add your recovery contact to the dead man's switch in case the vault is ever locked
```

## Step 4 - Compatibility

### Compatibility Note
```
Requires Node.js 18+. Works with any MCP client - Claude Code, Cursor, Copilot, Windsurf, Cline, Zed.
```

## Step 5 - Pricing

Pricing Model: **Free**

### Tags, Categories, Usecases
- Categories: Security, Developer Tools
- Tags: secrets, api-keys, environment-variables, mcp, security, totp, password-manager, devtools
- Usecases: Protect API keys, Secure .env files, 2FA code generation, Secret sharing

## Permissions

### Required tools & software (one per line)
```
Node.js 18+
keyblind (npm i -g keyblind)
An MCP client (Claude Code, Cursor, Copilot, Windsurf, Cline, or Zed)
```

### Tools Used
- Terminal / Shell: yes - runs the keyblind CLI
- Read Files: yes - reads .env for sandboxing
- Write Files: yes - writes the sandboxed .env
- Environment Variables: yes - injects secrets at runtime
- Network Access: optional - only for 1Password/Bitwarden/AWS/GCP/Azure backends; local vault needs none
- Browser: no

### Needs access
None by default - fully local. Optional: 1Password, Bitwarden, AWS, GCP, Azure.

### File Scopes
```
~/.keyblind/**
.env
*.env
```

### Notes
```
Fully local by design - no cloud, no accounts, no telemetry. Shell/file access is limited to the encrypted vault (~/.keyblind) and the .env files you explicitly sandbox. Network access is only used if you opt into a third-party backend (1Password, Bitwarden, AWS, GCP, Azure); the default local vault never makes a network call.
```

## Extra Details

### FAQ
```
Q: Where are my secrets stored?
A: In an AES-256-GCM-encrypted SQLite vault at ~/.keyblind on your machine. Nothing leaves your device.

Q: How is this different from putting keys in .env?
A: The plaintext never enters the LLM conversation. Agents resolve values at runtime over MCP, so keys don't leak into chat logs or transcripts the way pasted .env values do.

Q: Does it work with my editor?
A: Any MCP client - Claude Code, Cursor, Copilot, Windsurf, Cline, Zed. It's protocol-level, not editor-specific.

Q: What does the free tier include?
A: 5 secrets with all 16 tools and every feature.
```

### Screenshots (up to 6)
Suggested captures:
1. Landing page hero/pricing (keyblind.dev)
2. `keyblind list` CLI output - names only, values hidden
3. Dashboard secrets view (app.keyblind.dev)
4. A Claude Code session resolving a secret at runtime

### Demo video URL
Optional - skip for now.

### Documentation Link
https://github.com/aarifmms/keyblind
