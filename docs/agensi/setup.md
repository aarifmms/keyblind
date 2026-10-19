# Keyblind - Setup

One-command setup for Claude Code:

```bash
npm i -g keyblind
keyblind init
keyblind setup-mcp
```

For other MCP clients (Cursor, Windsurf, Cline, Copilot, Zed), add `config-template.json` to your MCP config, then restart.

## Store and resolve a secret

```bash
keyblind set MY_API_KEY     # prompts securely for the value
keyblind get MY_API_KEY     # resolves the decrypted value
keyblind sandbox                # swap real .env values for deterministic fakes
keyblind run -- npm start       # run a command with secrets injected as env vars
keyblind list                   # names only - values never shown
```

## From your agent

After setup, tell the agent: "resolve my API key" or "list my keyblind secrets". It resolves them at runtime without the value appearing in the transcript.

Docs: https://github.com/aarifmms/keyblind
