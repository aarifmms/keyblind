**Title:** My Secrets Vault Now Makes AI Agents Ask Permission Before Writing

---

Keyblind just shipped v0.9.0, and it closes the last gap in how I think about agent secret access.

Until now, Keyblind could *stop* an AI agent from touching a secret it wasn't authorized for. What it couldn't do was *hold* a sensitive write for a human's sign-off. Deny, or allow immediately — nothing in between.

v0.9.0 adds human-in-the-loop approvals.

When an agent calls `store_secret` or `delete_secret` and approval is required, the request is queued as "pending" instead of executing. The held value is encrypted at rest. The human approves or denies from the CLI or the dashboard:

```bash
keyblind approvals require on        # gate all agent writes
keyblind approvals list              # see what's waiting
keyblind approvals approve <id>      # execute it
keyblind approvals deny <id>         # discard it
```

Approval is human-only by design — an agent can never approve its own action. Reads are never gated; only writes.

For anyone new here: Keyblind is an MCP server that encrypts your secrets and resolves them at runtime, so AI agents never see the real value.

- Works with every AI editor (Claude Code, Cursor, Copilot, Windsurf, Cline, Zed)
- 27 MCP tools, 7 backends, 40+ CLI commands
- Deterministic `.env` sandboxing (`keyblind sandbox`)
- Zero network, zero telemetry, zero accounts
- Open source, MIT

```bash
npm install -g keyblind
keyblind quickstart
```

GitHub: https://github.com/aarifmms/keyblind

If you let AI agents write secrets today, how do you review what they changed? Curious how other people are handling this.
