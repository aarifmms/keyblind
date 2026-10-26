# Keyblind — Blind AI to Your Keys

> **Encrypted secrets vault with MCP for AI agents. Secrets resolved at runtime, never leaked to LLM conversations.**

## Tech Stack

- **Runtime**: Node.js (TypeScript, ESM)
- **Encryption**: AES-256-GCM (Node crypto)
- **Storage**: SQLite (better-sqlite3)
- **Protocol**: MCP (Model Context Protocol) via stdio + Streamable HTTP transport
- **Backends**: Local vault, 1Password CLI, Bitwarden CLI, env vars, AWS, GCP, Azure

## Project Structure

```
src/
├── vault.ts         → AES-256-GCM encryption + SQLite store (secrets, history, rotation tables)
├── server.ts        → MCP server (27 tools) + REST API for dashboard
├── sandbox.ts       → .env sandbox with deterministic fakes (HMAC-SHA256)
├── backends.ts      → Multi-backend abstraction (local, 1Password, Bitwarden, env, AWS, GCP, Azure)
├── cli.ts           → CLI entry point (80+ commands/subcommands)
├── index.ts         → Public API exports
├── version.ts       → Version constant
├── totp.ts          → TOTP/HOTP 2FA code generation (zero deps)
├── share.ts         → Encrypted secret sharing via URL fragments
├── deadman.ts       → Dead man's switch with email notification
├── sso.ts           → SSO/OIDC authentication for team vaults
├── setup-mcp.ts     → Auto-configure MCP for Claude Code (`keyblind setup-mcp`)
├── auth.ts          → Biometric authentication gate
├── license.ts       → Ed25519 license key verification
├── team.ts          → Shared team vaults (git-safe)
├── sync.ts          → Version history, rollback, sync bundles
├── doctor.ts        → Vault health check
├── config.ts        → Project configuration (.keyblind)
├── completions.ts   → Shell completions (bash, zsh, fish)
├── hook.ts          → Pre-commit hook + repo secret scanning
├── watch.ts         → Watch .env and auto-sandbox
├── alerts.ts        → Slack/Discord webhook alerts
├── keychain.ts      → Cross-platform key storage (macOS Keychain / libsecret / DPAPI)
├── ledger.ts        → Know Your Agent ledger (append-only, hash-chained, Ed25519-signed)
├── approvals.ts     → Human-in-the-loop agent write approvals
├── ci.ts            → CI/CD secret injection (bundles → $GITHUB_ENV)
├── control-plane.ts → Central control plane (signed value-free export + deny list)
├── org-sync.ts      → Hosted control-plane sync (group→scope manifest)
├── agent-token.ts   → Short-lived org-issued agent tokens
├── rotation.ts      → Provider-agnostic rotation engine (rollback window)
└── rotation/        → Provider adapters
    ├── aws.ts       → AWS IAM access-key rotation
    ├── gcp.ts       → GCP service-account key rotation
    └── azure.ts     → Azure app client-secret rotation

dashboard/            → Local web dashboard (served at localhost:4318)
hosted/               → Hosted Next.js app (app.keyblind.dev — purchase + control plane)
landing/              → Marketing site (keyblind.dev)
browser-extension/    → Chrome extension (MV3, paste interception)
terraform-provider-keyblind/ → Terraform provider (Go)
```

## Commands

```bash
npm run build    # Compile TypeScript
npx tsc --watch  # Dev mode
```

## New User Flow

```bash
npm i -g keyblind     # Install
keyblind init         # Create vault
keyblind setup-mcp    # Auto-configure Claude Code MCP
# Restart Claude Code — done
```

`keyblind setup-mcp` runs `claude mcp add --scope user keyblind -- keyblind start` under the hood. Works from any directory.

## Key Decisions

- **MCP-first, not editor-first.** Works with every AI tool that speaks MCP (Claude Code, Cursor, Copilot, Windsurf, Cline, Zed), not just VS Code.
- **27 MCP tools** — secrets, TOTP, sharing, team vaults, dead man's switch, SSO, sandbox, agent ledger.
- **REST API alongside MCP** — same server supports browser dashboard at `app.keyblind.dev`.
- **Deterministic sandbox fakes** using HMAC-SHA256(project hash + key name) so git diffs stay clean.
- **Machine-identity-bound key** — encryption key XOR-wrapped with machine fingerprint.
- **Zero network, zero telemetry** — fully local, no cloud, no accounts.
- **Ed25519 license keys** — `keyblind.<base64url-payload>.<base64url-sig>` format, verified client-side.

## External Services

| Service | Purpose | Config |
|---------|---------|--------|
| **Vercel** | Dashboard hosting | `app.keyblind.dev` |
| **Stripe** | License payments | Webhook → `api/webhooks/stripe` |
| **Resend** | License key emails | `license@keyblind.dev` |

## Direct Competitor

**Cloak** (getcloak.dev, launched May 25 2026) — Rust CLI + VS Code extension. Sandboxes .env files with AES-256-GCM, Touch ID gate. No MCP support. VS Code/Cursor only.
