# Support & service-level agreement

> Support tiers, severity definitions, and response targets for Keyblind. The
> **Enterprise** tier is the contract-backed offering; Free/Pro/Team are
> best-effort.

## Tiers

| | Free | Pro | Team | Enterprise |
|---|------|-----|------|------------|
| Secrets | 5 | Unlimited | Unlimited | Unlimited |
| Team vaults | ✗ | ✓ | ✓ | ✓ |
| Audit log / ledger | ✗ | ✓ | ✓ | ✓ |
| Provider-native rotation | ✗ | ✓ | ✓ | ✓ |
| CI/CD injection | ✗ | ✓ | ✓ | ✓ |
| Biometric gate | ✗ | ✓ | ✓ | ✓ |
| SSO / RBAC control plane | ✗ | ✗ | ✓ | ✓ |
| Priority support (SLA) | ✗ | ✗ | ✗ | ✓ |
| Compliance attestation | ✗ | ✗ | ✗ | ✓ |

Enterprise is a superset of Team, distinguished by the support contract and compliance
engagements below, not by additional in-app features.

## Severity definitions

| Severity | Definition |
|----------|-----------|
| **S1 — Critical** | Vault is unreadable / key material unrecoverable; data loss or a security breach affecting customer secret values. |
| **S2 — High** | A feature is down with no workaround (e.g. rotation, sync, CI injection fail broadly). |
| **S3 — Normal** | A bug with a workaround; degraded behavior. |
| **S4 — Low** | Cosmetic, documentation, or feature-request. |

## Response targets

| Tier | S1 first response | S2 | S3 | S4 |
|------|-------------------|----|----|----|
| Free / Pro / Team | Best effort | Best effort | Best effort | Best effort |
| **Enterprise** | **4 business hours** | **1 business day** | **3 business days** | Next release |

Enterprise support is **business-hours (9am–5pm, customer's timezone), business days**, with a
named contact and a shared channel (email + private issue tracker). 24/7 follow-the-sun support is
a separate add-on engagement.

## Scope

**Covered:** Keyblind itself — vault init/unlock, secret store/resolve, rotation, team vaults,
control-plane sync, CI injection, and the MCP server.

**Not covered (explicitly):** the customer's own cloud accounts (AWS/GCP/Azure credentials and
IAM policy), the customer's endpoint/OS security, and any third-party MCP host or editor. A Keyblind
S1 that turns out to be a misconfigured cloud credential is triaged as S2/S3 with guidance.

## Enterprise contract

The Enterprise tier is delivered as a signed agreement with:

1. **This SLA** (response targets above).
2. **Compliance support** — assistance completing a vendor security questionnaire, and (on request)
   a third-party SOC 2 Type I / ISO 27001 assessment of the hosted control plane via an independent
   assessor, at cost.
3. **Named support contact** — a single accountable human, not a shared queue.
4. **Term** — annual, with 30-day non-renewal notice.

Because Keyblind is MIT-licensed and local-first, the Enterprise tier is the mechanism by which a
procurement team gets the "support contract exists" checkmark in `docs/enterprise.md` satisfied
without a hosted product to wrap.
