**Title:** I Built a Tool That Blinds AI to Your Keys — Now It Ships an Org-Wide Control Plane for Agents

**Flair:** `Showcase`

**Body:**

Your `.env` file. Full of API keys, passwords, and tokens. Every AI coding tool reads it. And when they do, those secrets end up in conversation transcripts sometimes indexed by search engines forever. Security researchers found 100,000+ LLM conversations with exposed secrets in 2025.

Keyblind is an MCP server that encrypts your secrets and resolves them at runtime. AI agents never see the real values.

**New in v0.9.1 — a central control plane.** Until now, the agent ledger, approvals, and secret rotation state were local-only. Great for privacy, but a security team had no org-wide answer to "who accessed what?" Now `keyblind control-plane export` produces a signed, value-free bundle (secret names + rotation age, agent identities, approvals, the full ledger) that you commit to a git repo as a read-only org view. And `control-plane apply` imports a signed deny list to revoke an agent on every machine that trusts the org key.

**How it works:**

- `keyblind sandbox` — replaces every real value in `.env` with a deterministic fake. Same fake every time, clean git diffs.
- AI agent reads `.env` → sees only fakes.
- `keyblind run -- npm test` — injects real secrets as env vars for that command only.
- `keyblind unsandbox` — restores real values when you're done.

**Human-in-the-loop approvals (v0.9.0).** Agents no longer write secrets unchecked. When approval is required, an agent's `store_secret` / `delete_secret` is queued as "pending" instead of executing — the human sponsor approves or denies it from the CLI or dashboard. Approval is human-only by design.

```bash
keyblind control-plane export            # signed org report
keyblind control-plane revoke <agentId>  # revoke an agent org-wide
keyblind approvals require on            # gate all agent writes
```

**Works everywhere:** Claude Code, Cursor, Copilot, Windsurf, Cline, Zed — one `.mcp.json` file.

**Zero network, zero telemetry, zero accounts.** AES-256-GCM encrypted. Keys bound to your machine. 27 MCP tools, 7 backends.

```bash
npm install -g keyblind
keyblind init
echo "sk-your-key" | keyblind set OPENAI_API_KEY
keyblind sandbox
```

GitHub: https://github.com/aarifmms/keyblind

*Disclosure: I built this. MIT-licensed open source, completely free. No cloud, no analytics, no network calls. Your secrets never leave your machine.*
