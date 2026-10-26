# Compliance — SOC 2 / ISO 27001 narrative

> A procurement-ready explanation of how Keyblind maps to SOC 2 and ISO 27001,
> written for the security team reviewing the vendor questionnaire. Updated for v0.9.2.

## Positioning

Keyblind is a **local-first, zero-network secrets manager** for AI agents. There is no
Keyblind-hosted vault, no telemetry, and no server-side key material to breach — the encrypted
vault, the master key, and the audit ledger all live on the developer's machine. The hosted
control plane (Phase 2) is the single server-side component, and it stores **no secret values**:
only names, roles, groups, and a signed manifest of scope/deny decisions.

This matters because a large fraction of SOC 2 and ISO 27001 controls are scoped to *hosted
services handling customer data*. For a local-first tool, the correct answer to many of those is
"not applicable by architecture," not a workaround. This document separates those out explicitly so
the reviewer can see the boundary clearly.

## Scope and data boundary

| Component | Where it runs | What it holds | Customer secret values? |
|-----------|---------------|---------------|-------------------------|
| Local vault | Developer machine | Encrypted secrets, audit log, ledger | Yes (AES-256-GCM, never leaves the machine) |
| Master key | OS keyring / local file | The vault's encryption key | Yes (machine-identity-bound) |
| Team vault | Shared file | Encrypted team secrets | Yes (encrypted at rest, shared by passphrase) |
| Hosted control plane | Keyblind (Turso) | Orgs, members, roles, groups, signed scope manifest | **No** — names and policy only, value-free |
| Ledger / approvals | Local machine | Signed agent-action history | No secret values |

**Conclusion:** the only place customer secret *values* exist is the customer's own machine(s).
The hosted service cannot disclose a secret value even if fully compromised, because it never
holds one.

## SOC 2 Trust Services Criteria

SOC 2 Type II applies to the *systems* a vendor operates. Keyblind's attack surface is the local
tool, so the relevant criteria are the **Security** category; Availability, Processing Integrity,
Confidentiality, and Privacy are largely out of scope (no hosted processing of customer data).

### Security (CC1–CC9)

| Criterion | How Keyblind addresses it |
|-----------|---------------------------|
| **CC1 — Control environment** | Named human sponsor required for every agent registration (`agents register <name> <sponsor>`); least-privilege scope + per-secret policy layered at the same choke point. |
| **CC2 — Risk assessment** | Secret-scanning (`scan-repo`), expiry (`check --expired`), and rotation-reminder (`rotate-needed`) surface the top three secret risks continuously. |
| **CC3 — Risk mitigation** | Agent scope, per-secret policy, human-in-the-loop approvals, and a signed deny list are enforced on read *and* write. |
| **CC4 — Monitoring** | Append-only, hash-chained, Ed25519-signed ledger; `verify_ledger` detects any edit/reorder; `export_compliance` produces an auditable report. |
| **CC5 — Communication** | `doctor` surfaces configuration gaps (plaintext key file, vault in a git tree) proactively. |
| **CC6 — Logical access** | Machine-identity-bound master key (macOS Keychain / libsecret / DPAPI); optional biometric session gate; SSO/OIDC login for the hosted plane with short-lived, single-use, nonce-bound agent tokens. |
| **CC7 — System ops** | Signed npm provenance (staged, 2FA-gated publish); zero production audit vulnerabilities; CI secret-scan backstop. |
| **CC8 — Change management** | Semantic-versioned releases; license/feature gating keeps the free tier honest without affecting Pro/Team/Enterprise. |
| **CC9 — Risk mitigation (vendor)** | N/A by architecture — no hosted secret store to outsource. |

## ISO 27001 Annex A

A subset is relevant to a local-first tool; the rest are organizational controls (ISMS policy,
asset inventory, supplier management) that are the *customer's* responsibility for their own ISMS,
not Keyblind's.

| Annex A control | Mapping |
|-----------------|---------|
| **A.8.1–8.3 Asset / information handling** | Encrypted vault at rest; value-free exports (`control-plane export` strips secret values and ciphertext). |
| **A.8.4 Access control** | Least-privilege agent scope + per-secret policy; SSO + group-derived scope. |
| **A.8.10 Information deletion** | `delete` removes the value; `secret_history` retained for rollback, deleted with the vault. |
| **A.8.12 Secure development** | 232-test suite, typed (TypeScript), signed provenance. |
| **A.8.13 Backup / A.8.14 Redundancy** | Local `secret_history` snapshot per update; team vault for shared recovery. |
| **A.8.15 Logging / A.8.16 Monitoring** | `audit_log` + signed ledger + `rotation_pending` status trail. |
| **A.8.17 Clock synchronization** | N/A (local clock; rotation windows use UTC datetimes). |
| **A.8.24 Cryptography** | AES-256-GCM, PBKDF2 (600k iterations), Ed25519 signatures, AES-256-GCM team vault. |
| **A.8.28 Secure coding** | Secret scanning in pre-commit hook + CI; OWASP-relevant inputs validated at boundaries. |

## Security questionnaire (common questions)

**"Where is our data stored?"** — On your machines. Secret values never leave them. The hosted
control plane stores only names/roles/groups and a signed policy manifest, in a Turso/libSQL
database, encrypted at rest.

**"Do you have a SOC 2 report?"** — Not yet. Keyblind is MIT-licensed and solo-maintained. This
document is the narrative substitute; a formal Type II report is not planned for the local tool
because there is no hosted service to audit. If procurement hard-requires an attestation, see
"Support SLA" for the enterprise engagement that can provide one via a third-party assessor.

**"How do you handle a breach?"** — There is no hosted secret store to breach. A local compromise
is the user's endpoint-security concern; Keyblind's ledger makes *which agent did what, signed by
which human sponsor* reconstructable for forensics.

**"What happens when an employee leaves?"** — See `docs/key-escrow.md`: dead man's switch +
team vault + control-plane deny list, with an offboarding runbook.

**"Can you revoke access in one place?"** — Yes: revoke the agent (or change its group) in the
hosted dashboard; local vaults enforce it on the next `control-plane sync`.

## Honest gaps (not yet met)

- No formal SOC 2 Type II or ISO 27001 **certification** (the local architecture makes this partly
  moot, but procurement may still require an attestation for the hosted control plane).
- No 24/7 SOC / managed detection (irrelevant for the local tool; relevant only if you adopt the
  hosted control plane, which holds no secret values).
- Single-maintainer supply chain — mitigated by signed provenance, but the bus factor is real.
