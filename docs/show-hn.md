**Title:** Show HN — Keyblind v0.9.0: An MCP Server That Blinds AI to Your API Keys

**URL:** https://github.com/aarifmms/keyblind

---

Your `.env` file has API keys, passwords, and tokens. Every AI coding tool (Claude Code, Cursor, Copilot) reads it. When they do, those secrets land in conversation transcripts — sometimes indexed by search engines forever. Researchers found 100,000+ exposed secrets in LLM transcripts last year.

Keyblind solves this. It's an MCP server that encrypts your secrets and resolves them at runtime. The AI agent never sees the real value.

**New in v0.9.0 — human-in-the-loop approvals.** When an agent tries to store or delete a secret and approval is required, the request queues as "pending" instead of executing. The held value is encrypted at rest; the human approves or denies from the CLI or dashboard. An agent can never approve its own action, and reads are never gated.

```bash
keyblind approvals require on        # gate all agent writes
keyblind approvals list              # see what's waiting
keyblind approvals approve <id>      # execute it
keyblind approvals deny <id>         # discard it
```

**The sandbox trick:**

```
# Real .env
OPENAI_API_KEY=sk-proj-abc123xyz
DATABASE_URL=postgresql://user:pass@localhost/db

# After `keyblind sandbox`
OPENAI_API_KEY=sandbox_f4e2a9b1c3d5_OPENAI_API_KEY
DATABASE_URL=sandbox_a1b2c3d4e5f6_DATABASE_URL
```

Same fakes every time (deterministic HMAC), so git diffs stay clean. AI agents see fakes. `keyblind run -- npm start` injects real values as env vars. `keyblind unsandbox` restores everything.

**Works everywhere.** One `.mcp.json` file. Claude Code, Cursor, Copilot, Windsurf, Cline, Zed — any editor that speaks MCP.

**Seven backends:** Local vault (AES-256-GCM), 1Password, Bitwarden, AWS/GCP/Azure secret managers, env vars. Mix and match.

**Zero network, zero telemetry, zero accounts.** Fully local. Encryption key bound to your machine — copy the vault to another machine, it won't decrypt.

**Comparison:** Cloak is VS Code/Cursor only. Keyblind is protocol-native — MCP support means every editor works today and tomorrow, plus a human-in-the-loop approval layer for agent writes.

```bash
npm install -g keyblind
keyblind init
echo "sk-your-key" | keyblind set OPENAI_API_KEY
keyblind sandbox
```

MIT licensed. Built with TypeScript, SQLite, and paranoia. 27 MCP tools, 7 backends, 40+ CLI commands, 145 tests.

I'd love feedback from the HN community — especially on the MCP-first approach vs editor-native alternatives, and how you'd want the approval workflow to behave.
