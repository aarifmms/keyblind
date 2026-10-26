# Changelog

All notable changes to Keyblind are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.3] - 2026-10-25

### Added

- **Bounded-staleness revocation.** Remote revocation and group-scope changes now
  reach local vaults within a configurable window instead of waiting for a manual
  `control-plane sync`. The enforcement path re-pulls the signed manifest on access
  when the last sync is older than the staleness window (default 60s), using a
  conditional `If-None-Match`/`ETag` request so an unchanged manifest is a cheap
  304. Fail-open by default; `control-plane fail-closed on` denies access when a
  re-sync fails.
  - `control-plane staleness [secs]` — get/set the window (`-1` = manual-only,
    `0` = re-sync every access).
  - `control-plane fail-closed on|off` — invert the failure posture.
  - `control-plane sync --watch [--interval secs]` — foreground poller.
  - `control-plane status` reports the policy; the `revoked` subcommand is now
    documented.

## [0.9.2] - 2026-10-25

### Added

- **Phase 2 — Identity and RBAC (a/b/c).**
  - **2a (RBAC core):** hosted control plane backed by Turso/libSQL with orgs,
    members (`owner`/`admin`/`member`), groups, and group→scope grants. The
    hosted service signs a value-free manifest (deny list + group-derived
    scopes) with the org Ed25519 key; local vaults `control-plane sync` and
    enforce it at the same choke point as agent scope.
  - **2b (SSO + short-lived credentials):** multi-provider OIDC SSO (discovery,
    PKCE S256, nonce, `id_token` verification, `(issuer, sub)` linking); plus
    short-lived agent credentials — nonce/expiry-bound self-signed requests
    (single-use `used_nonces`) and org-issued `keyblind-agent-token-v1` tokens.
  - **2c (multi-org + provisioning + logout):** multi-org membership with an
    active-org switcher, SSO auto-provisioning by slug, and IdP end-session via
    back-channel logout + refresh-token revocation.
- **Phase 3 — provider-native rotation.** `keyblind rotate <name> --provider
  aws|gcp|azure` rotates the credential in the cloud and the vault in one
  command, with a rollback window (`--rollback-window`, `--finalize`,
  `--pending`) and full audit trail. Adapters: AWS IAM access keys, GCP
  service-account keys, Azure app client secrets.
- **Phase 4 — compliance & support.** SOC 2 / ISO 27001 narrative
  (`docs/compliance.md`), key-escrow/recovery policy (`docs/key-escrow.md`),
  and an `enterprise` license tier with a support SLA (`docs/support-sla.md`).

### Fixed

- AWS rotation `verify` dropped an empty `AWS_PROFILE` that broke STS calls, and
  now retries with backoff while a freshly created access key propagates (~9s).
- Azure rotation `verify` retries with backoff while a freshly created client
  secret propagates (~10s, `AADSTS7000215`).
- SSO callback provider lookup and 401 handling on unauthenticated org routes.

### Docs

- Recorded live validation of the three rotation adapters against real cloud
  accounts (`docs/phase-3-rotation.md`).

## [0.9.1] - 2026-10-23

### Added

- **Central control plane (Phase 1).** A signed, value-free export and a signed
  deny list that give the local, zero-network model a shared spine for org-wide
  visibility and revocation.
  - `keyblind control-plane init` — generate the org Ed25519 keypair.
  - `keyblind control-plane export` — signed, value-free bundle (secret names +
    rotation age, agent identities and scopes, policies, approvals, and the full
    ledger with its integrity verdict; no secret values or ciphertext) for committing
    to a git repo or object store as the read-only org view.
  - `keyblind control-plane trust <pubkey>` / `untrust` / `trusted` — manage trusted
    org public keys.
  - `keyblind control-plane apply <file>` — import a signed deny list (revoked agents).
  - `keyblind control-plane revoke <agentId>` / `unrevoke` — revoke an agent locally.
  - Revocation is enforced at the same choke point as agent scope, denying read *and*
    write for revoked agents. A deny list is honored only if its Ed25519 signature
    verifies against a trusted org public key.
- `listSecretInventory()` — lists every secret with its rotation age (names and
  timestamps only), powering the export.
- Dashboard REST surface: `/api/control-plane/*`.

## [0.9.0] - 2026-10-23

### Added

- **Agent action approval workflows (human-in-the-loop).** Agent-initiated writes
  (`store_secret` / `delete_secret`) can now be queued for a human sponsor's explicit
  approval instead of executing immediately. Requests are encrypted with the vault key
  before persisting, and decisions are recorded in a new append-only, hash-chained
  `approvals` table in `ledger.db`.
  - `keyblind approvals list|approve|deny` — review and resolve pending requests.
  - `keyblind approvals require on|off` — require approval for all agent writes.
  - `keyblind approvals require <secret>` / `unrequire <secret>` — per-secret gate.
  - Dashboard `/approvals` page with Approve/Deny buttons.
  - Reads (`resolve_secret`, `list_secrets`) stay scope-checked only — never approval-gated.
  - Approval is human-only by design: an agent cannot approve its own action.
- **Hosted license-key login flow** restored on `app.keyblind.dev` (login + account page,
  session middleware, sign-out).

### Changed

- Landing page: added prominent "Get Pro" CTA to nav and hero.
- Landing page: removed the expired `PH2025` launch promo.

### Docs

- Documented the Pro purchase and activation flow in the getting-started guide.

## [0.8.8] - 2026-10-20

### Added

- `keyblind quickstart` — one-command onboarding (init + configure Claude Code).
- `keyblind setup-mcp --local` — write project-local MCP configs for Cursor, Windsurf,
  Copilot, and Cline.
- `keyblind setup-mcp` now configures Cline and Zed in addition to Claude Code.

## [0.8.7] - 2026-10-20

### Fixed

- Pinned transitive dependencies to patched versions (zero production `npm audit` findings).

## [0.8.6] - 2026-10-20

### Removed

- Removed the Let's Encrypt/HTTPS feature and its `acme-client` dependency.

## [0.8.5] - 2026-10-20

### Fixed

- Pinned npm to 11.x in CI; npm 12's install-script blocking broke `better-sqlite3`/`esbuild`.
- Kept Node 22 for tests while upgrading npm only for staged publishing.

## [0.8.1] - 2026-10-20

### Changed

- Hardened the package supply chain (npm provenance, staged publishing).

## [0.8.0] - 2026-10-20

### Added

- Provider-agnostic secret rotation via `keyblind rotate --exec "<cmd>"` (works with every backend).
- CI/CD secret injection (`keyblind ci export|inject|setup`, Pro).
- Automatic secret rotation and per-secret dashboard policies.
- Repository secret scanning (`keyblind scan-repo`) and CI workflow (`keyblind setup-ci`).

## [0.7.0] - 2026-10-20

First tagged stable release with the full feature set: local encrypted vault, MCP server,
team vaults, CLI pairing, web dashboard, Chrome extension, sandboxing, TOTP, secret sharing,
dead man's switch, SSO, and the Know Your Agent ledger.

[0.9.3]: https://github.com/aarifmms/keyblind/releases/tag/v0.9.3
[0.9.2]: https://github.com/aarifmms/keyblind/releases/tag/v0.9.2
[0.9.1]: https://github.com/aarifmms/keyblind/releases/tag/v0.9.1
[0.9.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.9.0
[0.8.8]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.8
[0.8.7]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.7
[0.8.6]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.6
[0.8.5]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.5
[0.8.1]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.1
[0.8.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.0
[0.7.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.7.0
