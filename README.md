# Keyblind — Blind AI to Your Keys

**Encrypted secrets vault with MCP for AI agents. One command configures every editor. Secrets resolved at runtime, never leaked to LLM conversations.**

[![npm version](https://img.shields.io/npm/v/keyblind)](https://www.npmjs.com/package/keyblind)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Why

Developers regularly leak API keys, passwords, and tokens to AI coding tools. 100,000+ LLM conversations with exposed secrets were found indexed by search engines in 2025.

AI agents read your `.env` files. They copy-paste secrets into conversations. They commit them accidentally. Keyblind stops this by keeping secrets encrypted at rest and resolving them _at runtime_ — the plaintext value never touches the LLM transcript.

## How It Works

```
┌──────────┐     ┌────────────────┐     ┌─────────────────┐
│ AI Agent │ ──→ │  Keyblind MCP  │ ──→ │  Encrypted      │
│ (Claude) │     │  Server        │     │  SQLite Vault   │
│          │ ←── │  (27 tools)    │ ←── │  (AES-256-GCM)  │
└──────────┘     └────────────────┘     └─────────────────┘
      ↑                                        │
      │ secret value never appears             │ secrets never
      │ in conversation transcript             │ stored in plaintext
```

## Quick Start

```bash
# 1. Install
npm i -g keyblind

# 2. One-command setup (initialize vault + configure Claude Code)
keyblind quickstart

# 3. Store secrets
echo "sk-proj-abc123" | keyblind set OPENAI_API_KEY
keyblind set DATABASE_URL -    # prompts securely

# 4. Sandbox your .env (AI agents see fakes)
keyblind sandbox

# 5. Resolve a secret
keyblind get OPENAI_API_KEY

# 6. Run commands with secrets injected as env vars
keyblind run -- npm start

# 7. List all secrets (names only, values hidden)
keyblind list
```

> **That's it.** After `keyblind quickstart`, restart Claude Code. Then just say _"list my keyblind secrets"_ or _"use my OPENAI_API_KEY"_ — the AI agent resolves secrets at runtime without ever seeing them in the transcript.

## MCP Server

Keyblind is **MCP-first** — it works with every AI tool that speaks the Model Context Protocol (Claude Code, Cursor, Copilot, Windsurf, Cline, Zed).

### Setup (automatic)

```bash
keyblind setup-mcp
```

This auto-configures Claude Code, Cline, and Zed to use Keyblind. Works from any directory.

For project-local editors (Cursor, Windsurf, Copilot, Cline project mode), run from your project root:

```bash
keyblind setup-mcp --local
```

See [editor-specific configs](docs/editors.md) for details and manual setup.

### Setup (manual)

Add a `.mcp.json` to your project root, or use `claude mcp add`:

```bash
claude mcp add --scope user keyblind -- keyblind start
```

With biometric gate (Touch ID required before secrets are resolved):

```bash
keyblind unlock                      # Authenticate first
claude mcp add keyblind -- keyblind start --biometric
```

> Session expires after 15 minutes. Requires Pro or Team license.

### MCP Tools

| Tool | Description |
|------|-------------|
| `resolve_secret` | Resolve a secret at runtime (value hidden from transcript) |
| `store_secret` | Encrypt and store a secret |
| `list_secrets` | List secret names (values never revealed) |
| `delete_secret` | Delete a secret |
| `sandbox_env` | Replace `.env` values with deterministic fakes |
| `unsandbox_env` | Restore real `.env` values from vault |
| `audit_log` | View secret resolution audit trail |
| `totp_code` | Generate a TOTP 2FA code for a stored config |
| `totp_store` | Store a TOTP configuration from otpauth:// URI |
| `totp_list` | List all stored TOTP configurations |
| `totp_delete` | Delete a TOTP configuration |
| `create_share_link` | Create encrypted, expiring share link for a secret |
| `receive_share` | Receive and decrypt a shared secret |
| `deadman_status` | Check dead man's switch status |
| `deadman_checkin` | Reset dead man's switch timer |
| `team_init` | Create a shared team vault (encrypted SQLite) |
| `team_push` | Push a local secret to the team vault |
| `team_pull` | Import all secrets from the team vault |
| `team_list` | List secret names in the team vault |
| `team_resolve` | Resolve (decrypt) a secret from the team vault |
| `team_delete` | Delete a secret from the team vault |
| `sso_status` | Check SSO/OIDC authentication status |
| `register_agent` | Register an AI agent bound to a human sponsor |
| `record_action` | Append a signed action to the tamper-proof ledger |
| `verify_ledger` | Verify ledger integrity (hash chain + signatures) |
| `list_agents` | List registered AI agents |
| `export_compliance` | Export the agent ledger as a compliance report |

## Web Dashboard

Manage your secrets from a browser — **no sign-in or pairing required**. Open the local dashboard:

```bash
keyblind dashboard
```

This starts the local server and opens `http://localhost:4318/` in your browser. The dashboard is served same-origin with the REST API, so it works in every browser with no CORS, no pairing token, and no login. Features:

- View, add, copy, and delete secrets
- Audit log with full access history
- License management (tier, email, expiry)
- Pro/Team tier status
- Per-secret access policies and rotation reminders
- Agent action approvals (approve/deny queued agent writes)
- Central control plane (org-wide visibility + signed revocation)

A hosted control plane (`hosted/`) adds orgs, roles, groups, a signed
revocation + group-scope manifest, multi-provider SSO login (with org
auto-provisioning, multi-org switching, and IdP end-session revocation), and
short-lived agent credentials. See `docs/enterprise.md` (Phase 2).

## Browser Extension

The **Keyblind Chrome Extension** detects and blocks secrets from being pasted into AI chat interfaces (Claude.ai, ChatGPT, Copilot).

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ljobkicejnncijfmnkkedpgngbaalnmd?label=Chrome%20Web%20Store&color=4285F4)](https://chromewebstore.google.com/detail/keyblind-%E2%80%94-blind-ai-to-yo/ljobkicejnncijfmnkkedpgngbaalnmd)

Features:
- Detects 12+ API key formats (OpenAI, GitHub, Stripe, AWS, etc.)
- Intercepts paste events on AI chat sites
- Warning banner when secrets are detected
- Popup with vault connection status

Located in `browser-extension/`. Load as unpacked extension from `chrome://extensions`.

## Pricing

| | Free | Pro | Team |
|------|------|-----|------|
| **Price** | $0 | $79/year | $29/user/month |
| **Secrets** | 5 | Unlimited | Unlimited |
| **Local vault** | ✓ | ✓ | ✓ |
| **Sandbox / Unsandbox** | ✓ | ✓ | ✓ |
| **MCP server** | ✓ | ✓ | ✓ |
| **Dashboard** | ✓ | ✓ | ✓ |
| **Browser extension** | ✓ | ✓ | ✓ |
| **7 backends** | ✓ | ✓ | ✓ |
| **Team vaults** | — | ✓ | ✓ |
| **Audit log** | — | ✓ | ✓ |
| **Secret sharing** | — | ✓ | ✓ |
| **Dead man's switch** | — | ✓ | ✓ |
| **TOTP 2FA** | — | ✓ | ✓ |
| **Biometric gate** | — | ✓ | ✓ |
| **SSO/OIDC** | — | — | ✓ |
| **CI/CD integration** | — | ✓ | ✓ |

```bash
# Buy a license at keyblind.dev, then activate:
keyblind activate <your-license-key>

# Check your status
keyblind status
```

## Backends

Keyblind supports multiple secret backends:

```bash
keyblind backends                          # List available backends
keyblind backend 1password                 # Switch to 1Password
keyblind backend bitwarden                 # Switch to Bitwarden
```

| Backend | Read | Write | Requires |
|---------|------|-------|----------|
| **local** (default) | ✓ | ✓ | Nothing |
| **1password** | ✓ | ✓ | `op` CLI |
| **bitwarden** | ✓ | — | `bw` CLI |
| **env** | ✓ | — | Nothing |
| **aws** | ✓ | ✓ | `aws` CLI |
| **gcp** | ✓ | ✓ | `gcloud` CLI |
| **azure** | ✓ | ✓ | `az` CLI |

## Keyblind vs Cloak

| | Keyblind | Cloak |
|------|----------|-------|
| **Protocol** | MCP (all editors) | VS Code extension only |
| **Editors** | Claude Code, Cursor, Copilot, Windsurf, Cline, Zed | VS Code, Cursor |
| **Storage** | AES-256-GCM SQLite | AES-256-GCM file |
| **Backends** | Local, 1Password, Bitwarden, Env, AWS, GCP, Azure | Local only |
| **Sandbox** | Deterministic HMAC fakes | AES-256-GCM encrypted |
| **Web dashboard** | ✓ (localhost:4318) | — |
| **Browser extension** | ✓ (Chrome) | — |
| **TOTP 2FA** | ✓ | — |
| **Secret sharing** | ✓ (encrypted URL fragment) | — |
| **Dead man's switch** | ✓ | — |
| **Touch ID** | ✓ (macOS biometric gate) | ✓ |
| **CI/CD** | `keyblind run` for env injection | — |
| **Network** | Zero (fully local) | Zero |
| **License** | MIT | Proprietary |
| **Free tier** | ✓ (5 secrets) | ✓ |
| **Pro** | $79/year (unlimited) | — |

## Security

- **AES-256-GCM** encryption with PBKDF2 key derivation (600K iterations)
- **Machine-identity-bound key** — encryption key XOR-wrapped with machine fingerprint
- **Zero network, zero telemetry** — no cloud, no accounts, no analytics
- **Vault stored at `~/.keyblind/`** with `0700` permissions
- **Deterministic sandbox fakes** using HMAC-SHA256 per project + key name

## Verifying Your Install

Releases are built and published from GitHub Actions with npm provenance, which
attests the tarball was produced from this repository's CI rather than a
developer machine.

```bash
npm audit signatures        # Verify npm registry signatures
```

To verify build provenance for a release, open the release page at
https://github.com/aarifmms/keyblind/releases and check the "Provenance" and
"Attestations" sections, which link the tarball to the exact commit and workflow
run that built it.

- **Small dependency graph** — the CLI depends on three packages only (MCP SDK,
  better-sqlite3, zod). Server-only deps (Stripe, Resend, the Vercel CLI) live in
  the `hosted/` and `dashboard/` packages and are not installed by
  `npm i -g keyblind`.
- **No source maps** — the published tarball ships compiled JavaScript with no
  embedded original source.

## CLI Reference

```
keyblind quickstart           One-command setup (init + configure Claude Code)
keyblind init                 Initialize the encrypted vault
keyblind set <name>           Store a secret (value from stdin)
keyblind set <name> -         Store a secret (prompts securely)
keyblind get <name>           Resolve and print a secret
keyblind list                 List all stored secrets
keyblind delete <name>        Delete a secret
keyblind setup-mcp            Auto-configure MCP for Claude Code, Cline, Zed
keyblind setup-mcp --local    Write project MCP configs (Cursor, Windsurf, Copilot, Cline)
keyblind sandbox [.env]       Replace .env with deterministic fakes
keyblind unsandbox [.env]     Restore real .env values
keyblind run <command...>     Run command with secrets as env vars
keyblind start                Start MCP server (stdio — for AI agents)
keyblind start --http         Start HTTP server (dashboard + MCP + REST API)
keyblind dashboard            Open the web dashboard in your browser
keyblind start --biometric    Start MCP server with biometric requirement
keyblind backends             List available backends
keyblind backend <name>       Switch backend
keyblind activate <key>       Activate a Pro/Team license
keyblind deactivate           Remove current license
keyblind status               Show license and vault status
keyblind audit                Show secret resolution audit log
keyblind check --expired      List secrets past expiry
keyblind rotate <name>        Update a secret value
keyblind rotate <name> --generate  Rotate with an auto-generated value
keyblind rotate <name> --exec "<cmd>"  Rotate via an external command's stdout
keyblind rotate --overdue [days]    Rotate all secrets past the threshold
keyblind rotate-needed [days] List secrets not rotated in N days (default 90)
keyblind agents list         List registered AI agents
keyblind agents register <name> <sponsor> [scope]  Register an agent (prints signing key)
keyblind agents verify       Verify agent ledger integrity
keyblind agents export [json|csv]  Export compliance report
keyblind agents enforce on|off  Require signed agent identity for secret access
keyblind policy set <secret> <policy>  Restrict which agents may access a secret
keyblind policy list          List per-secret policies
keyblind approvals list       List pending approval requests
keyblind approvals approve <id>  Approve and execute a pending request
keyblind approvals deny <id>  Deny a pending request
keyblind approvals require on|off  Require approval for all agent writes
keyblind approvals require <secret>  Require approval for a specific secret
keyblind approvals unrequire <secret>  Stop requiring approval for a secret
keyblind control-plane init   Generate the org signing keypair
keyblind control-plane export  Export a signed, value-free control-plane bundle
keyblind control-plane trust <pubkey>  Trust an org public key (honor its deny list)
keyblind control-plane untrust <pubkey>  Remove a trusted org public key
keyblind control-plane trusted  List trusted org public keys
keyblind control-plane apply <file>  Import a signed deny list (revoked agents)
keyblind control-plane revoke <agentId> [reason]  Revoke an agent locally
keyblind control-plane unrevoke <agentId>  Un-revoke an agent locally
keyblind control-plane connect <url>  Connect to a hosted control plane (org API base)
keyblind control-plane sync   Pull + apply the signed manifest (deny list + group grants)
keyblind control-plane disconnect  Forget the hosted control-plane connection
keyblind control-plane status  Show the current connection (if any)
keyblind scan-repo [--all]    Scan tracked files (or full history) for secrets
keyblind setup-ci             Write a GitHub Actions secret-scan workflow
keyblind ci export            Export an encrypted bundle for CI injection (Pro)
keyblind ci inject            Decrypt a bundle and write secrets to $GITHUB_ENV
keyblind ci setup             Write a GitHub Actions workflow for CI injection
keyblind team init [path]     Create a shared team vault
keyblind team push <name>     Push a secret to team vault
keyblind team pull            Pull secrets from team vault
keyblind team list            List secrets in team vault
keyblind totp set <name>      Store TOTP 2FA config
keyblind totp code <name>     Generate current TOTP code
keyblind totp list            List all TOTP configs
keyblind totp delete <name>   Delete a TOTP config
keyblind share <name>         Create encrypted share link
keyblind receive <url>        Receive a shared secret
keyblind deadman setup        Configure dead man's switch
keyblind deadman checkin      Reset dead man's switch timer
keyblind deadman status       Show dead man's switch status
keyblind deadman disable      Disable dead man's switch
keyblind sso configure        Set up SSO/OIDC for team access
keyblind sso login            Authenticate via browser SSO
keyblind sso logout           Clear SSO session
keyblind sso status           Show SSO auth status
keyblind doctor               Run vault health check
keyblind generate <name>      Generate a strong random secret
keyblind import [.env]        Bulk import from .env file
keyblind export               Export all secrets
keyblind completions [shell]  Generate shell completion script
```

## Development

```bash
git clone https://github.com/aarifmms/keyblind.git
cd keyblind
npm install
npm run build       # Compile TypeScript
npm test            # Run tests
npm run dev         # Watch mode
```

## License

MIT
