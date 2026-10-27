---
name: keyblind
description: Encrypted secrets vault for AI agents. Store API keys, tokens, and passwords encrypted at rest and resolve them at runtime over MCP so plaintext never appears in the conversation transcript. Use when an agent needs to store, retrieve, or sandbox secrets.
---

# Keyblind - Blind AI to Your Keys

Encrypted secrets vault with MCP for AI agents. Secrets are resolved at runtime, never leaked to LLM conversations.

## Why

100,000+ LLM conversations with exposed secrets were found indexed by search engines. AI agents read `.env` files, copy-paste secrets into chat, and commit them accidentally. Keyblind keeps secrets encrypted at rest (AES-256-GCM SQLite vault) and resolves them just-in-time over the Model Context Protocol - the plaintext value never touches the transcript.

## Install

```bash
npm i -g keyblind      # install
keyblind init          # create your encrypted vault
keyblind setup-mcp     # auto-configure MCP for Claude Code
```

For other editors, add `config-template.json` to your MCP config:

```json
{
  "mcpServers": {
    "keyblind": {
      "command": "keyblind",
      "args": ["start"]
    }
  }
}
```

Then restart your agent.

## Use

```bash
keyblind set MY_API_KEY      # store encrypted (prompts securely)
keyblind sandbox                 # agents see deterministic fakes in .env
keyblind get MY_API_KEY      # resolve the decrypted value
keyblind run -- npm start        # run a command with secrets as env vars
keyblind list                    # names only - values never shown
```

The agent calls MCP tools such as `resolve_secret`, `store_secret`, `list_secrets`, `totp_code`, `create_share_link`, and more (27 tools total).

## Features

- **27 MCP tools** - secrets CRUD, TOTP 2FA, encrypted sharing, team vaults, dead man's switch, `.env` sandbox, audit log, agent ledger
- **Works everywhere** - Claude Code, Cursor, Copilot, Windsurf, Cline, Zed
- **Zero network, zero telemetry** - fully local, no cloud, no accounts
- **Machine-identity-bound key** - encryption key wrapped with a machine fingerprint

## Free

Free and fully usable - all 27 tools included, no purchase required.
