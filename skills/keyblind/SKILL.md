---
name: keyblind
description: Encrypted secrets vault for AI agents. Store API keys, tokens, and passwords encrypted at rest and resolve them at runtime over MCP so plaintext never appears in the conversation transcript. Use when an agent must store, retrieve, or sandbox secrets, generate TOTP codes, or share secrets.
---

# Keyblind — Blind AI to Your Keys

Encrypted secrets vault with MCP for AI agents. Secrets are resolved at runtime, never leaked to LLM conversations.

## When to Use

- The user asks to store an API key, token, or password securely.
- A secret must be resolved at runtime without its plaintext entering the transcript.
- The user wants to sandbox `.env` so agents only see deterministic fakes.
- The user needs a TOTP 2FA code, an encrypted share link, a team vault, or a dead man's switch.

## Instructions

1. Install and initialize the vault:

```bash
npm i -g keyblind
keyblind init          # create your encrypted vault (AES-256-GCM SQLite)
keyblind setup-mcp     # auto-configure MCP for Claude Code
```

2. Restart the agent, then use the MCP tools directly (`resolve_secret`, `store_secret`, `list_secrets`, …) or the CLI:

```bash
keyblind set MY_API_KEY        # store encrypted (prompts securely)
keyblind sandbox               # agents see deterministic fakes in .env
keyblind get MY_API_KEY        # resolve the decrypted value
keyblind run -- npm start      # run a command with secrets as env vars
keyblind list                  # names only — values never shown
```

## MCP Tools (27 total)

Secrets: `resolve_secret`, `store_secret`, `list_secrets`, `delete_secret`, `sandbox_env`, `unsandbox_env`, `audit_log`. TOTP 2FA: `totp_code`, `totp_store`, `totp_list`, `totp_delete`. Sharing: `create_share_link`, `receive_share`. Team vaults: `team_init`, `team_push`, `team_pull`, `team_list`, `team_resolve`, `team_delete`. Security: `deadman_status`, `deadman_checkin`, `sso_status`. Agent ledger: `register_agent`, `record_action`, `verify_ledger`, `list_agents`, `export_compliance`.

## Features

- **Works everywhere** — Claude Code, Cursor, Copilot, Windsurf, Cline, Zed (any MCP client)
- **Zero network, zero telemetry** — fully local, no cloud, no accounts
- **Machine-identity-bound key** — encryption key XOR-wrapped with a machine fingerprint
- **Deterministic `.env` sandbox fakes** — HMAC-SHA256 per project + key name

## Pricing

Free: 5 secrets with all 27 tools. Pro ($79/year) unlocks unlimited secrets, team vaults, audit log, secret rotation, and CI/CD integration.
