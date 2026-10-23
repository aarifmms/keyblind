**Title:** My Secrets Vault Now Ships an Org-Wide Control Plane for Your Agents

---

Keyblind just shipped v0.9.1, and it's the governance layer I've been building toward.

Approvals (v0.9.0) answered "should this agent act?" The central control plane answers the harder question: "what did every agent do, across the whole org, and can I revoke them from one place?"

Keyblind is local-first by design — no hosted vault to breach, no telemetry. The tradeoff has always been that there's no central point of control. v0.9.1 bridges that without breaking zero-network.

`keyblind control-plane export` produces a signed, value-free bundle: every secret's name and rotation age, every agent's identity and scope, every approval, and the full ledger with its integrity verdict. No secret values, no ciphertext. Commit it to a git repo and you have a read-only org view.

`keyblind control-plane apply` imports a signed deny list. Revoke an agent in one place, and every machine that trusts the org key denies it — read and write, at the same choke point that enforces scope.

```bash
keyblind control-plane init               # generate an org Ed25519 keypair
keyblind control-plane export             # signed org report
keyblind control-plane trust <pubkey>     # member machines trust the org key
keyblind control-plane apply <file>       # import a signed deny list
```

For anyone new here: Keyblind is an MCP server that encrypts your secrets and resolves them at runtime, so AI agents never see the real value.

- Works with every AI editor (Claude Code, Cursor, Copilot, Windsurf, Cline, Zed)
- 27 MCP tools, 7 backends, 40+ CLI commands
- Deterministic `.env` sandboxing (`keyblind sandbox`)
- Human-in-the-loop approvals + central control plane
- Zero network, zero telemetry, zero accounts
- Open source, MIT

```bash
npm install -g keyblind
keyblind quickstart
```

GitHub: https://github.com/aarifmms/keyblind

How are you auditing what your AI agents actually did last week? Curious what people are using for the org-wide view.
