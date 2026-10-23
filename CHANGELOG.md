# Changelog

All notable changes to Keyblind are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.9.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.9.0
[0.8.8]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.8
[0.8.7]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.7
[0.8.6]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.6
[0.8.5]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.5
[0.8.1]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.1
[0.8.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.8.0
[0.7.0]: https://github.com/aarifmms/keyblind/releases/tag/v0.7.0
