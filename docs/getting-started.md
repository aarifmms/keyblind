# Getting Started

## Installation

```bash
npm install -g keyblind
```

## Initialize Your Vault

```bash
keyblind init
```

You'll be prompted to create a passphrase. This passphrase encrypts your vault. **Do not lose it** — there is no recovery mechanism.

## Upgrade to Pro

The free tier works immediately after `keyblind init`: 5 secrets, all 7 backends, and all 27 MCP tools. No account or purchase needed.

To unlock unlimited secrets plus team vaults, audit log, secret rotation, and CI/CD integration:

1. Go to [keyblind.dev](https://keyblind.dev) and click **Get Pro**.
2. Complete the Stripe checkout. Your license key is emailed to you and shown on the confirmation page.
3. Activate it locally: `keyblind activate keyblind.xxx.yyy`

The license key is your identity. There is no username or password.

Check your status any time:

```bash
keyblind status
```

Or sign in at [app.keyblind.dev/login](https://app.keyblind.dev/login) with your license key to view your tier, email, and expiry.

## Connect to Claude Code

```bash
keyblind setup-mcp
```

This auto-configures Keyblind as an MCP server. Then restart Claude Code and you can say _"list my keyblind secrets"_ or _"use my OPENAI_API_KEY"_.

For other editors (Cursor, Copilot, Windsurf, etc.), see [Editors Guide](editors.md).

## Store Your First Secret

```bash
echo "sk-abc123..." | keyblind set OPENAI_API_KEY
```

Or type it securely:

```bash
keyblind set OPENAI_API_KEY -
# Paste your key and press Ctrl+D
```

## Use in Claude Code

After `keyblind setup-mcp` and restart, just ask naturally:

```
> list my keyblind secrets
> resolve my OPENAI_API_KEY
> store a secret called DATABASE_URL
```

Keyblind resolves secrets at runtime — the plaintext never appears in the conversation transcript. You'll see "Called keyblind (ctrl+o to expand)" instead of the actual value.

## Approve Agent Actions

By default, when an AI agent stores or deletes a secret, it happens immediately. You can require your sign-off first:

```bash
# Require approval for all agent writes
keyblind approvals require on

# Or just for a specific secret
keyblind approvals require STRIPE_API_KEY
```

When an agent tries a gated write, it receives a "pending approval" result instead of executing. Review and resolve the request:

```bash
keyblind approvals list
keyblind approvals approve <id>   # execute the queued write
keyblind approvals deny <id>      # discard it
```

Approval is human-only — an agent can never approve its own action — and reading secrets is never gated. You can also approve or deny from the dashboard's Approvals page.

## Web Dashboard

```bash
keyblind dashboard
```

This starts the local server and opens `http://localhost:4318/` in your browser — already authenticated, no sign-in or pairing. It shows your license tier and secrets.

## Sandbox Your .env

```bash
# Replace real values with deterministic fakes
keyblind sandbox

# Restore real values when you need them
keyblind unsandbox
```

The fakes are HMAC-SHA256 derived — same input always produces same output, so git diffs stay clean.

## Next Steps

- [Full Command Reference](commands.md)
- [MCP Tools Reference](mcp-integration.md)
- [Security Model](security.md)
- [Enterprise Readiness](enterprise.md)
- [FAQ](faq.md)
