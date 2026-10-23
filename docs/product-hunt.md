# Product Hunt Update — Keyblind v0.9.0

**Original launch:** Tuesday, June 9, 2026 — 12:01 AM PT
**This update:** v0.9.0 — human-in-the-loop approval for agent writes

---

## Listing

| Field | Value |
|-------|-------|
| **Product Name** | Keyblind |
| **URL** | https://keyblind.dev |
| **Tagline** | Encrypted secrets vault that blinds AI agents to your API keys |
| **Topics** | Developer Tools, Open Source, Security, CLI, Privacy |

## Description (260 chars max)

```
MCP-native secrets vault. Encrypt API keys, sandbox .env files with
deterministic fakes, resolve at runtime. AI agents never see real values.
27 MCP tools, 7 backends, 40+ CLI commands. Works with Claude Code,
Cursor, Copilot, Windsurf, Cline, Zed. MIT. Zero telemetry.
```

## Thumbnail

- 635x635px PNG (already generated at `demo/thumbnail.png`)
- Dark background (#0d1117), Keyblind logo, text: "Blind AI to Your Keys"

---

## Gallery Images (1270x760px — 5 images)

### Image 1: The Problem
Terminal showing `cat .env` with real API keys exposed.
Caption: "AI agents read your .env. Secrets leak into transcripts. 100K+ already found indexed."

### Image 2: Sandboxed
Terminal showing `keyblind sandbox` output with deterministic fakes.
Caption: "After sandboxing: deterministic HMAC-SHA256 fakes. Clean git diffs. Same fake every time."

### Image 3: Feature Grid
Show the full feature set: vault, sandbox, TOTP, sharing, dead man's switch, team vaults, dashboard, approvals.
Caption: "27 MCP tools, 7 backends, 40+ CLI commands. Plus human-in-the-loop approval for agent writes."

### Image 4: Keyblind vs Cloak
Comparison table from landing page.
Caption: "Why Keyblind: MCP-native (not editor-specific), 27 tools vs 3, 7 backends vs 1, deterministic sandbox."

### Image 5: Web Dashboard
Screenshot of the local dashboard (localhost:4318) showing sidebar, secrets list, and the Approvals page.
Caption: "Web dashboard at localhost:4318. No login or pairing. Manage secrets, TOTP, sharing, team vaults, approvals."

---

## Update Post (maker update, post after v0.9.0 ships)

```
Since launching on Product Hunt in June, Keyblind has shipped a lot.
v0.9.0 lands today with the last big gap in the Know Your Agent story:
human-in-the-loop approvals.

Agents no longer write secrets unchecked. When approval is required, an
agent's store_secret / delete_secret is queued as "pending" instead of
executing — the held value is encrypted at rest, and the human sponsor
approves or denies it from the CLI or the dashboard. Approval is
human-only by design: an agent can never sign off on its own action.
Reads are never gated.

What's shipped since launch:

- v0.9.0 — Agent action approvals (human-in-the-loop), hash-chained
  approval ledger, dashboard Approvals page, hosted license login
- v0.8.8 — One-command onboarding (`keyblind quickstart`) + multi-editor
  MCP setup (Claude Code, Cline, Zed globally; Cursor/Windsurf/Copilot
  via `setup-mcp --local`)
- v0.8.0 — CI/CD secret injection (Pro), provider-agnostic secret
  rotation (`keyblind rotate --exec`), repo secret scanning + CI workflow
- 145 tests passing, zero production audit vulnerabilities, signed npm
  provenance via staged publishing

Key differentiator from Cloak: Keyblind is MCP-native — works with every
AI editor, not just VS Code. 7 backends vs 1. Deterministic sandbox vs
random placeholders. Plus a human-in-the-loop approval layer Cloak
doesn't have.

Pricing:
- Free: 5 secrets, all 7 backends, all 27 MCP tools
- Pro ($79/year): Unlimited secrets, team vaults, audit log, CI/CD,
  secret rotation, biometric gate, cloud backends

Stack: TypeScript, SQLite (better-sqlite3), Node.js crypto. Zero network,
zero telemetry, zero accounts. MIT licensed.

Just dogfooded Keyblind to publish itself to npm — stored the publish
token in the vault, ran `keyblind run -- npm publish`. It works.

Ask me anything!
```

---

## Launch Checklist

- [ ] Confirm maker profile / access to the existing Keyblind listing at producthunt.com
- [ ] Write the update post (ready above)
- [ ] Refresh gallery images if any screenshot is outdated
- [ ] Post the update after v0.9.0 is live on npm
- [ ] Share on Twitter/X and LinkedIn
- [ ] Respond to every PH comment within the first 4 hours
- [ ] Add "Featured on Product Hunt" badge to landing page (if not already)
