# Enterprise Readiness

An honest assessment of where Keyblind stands for enterprise adoption, what's
still missing, and the roadmap to close the gap. Updated for v0.9.1.

## Positioning

Keyblind is a **developer-side secret-hygiene and AI-governance layer**. It is
complementary to a central secrets manager (HashiCorp Vault, AWS/GCP/Azure Secret
Manager, 1Password Business), not a replacement for one.

The core bet: the urgent 2026 problem is not raw secret storage, it is **AI
agents leaking secrets into conversation transcripts and acting on them without
oversight**. Keyblind solves that at the protocol layer (MCP), where no
editor-specific tool can.

Local-first is deliberate: zero network, zero telemetry, no hosted vault to
breach. The tradeoff is that there is no central point of control. That tradeoff
is the defining enterprise gap and the roadmap below is built around it.

## What's enterprise-grade today

- **Crypto** — AES-256-GCM, PBKDF2 at 600,000 iterations, machine-identity-bound
  key, cross-platform key storage (macOS Keychain / Linux libsecret / Windows
  DPAPI).
- **Know Your Agent ledger** — append-only, hash-chained, Ed25519-signed record of
  agent actions, bound to a named human sponsor. `verify_ledger` detects any edit
  or reorder; `export_compliance` produces an auditable report.
- **Least-privilege enforcement** — agent scope (`read:prod-*`, `write:*`) layered
  with per-secret policies by agent name. Both must pass.
- **Human-in-the-loop approvals** — agent writes can be gated behind a human
  sponsor's approve/deny, recorded in a hash-chained table. Agents cannot approve
  their own actions.
- **Audit, rotation reminders, secret scanning** — `keyblind audit`,
  `keyblind rotate-needed`, `keyblind scan-repo` + a CI workflow as the
  enforcement backstop.
- **CI/CD injection** — encrypted bundles decrypted at runtime into `$GITHUB_ENV`.
- **Supply chain** — signed npm provenance via staged publishing (human 2FA
  gated), zero production audit vulnerabilities, 155 tests.

## What's not there yet

1. **No *centralized* control plane.** Phase 1 (`keyblind control-plane`) shipped a
   *synchronized* spine: a signed, value-free export for org-wide visibility and a
   signed deny list for central revocation, shared via a git repo or object store.
   Phase 2a is landing a hosted control plane (Turso-backed, signed manifest) that
   removes the manual export/apply step; revocation is eventually-consistent via
   `control-plane sync` rather than real-time.
2. **No real RBAC or directory integration.** Team vaults are gated by a shared
   passphrase; agent identity is a name/email string. Phase 2a adds orgs, roles,
   and group→scope grants, but SSO/OIDC login, SCIM, and short-lived signed
   credentials are still outstanding.
3. **Rotation is automated and validated live.** Phase 3 shipped provider-native
   rotation (AWS IAM / GCP service-account / Azure app-credential) with a rollback
   window and audit trail. All three adapters have been run against real cloud
   accounts (Oct 2026); that surfaced and fixed two propagation bugs — AWS IAM
   access keys and Azure app client secrets both take several seconds to become
   usable after creation, so `verify` now retries with backoff. (`scripts/validate-rotation.mjs`
   is the live create/verify/revoke harness.)
4. **Compliance is documented, not certified.** Phase 4 shipped a SOC 2 / ISO 27001
   narrative (`compliance.md`) and a key-escrow/recovery policy (`key-escrow.md`).
   There is no formal certification and no N-of-M threshold escrow.
5. **Enterprise tier is defined, not a change to solo maintenance.** Phase 4 added an
   `enterprise` license tier and support SLA (`support-sla.md`). Keyblind remains
   MIT-licensed and solo-maintained — the tier is a contract offer, which still
   disqualifies it for procurement teams that require a larger vendor.

## Where it fits today

- **Individual developers and small teams** who want AI agents to stop seeing
  plaintext secrets, with a real audit trail.
- **Security-conscious orgs** running Keyblind *alongside* a central vault, to
  cover the AI-agent access path the central vault can't see.
- **AI-governance initiatives** — the agent ledger + approvals is a differentiated
  answer to "how do we hold agents accountable and keep a human in the loop."

It is not yet a drop-in replacement for a central secrets manager in a regulated,
multi-team, multi-thousand-seat environment.

## Roadmap to enterprise

### Phase 1 — Central control plane ✅ shipped

Give the local model a shared spine without breaking zero-network:

- Sync the agent ledger and approval records to a shared, read-only store (e.g. a
  git repo or a customer-hosted object store).
- Central visibility: which secrets exist, who has access, when they were last
  rotated.
- Central revocation: a signed "deny list" that local vaults honor.

**Exit criteria:** a security team can answer "who accessed what, and is anyone
overdue for rotation" across the org from one place.

Shipped via `keyblind control-plane`. `control-plane export` emits a signed,
**value-free** bundle (secret names + rotation age, agents, policies, approvals, the
full ledger and its integrity verdict — no secret values or ciphertext) that can be
committed to a git repo or object store as the read-only org view. `control-plane init`
generates the org Ed25519 keypair; member machines `control-plane trust <pubkey>`; and a
signed deny list of revoked agent IDs is enforced at the same choke point as agent scope
(read *and* write). The shared store is transport-agnostic — no hosted aggregator yet.

### Phase 2 — Identity and RBAC

Replace shared-passphrase team vaults with real identity:

- SSO/OIDC-backed agent and human identity (not a name string).
- Group-based access: grant a team, not an individual, scope to a secret.
- Short-lived, signed credentials for CI/CD and agents.

**Exit criteria:** a leaver's access is revoked in one place and propagates.

**Phase 2a (RBAC core)** — shipped: a hosted control plane (extending the
`hosted/` app) backed by **Turso/libSQL**, with orgs, members, `owner`/`admin`/
`member` roles, groups, and a group→scope mapping. The hosted service signs a
**manifest bundle** (deny list + group-derived agent scopes) with the org's
Ed25519 key; local vaults `keyblind control-plane sync` it, verify the signature,
and enforce group-based access at the same choke point as agent scope. Revoking
an agent (or changing a group) in the hosted dashboard propagates to local
vaults on the next `sync` for read *and* write, from one place.

**Phase 2b (SSO login + short-lived agent credentials)** — shipped:

- **Multi-provider SSO login** in the hosted app. Configure one or more OIDC
  providers with the `OIDC_PROVIDERS` env var (a JSON array: `id`, `name`,
  `issuer`, `clientId`, `clientSecret`, optional `allowedDomains`, `groupsClaim`,
  `adminGroup`, `ownerGroup`); the login page renders a button per provider.
  A server-side `jose` client handles discovery, PKCE S256, `nonce`, and
  `id_token` verification against the provider JWKS. Identity is linked to a user
  by `(issuer, sub)` (email fallback for first link) in a `user_identities`
  table; an optional `groups` claim maps to hosted role (`owner`/`admin`) and
  scope-groups on login.
- **Short-lived agent credentials**, in both models:
  - **Self-signed requests** are now nonce- and expiry-bound
    (`action:target:nonce:exp`), single-use via a `used_nonces` table, and
    rejected when expired or too far in the future. `keyblind agents sign`
    mints one locally.
  - **Org-issued access tokens** (`keyblind-agent-token-v1`) are minted by the
    hosted control plane (`POST /api/org/agents/:id/token`) and verified offline
    by local vaults against the trusted org public key, with a single-use `jti`
    and a bounded TTL.

Two design notes worth flagging:

- **The hosted service holds the org signing key.** Real-time revocation and token
  minting require the server to sign on demand, so the org Ed25519 private key is
  generated server-side and stored AES-256-GCM-encrypted at rest under a server
  secret (`CONTROL_PLANE_KEY_ENC_KEY`). Member machines hold only the public key.
  This is a deliberate centralization tradeoff, not a hidden one.
- **SSO auto-provisioning and IdP end-session ship in Phase 2c** (below).

**Phase 2c (multi-org, SSO auto-provisioning, IdP end-session)** — shipped:

- **Multi-org membership + active-org selector.** A user can belong to many orgs
  (`org_members` PK is `(org_id, user_id)`). The dashboard gains an org switcher
  that sets a `keyblind_org` cookie; every org route resolves the *active* org
  through `requireOrgRole`, falling back to the first-joined org when no cookie is
  set. `GET /api/orgs` lists memberships, `POST /api/orgs/active` switches.
- **SSO auto-provisioning.** Providers may carry `orgSlug` + `autoProvision`; a
  first-time SSO login joins the org by slug, or creates it when `autoProvision`
  is true, then applies `adminGroup`/`ownerGroup` mapping.
- **IdP end-session + refresh.** Sessions are persisted (a `sessions` table keyed
  by `jti`, storing `sid`, `id_token_hint`, and any `refresh_token`). Back-channel
  logout (`POST /api/auth/sso/backchannel-logout`) verifies a signed `logout_token`
  and revokes every session for that `(issuer, sub|sid)`. RP-initiated logout sends
  `id_token_hint` + `client_id` and revokes the refresh token at the
  `revocation_endpoint` when present.

### Phase 3 — Automated rotation

- Provider-native rotation for AWS IAM, GCP service accounts, and Azure.
- Scheduled rotation with a rollback window and audit trail.

**Exit criteria:** a rotated secret is applied to the provider and vault in one
command, on a schedule, with no human in the loop.

### Phase 4 — Compliance and support ✅ shipped

- SOC 2 Type II / ISO 27001 narrative for the local architecture — `docs/compliance.md`.
- Key escrow / recovery policy for employee departure — `docs/key-escrow.md`.
- Enterprise license tier with a support SLA — `enterprise` tier in `src/license.ts` +
  `docs/support-sla.md`.

**Exit criteria:** the security questionnaire is answered (`compliance.md`) and a support
contract exists (`support-sla.md`).

## Security model in one line

Zero network and zero telemetry means there is no hosted Keyblind to breach. The
cost is that governance must be *synchronized* rather than *centralized* — which
is exactly what the roadmap above builds.
