**Title:** I Built a Tool That Blinds AI to Your API Keys — Now It Makes Agents Ask Permission Before Writing

**Flair:** `Showcase`

**Body:**

Your `.env` file. Full of API keys, passwords, and tokens. Every AI coding tool reads it. And when they do, those secrets end up in conversation transcripts sometimes indexed by search engines forever. Security researchers found 100,000+ LLM conversations with exposed secrets in 2025.

Keyblind is an MCP server that encrypts your secrets and resolves them at runtime. AI agents never see the real values.

**How it works:**

- `keyblind sandbox` — replaces every real value in `.env` with a deterministic fake. Same fake every time, clean git diffs.
- AI agent reads `.env` → sees only fakes.
- `keyblind run -- npm test` — injects real secrets as env vars for that command only.
- `keyblind unsandbox` — restores real values when you're done.

**New in v0.9.0 — human-in-the-loop approvals.** Agents no longer write secrets unchecked. When approval is required, an agent's `store_secret` / `delete_secret` is queued as "pending" instead of executing — the human sponsor approves or denies it from the CLI or dashboard. Approval is human-only by design: an agent can never sign off on its own action, and reads are never gated.

```bash
keyblind approvals require on        # gate all agent writes
keyblind approvals approve <id>      # execute a queued write
keyblind approvals deny <id>         # discard it
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
