# CLI Command Reference

## Vault Management

| Command | Description |
|---------|-------------|
| `keyblind init` | Initialize a new vault |
| `keyblind set <name>` | Store a secret (reads value from stdin) |
| `keyblind set <name> -` | Store a secret (prompts securely) |
| `keyblind get <name>` | Retrieve a secret |
| `keyblind list` | List all secret names |
| `keyblind delete <name>` | Delete a secret |
| `keyblind generate <name>` | Generate a strong random secret |
| `keyblind rotate <name>` | Update a secret value (prompts for new value) |
| `keyblind rotate <name> --generate` | Rotate with an auto-generated random value |
| `keyblind rotate <name> --exec "<cmd>"` | Rotate using an external command's stdout (works with every backend) |
| `keyblind rotate --overdue [days]` | Rotate every secret past the threshold with generated values |
| `keyblind rotate-needed [days]` | List secrets not rotated in N days (default 90) |

`--exec "<cmd>"` runs an external command to produce the new value, so rotation
works with **every backend** (AWS, GCP, Azure, 1Password, Bitwarden, or a custom
script) without Keyblind knowing provider specifics. `{}` in the command is
replaced with the secret name; if omitted, the name is appended as the last
argument. The command's trimmed stdout becomes the new value.

```bash
keyblind rotate DATABASE_URL --exec "aws secretsmanager rotate-secret --secret-id {}"
keyblind rotate API_KEY --exec "./scripts/new-key.sh"
keyblind rotate --overdue 30 --exec "gcloud secrets versions add {} --data-file=-"
```

## MCP Setup

```bash
keyblind setup-mcp              # Auto-configure Claude Code MCP (one command)
```

Runs `claude mcp add --scope user keyblind -- keyblind start`. Works from any directory.

## Import / Export

```bash
keyblind import .env            # Import all vars from .env
keyblind export --json          # Export vault as encrypted JSON
keyblind export --env           # Export user-facing secrets as .env format
```

## Sandbox

```bash
keyblind sandbox [.env]         # Replace .env with HMAC deterministic fakes
keyblind unsandbox [.env]       # Restore real values
```

## TOTP / 2FA

```bash
keyblind totp set <name> <uri>  # Store a TOTP config from otpauth:// URI
keyblind totp code <name>       # Generate current 6 or 8 digit code
keyblind totp list              # List all TOTP configurations
keyblind totp delete <name>     # Delete a TOTP config
```

## Secret Sharing

```bash
keyblind share <name> --ttl 24h --max-views 1
keyblind receive <url-or-fragment>
```

The secret is encrypted into the URL fragment — never sent to any server.

## Dead Man's Switch

```bash
keyblind deadman setup --days 30 --contact email@example.com
keyblind deadman checkin
keyblind deadman status
keyblind deadman disable
```

## SSO / OIDC

```bash
keyblind sso configure --provider google --client-id X --domain example.com
keyblind sso login
keyblind sso logout
keyblind sso status
```

Supports Google, Okta, Azure AD, and generic OIDC providers.

## Server

```bash
keyblind start                  # MCP server (stdio — for AI agents)
keyblind start --http           # HTTP server on port 4318 (dashboard + MCP + REST API)
keyblind dashboard              # Open the web dashboard in your browser (localhost:4318)
keyblind start --http --port 4000
keyblind start --biometric      # Require Touch ID before resolving secrets
```

## Run with Secrets

```bash
keyblind run -- npm start       # Run command with all secrets as env vars
keyblind run -- npm test        # Secrets injected, never shown
```

## Versioning & History

```bash
keyblind history <name>         # View secret version history
keyblind rollback <name>        # Restore previous version
keyblind check --expired        # List secrets past expiry
keyblind expiring               # List secrets expiring within 30 days
```

## Sync

```bash
keyblind sync export            # Export encrypted sync bundle
keyblind sync import <bundle>   # Import encrypted sync bundle
keyblind migrate --from local --to aws  # Migrate secrets between backends
```

## Team Vaults (Pro/Team)

```bash
keyblind team init [path]       # Initialize team vault
keyblind team push <name>       # Push to team vault
keyblind team pull              # Pull from team vault
keyblind team list              # List team secrets
```

## Know Your Agent (agent scope + policies)

```bash
keyblind agents list                              # List registered agents
keyblind agents register <name> <sponsor> [scope] # Register an agent (prints its signing key)
keyblind agents verify                            # Verify the ledger's hash chain + signatures
keyblind agents export [json|csv]                 # Compliance report with sponsor attribution
keyblind agents enforce on|off                    # Require signed agent identity for secret access
keyblind policy set <secret> <policy>             # Restrict which agents may read/write a secret
keyblind policy clear <secret>                    # Remove a secret's per-secret policy
keyblind policy list                              # List all per-secret policies
```

`scope` grants an agent broad access (`*`, `read:prod-* write:prod-*`). A per-secret
`policy` further constrains a single secret by **agent name** (`read:billing-*`, `*`).
Both must pass for an action to be authorized. An empty policy means no per-secret
restriction — the agent's own scope alone applies.

## Agent Action Approvals (human-in-the-loop)

```bash
keyblind approvals list                              # List pending approval requests
keyblind approvals approve <id>                      # Approve and execute a pending request
keyblind approvals deny <id>                         # Deny a pending request
keyblind approvals require on|off                    # Require approval for all agent writes
keyblind approvals require <secret>                  # Require approval for a specific secret
keyblind approvals unrequire <secret>                # Stop requiring approval for a secret
```

When approval is required (global toggle or per-secret flag), an agent-initiated
`store_secret` or `delete_secret` is queued as a pending request instead of executing.
The held value is encrypted with the vault key at rest, and every request and decision is
recorded in an append-only, hash-chained table in `ledger.db`. Approve or deny from the
CLI above or from the dashboard `/approvals` page.

Reads (`resolve_secret`, `list_secrets`) are never approval-gated — they remain
scope-checked only. Approval is human-only by design: an agent cannot approve its own
action.

## Secret Scanning / CI

```bash
keyblind check-secrets             # Scan staged files (run by the pre-commit hook)
keyblind scan-secrets <file...>    # Scan specific files
keyblind scan-repo                 # Scan all tracked files in the current repo
keyblind scan-repo --all           # Scan the full git history (slower, opt-in)
keyblind install-hook              # Install a pre-commit hook that blocks secret commits
keyblind setup-ci                  # Write .github/workflows/keyblind.yml
```

`scan-repo` exits non-zero when it finds a secret, so it fails a CI build. `setup-ci`
generates a GitHub Actions workflow that runs `npx keyblind scan-repo` on every push and
pull request, giving you an enforcement backstop beyond the (bypassable) pre-commit hook.
Test files (`*.test.*`, `tests/`) are skipped by default.

## CI/CD Secret Injection (Pro)

```bash
keyblind ci export                          # Export an encrypted bundle (prints to stdout)
keyblind ci export --passphrase <p> --out bundle.json   # To a file
keyblind ci inject --out "$GITHUB_ENV"      # Decrypt a bundle, write secrets as env vars
keyblind ci setup                           # Write .github/workflows/keyblind-ci.yml
```

`ci export` encrypts every vault secret under a passphrase-derived key
(PBKDF2, 600K iterations, AES-256-GCM) into a single-line bundle. Commit that
bundle and the passphrase as GitHub repo secrets (`KEYBLIND_CI_BUNDLE` and
`KEYBLIND_CI_PASSPHRASE`); the workflow generated by `ci setup` decrypts them and
writes the secrets to `$GITHUB_ENV`, where GitHub masks them from logs and every
later step sees them as env vars.

## License

```bash
keyblind activate <license-key> # Activate Pro/Team license
keyblind deactivate             # Deactivate license
keyblind status                 # Show license + vault status
```

## Utilities

```bash
keyblind doctor                 # 9-point health check
keyblind config <key> <val>     # Set config (backend, projectName, expiryDays, autoSandbox)
keyblind config                 # Show current config
keyblind backends               # List backends with availability
keyblind completions [bash|zsh|fish]  # Generate shell completions
keyblind install-hook           # Install pre-commit hook for secret detection
keyblind watch [.env]           # Watch .env and auto-sandbox on change
keyblind alerts <url>           # Configure Slack/Discord webhook alerts
keyblind unlock                 # Touch ID authentication
```

## Backends

| Backend | Description |
|---------|-------------|
| `local` | AES-256-GCM encrypted SQLite (default) |
| `1password` | 1Password CLI integration |
| `bitwarden` | Bitwarden CLI integration |
| `env` | Environment variables |
| `aws` | AWS Secrets Manager |
| `gcp` | GCP Secret Manager |
| `azure` | Azure Key Vault |

Switch backends: `keyblind config backend 1password`
