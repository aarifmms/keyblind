# Phase 3 — Automated rotation (provider-native)

> Status: Parts 1–3 ✅ shipped · Parts 4–5 deferred
> Created: 2026-10-25 · Part 1–3 complete 2026-10-25

## Context

Phase 1 (central control plane) and Phase 2 (identity + RBAC, a/b/c) are shipped. Phase 3 is
**automated rotation**: rotate a secret *and* its underlying cloud credential in one command, on
a schedule, with a rollback window and audit trail — no human in the loop.

What already exists that Phase 3 builds on:

- `src/vault.ts` — `storeSecret()` snapshots the old value into `secret_history` before
  overwriting, so every update is already reversible. Schema (`secrets`, `audit_log`,
  `secret_history`) is idempotent. `listRotationNeeded(days)` tracks staleness. `auditLog()`
  records resolve/store/delete.
- `src/cli.ts` — `rotate` already does *value* rotation (`--generate`, `--exec`, `--overdue`
  batch), gated by `requirePro()`.
- `src/backends.ts` — `aws`/`gcp`/`azure` backends store/retrieve *values* in cloud secret
  managers. **They are not credential rotation.**
- `src/ledger.ts` — signed, hash-chained ledger for agent accountability.

**The gap:** `rotate` changes the value in the vault but never rotates the real credential in
AWS/GCP/Azure. Phase 3 closes that.

## Confirmed decisions

- **AWS IAM first**, GCP/Azure as follow-on adapters behind the same interface.
- **Scheduled CLI, not a daemon** — `watch.ts` is a `.env` sandbox watcher, not a scheduler.
  "Scheduled" = the `--overdue` batch command run via cron/systemd.
- **Rollback window** = persist a "pending revocation"; revoke the old credential only after the
  window passes *and* the new one verifies.
- **Audit** = local `audit_log` (`store` on every value change) + the `rotation_pending` status
  trail (pending → revoked/failed).

## Part 1 — Rotation engine (provider-agnostic) ✅ shipped

New `src/rotation.ts` + `rotation_pending` / `rotation_config` tables in `src/vault.ts`.

```ts
interface RotationProvider {
  name: string;
  create(ctx): Promise<{ value: string; externalId: string }>;
  verify(ctx, value): Promise<boolean>;
  revoke(ctx, externalId): Promise<void>;
  extractExternalId(value: string): string;
}
```

`rotateProviderSecret(name, provider, ctx, windowSec)`:
1. `oldValue = resolveSecret(name)` → `oldExternalId = provider.extractExternalId(oldValue)`
2. `create()` → new value + external id
3. `storeSecret(name, value)` (snapshots old → history)
4. `verify()` — on failure, `storeSecret(name, oldValue)` to restore + best-effort revoke the
   just-created credential, throw
5. `scheduleRevocation(...)` → insert `rotation_pending`
6. return result

`finalizePendingRevocations(providers)` — revoke every `pending` row past `revoke_at`, mark
`revoked` (or `failed`); provider config resolved from `rotation_config`.

## Part 2 — AWS IAM adapter ✅ shipped

`src/rotation/aws.ts` via `aws` CLI (`execFileSync`, matching `backends.ts`):
`create-access-key` → `sts get-caller-identity` → `update-access-key --status Inactive` +
`delete-access-key`. Value format is `AccessKeyId:SecretAccessKey`; `extractExternalId` returns the
id part. `verify` runs STS with the new key via `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env
(clearing any profile). Covered by `tests/rotation-aws.test.ts` (mocked `aws` CLI).

## Part 3 — CLI (`src/cli.ts`) ✅ shipped

```
keyblind rotate <name> --provider aws --iam-user <user> [--rollback-window N]
keyblind rotate --provider aws --overdue [days]
keyblind rotate --finalize
keyblind rotate --pending
```

All four are wired into the existing `rotate` case (still `requirePro()`-gated). `--finalize` /
`--pending` don't need `--provider` (they operate on the provider-agnostic `rotation_pending`
table). Single-secret rotation sets the `rotation_config` *before* rotating so a pending revocation
always has a config to finalize against. `scripts/build.mjs` now globs `src/**/*.ts` recursively so
`src/rotation/aws.ts` ships in `dist/`.

## Part 4 (deferred) — GCP + Azure adapters

## Part 5 (deferred) — scheduler polish

## Verification

1. `npm run build` + `npm test` green (new rotation suite + existing 204).
2. Sandbox AWS: new key verifies via STS, old key deactivated after window,
   `rotation_pending → revoked`, audit written.
3. Kill mid-rotation (after create, before finalize) → old key still valid; `--finalize` cleans up.
4. Verify-failure path: vault reverts, just-created key deleted.
