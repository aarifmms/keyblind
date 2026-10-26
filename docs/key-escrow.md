# Key escrow & employee-departure recovery

> Policy and runbook for recovering access when an employee leaves — or is
> unavailable — so their secrets are not lost and their access is revoked.

## The problem

Keyblind is local-first: the encrypted vault and its master key live on the departing employee's
machine. Without a recovery path, two things fail at once when they leave:

1. **Access is lost** — secrets only they held are unrecoverable if the master key dies with their
   machine or keyring.
2. **Access is retained** — their agent identity and any shared team vault passphrase keep working
   until explicitly revoked.

Keyblind addresses both with three complementary mechanisms. None of them reintroduce a hosted
vault, so the "no central point of breach" property is preserved.

## Mechanism 1 — Dead man's switch (individual vault)

`keyblind deadman` configures a timer: if the owner does not check in for N days, access is
released to a designated contact.

- **Setup:** `keyblind deadman setup --days 30 --email <contact>` (and optionally a contact
  Ed25519/RSA public key).
- **Recovery material:** `encryptKeyShard()` encrypts a SHA-256-derived shard of the master key to
  the contact's public key. The contact decrypts it to reconstruct the key *only after* the switch
  triggers.
- **Reset:** `keyblind deadman checkin` (periodic, e.g. via cron) keeps the timer alive.

**When it's the right tool:** a solo owner, or a designated emergency access for a team vault.

**Limitation:** single-contact, all-or-nothing. It is not N-of-M threshold escrow — see
"Limitations" below.

## Mechanism 2 — Team vault (shared recovery)

`keyblind team init --passphrase <pw>` creates an encrypted, shared vault (AES-256-GCM) that
multiple members pull/push. Secrets needed by more than one person live here, so a departure does
not strand them on one machine.

- **Rotate on departure:** if the leaver knew the team-vault passphrase, generate a new one
  (`team init` to a new file) and redistribute to the remaining members — a passphrase the leaver
  knew must be treated as compromised.

## Mechanism 3 — Control-plane deny list (access revocation)

The hosted control plane (Phase 2) lets an admin revoke the leaver's agent identity and group
memberships in one place; local vaults enforce it on the next `control-plane sync`.

- **Revoke the agent:** removes their read/write access at the same choke point as scope.
- **Re-scope the group:** reassign the leaver's secrets to a remaining member's group.

This is the *revocation* half; the dead man's switch and team vault are the *recovery* half.

## Offboarding runbook

1. **Revoke the agent** in the hosted dashboard (or `agents revoke <id>`), and remove them from
   any groups that grant scope. Push the deny list; confirm local vaults have synced.
2. **Rotate the team-vault passphrase** if the leaver knew it, and redistribute to remaining
   members.
3. **Transfer individual secrets** the leaver held alone: pull them into the team vault (or export
   to the successor's vault via `control-plane` / `share`) before decommissioning the machine.
4. **Decommission the machine** only after confirming the secrets have been recovered elsewhere —
   the master key on that machine is the last copy.
5. **Confirm the dead man's switch** is either disabled (if the account is being retired) or
   re-pointed to the successor.

## Limitations (be explicit)

- **No N-of-M threshold escrow.** The dead man's switch is a single contact with a single shard.
  A true threshold scheme (e.g. Shamir 3-of-5 among executives) is not built; it is a candidate
  follow-on.
- **No org-level automatic key recovery.** Recovery depends on a contact *having* the shard and a
  member *knowing* the team passphrase. There is no server-held copy of any master key (by design).
- **Passphrase-dependent team vault.** The team vault's security is the shared passphrase; a
  departed employee who knew it must be treated as a compromise and the passphrase rotated.

## Verification checklist

- A departing employee's agent is revoked and their group scope removed → their next read/write is
  denied even before any secret is touched.
- The dead man's switch, once triggered, lets the contact decrypt the shard and recover the vault.
- No secret value is ever recoverable from the hosted control plane alone.
