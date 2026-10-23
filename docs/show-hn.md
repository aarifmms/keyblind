**Title:** Show HN — Keyblind v0.9.1: An MCP Server That Blinds AI to Your Keys, Now With an Org-Wide Control Plane

**URL:** https://github.com/aarifmms/keyblind

---

Your `.env` file has API keys, passwords, and tokens. Every AI coding tool (Claude Code, Cursor, Copilot) reads it. When they do, those secrets land in conversation transcripts — sometimes indexed by search engines forever. Researchers found 100,000+ exposed secrets in LLM transcripts last year.

Keyblind solves this. It's an MCP server that encrypts your secrets and resolves them at runtime. The AI agent never sees the real value.

**New in v0.9.1 — a central control plane.** Approvals (v0.9.0) answered "should this agent act?" The control plane answers "what did every agent do across the org, and can I revoke them from one place?"

```bash
keyblind control-plane init               # org Ed25519 keypair
keyblind control-plane export             # signed, value-free org report
keyblind control-plane trust <pubkey>     # member machines trust the org key
keyblind control-plane apply <file>       # import a signed deny list
```

`export` produces a signed JSON bundle with secret names + rotation age, agent identities and scopes, approvals, and the full ledger with its integrity verdict — no secret values, no ciphertext. Commit it to a git repo as a read-only org view. `apply` imports a signed deny list; a revoked agent is denied read and write on every machine that trusts the org key.

**Human-in-the-loop approvals (v0.9.0).** When an agent tries to store or delete a secret and approval is required, the request queues as "pending" instead of executing. The human approves or denies from the CLI or dashboard. An agent can never approve its own action, and reads are never gated.

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

**Comparison:** Cloak is VS Code/Cursor only. Keyblind is protocol-native — MCP support means every editor works today and tomorrow, plus approvals and a central control plane for org governance.

```bash
npm install -g keyblind
keyblind init
echo "sk-your-key" | keyblind set OPENAI_API_KEY
keyblind sandbox
```

MIT licensed. Built with TypeScript, SQLite, and paranoia. 27 MCP tools, 7 backends, 40+ CLI commands, 155 tests.

I'd love feedback from the HN community — especially on the local-first control plane: is a git-synced, signed export the right call vs a hosted SaaS dashboard?
