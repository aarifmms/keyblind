# FAQ

## What is Keyblind?

Keyblind is an encrypted secrets vault that integrates with AI coding tools via the Model Context Protocol (MCP). It stores API keys, tokens, and passwords in an AES-256-GCM encrypted SQLite database and resolves them at runtime — plaintext never appears in your LLM conversation transcript.

## How is this different from a .env file?

`.env` files are read by your code. When you paste code into an AI chat, the `.env` contents can leak. Keyblind keeps secrets in an encrypted vault and only resolves them when the AI needs them, keeping them out of the chat transcript entirely.

For local `.env` files, `keyblind sandbox` replaces real values with deterministic fakes that are safe to share with AI tools.

## How is this different from 1Password / Bitwarden?

Keyblind is **MCP-native**. It integrates directly with AI agents via the Model Context Protocol. 1Password and Bitwarden are human-facing password managers. Keyblind also supports using 1Password and Bitwarden as backends — so you can use both together.

## Is Keyblind open source?

Yes. MIT license. The full source is at [github.com/aarifmms/keyblind](https://github.com/aarifmms/keyblind).

## Where is my data stored?

By default, in `~/.keyblind/vault.db` — an AES-256-GCM encrypted SQLite database. Nothing leaves your machine. No cloud, no telemetry, no accounts.

## What happens if I lose my passphrase?

Your secrets are unrecoverable. The passphrase encrypts the vault key. There is no backdoor, no recovery email, no "forgot password" flow. **Write down your passphrase and store it securely.**

## How does the license system work?

License keys are Ed25519-signed JSON payloads. The public key is baked into the binary. Validation happens entirely offline — no phone-home. See [Security Design](./security.md) for details.

## How do I sign up / activate?

There are **no accounts and no sign-in** — Keyblind is fully local.

- **Free tier** — install and go: `npm i -g keyblind`, then `keyblind init`. You get 5 secrets, all 7 backends, and all 16 MCP tools.
- **Pro/Team** — buy a license at [keyblind.dev](https://keyblind.dev), receive the key by email, then run `keyblind activate <your-license-key>`.
- **Dashboard** — `keyblind dashboard` opens `http://localhost:4318/` in your browser, already authenticated. No login, no pairing token.

## Can I use Keyblind in CI/CD?

Yes. For public repositories, run the test suite from source with `KEYBLIND_DEV=true`. This dev/CI bypass is compile-time only — it is stripped from the published npm package, so it cannot be used to unlock unlimited secrets in a normal install. For production use and private repos, use a Pro license via GitHub Secrets.

## What MCP tools does Keyblind expose?

16 tools: `resolve_secret`, `store_secret`, `list_secrets`, `delete_secret`, `sandbox_env`, `unsandbox_env`, `audit_log`, `totp_code`, `totp_store`, `totp_list`, `totp_delete`, `create_share_link`, `receive_share`, `deadman_status`, `deadman_checkin`, `sso_status`.

## Does Keyblind support team vaults?

Yes. Pro tier includes team vaults with `keyblind team push/pull/list`. Team tier ($29/user/month) adds centralized admin and shared vault policies.

## How do I switch between backends?

```bash
keyblind config backend aws    # Use AWS Secrets Manager
keyblind config backend local  # Back to local vault
```

Run `keyblind backends` to see which backends are available.

## Is there a browser extension?

Yes. The Keyblind browser extension detects API keys in your clipboard and warns before pasting into AI chat sites (Claude.ai, ChatGPT, GitHub Copilot web). [Install it from the Chrome Web Store](https://chromewebstore.google.com/detail/keyblind-%E2%80%94-blind-ai-to-yo/ljobkicejnncijfmnkkedpgngbaalnmd).

## Can I use Keyblind with non-MCP tools?

Yes. `keyblind get OPENAI_API_KEY` works as a standard CLI. You can use it in shell scripts, Makefiles, or anywhere you'd normally use environment variables.

## How do I report a security issue?

Email security@keyblind.dev. PGP key available on request. Do not open a public issue for security bugs.
