# Enterprise Readiness

An honest assessment of where Keyblind stands for enterprise adoption, what's
still missing, and the roadmap to close the gap. Updated for v0.9.0.

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
  gated), zero production audit vulnerabilities, 145 tests.

## What's not there yet

1. **No central control plane.** The vault, ledger, and policies are per-machine.
   There is no org-wide view of "who can access what," no central revocation, no
   shared enforcement point.
2. **No real RBAC or directory integration.** Team vaults are gated by a shared
   passphrase; agent identity is a name/email string. SSO today only wraps
   team-vault access. No SCIM, no group-based access control.
3. **Rotation is still manual.** `rotate --generate` prints a value you apply by
   hand; `rotate --exec` is provider-agnostic but you wire the command. True
   automated rotation (calling provider IAM/service-account APIs) is not done.
4. **No compliance posture or key escrow.** No SOC 2 / ISO 27001 (partly moot
   because Keyblind is local, but procurement asks). No org-level key recovery for
   a departed employee beyond the dead man's switch.
5. **No enterprise support or SLA.** MIT-licensed and solo-maintained. This alone
   disqualifies it for many procurement teams regardless of features.

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

### Phase 3 — Automated rotation

- Provider-native rotation for AWS IAM, GCP service accounts, and Azure.
- Scheduled rotation with a rollback window and audit trail.

**Exit criteria:** a rotated secret is applied to the provider and vault in one
command, on a schedule, with no human in the loop.

### Phase 4 — Compliance and support

- SOC 2 Type II / ISO 27001 narrative for the local architecture.
- Key escrow / recovery policy for employee departure.
- Enterprise license tier with a support SLA.

**Exit criteria:** the security questionnaire is answered and a support contract
exists.

## Security model in one line

Zero network and zero telemetry means there is no hosted Keyblind to breach. The
cost is that governance must be *synchronized* rather than *centralized* — which
is exactly what the roadmap above builds.
