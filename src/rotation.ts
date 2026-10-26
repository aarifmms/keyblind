import {
  resolveSecret,
  storeSecret,
  scheduleRevocation,
  listRevocationsDue,
  markRevocationStatus,
  getRotationConfig,
} from "./vault.js";

export type RotationContext = Record<string, string>;

export interface RotationProvider {
  name: string;
  create(ctx: RotationContext): Promise<{ value: string; externalId: string }>;
  verify(ctx: RotationContext, value: string): Promise<boolean>;
  revoke(ctx: RotationContext, externalId: string): Promise<void>;
  extractExternalId(value: string): string;
}

export interface RotationResult {
  secretName: string;
  externalId: string;
  oldExternalId: string;
  windowSeconds: number;
  revokeAt: string;
}

export async function rotateProviderSecret(
  name: string,
  provider: RotationProvider,
  ctx: RotationContext,
  windowSeconds: number = 300,
): Promise<RotationResult> {
  const oldValue = resolveSecret(name);
  if (oldValue === null) {
    throw new Error(`Secret "${name}" not found.`);
  }
  const oldExternalId = provider.extractExternalId(oldValue);

  const { value, externalId } = await provider.create(ctx);
  storeSecret(name, value);

  const ok = await provider.verify(ctx, value);
  if (!ok) {
    // Roll back: restore the old value and clean up the just-created credential.
    storeSecret(name, oldValue);
    try {
      await provider.revoke(ctx, externalId);
    } catch {
      // Best-effort cleanup — the newly created credential is left behind if the
      // provider refuses, but the vault has already been restored.
    }
    throw new Error(`Rotation verification failed for "${name}"; restored previous value.`);
  }

  scheduleRevocation(name, provider.name, oldExternalId, windowSeconds);
  return {
    secretName: name,
    externalId,
    oldExternalId,
    windowSeconds,
    revokeAt: new Date(Date.now() + windowSeconds * 1000).toISOString(),
  };
}

export async function finalizePendingRevocations(
  providers: Record<string, RotationProvider>,
): Promise<{ revoked: number; failed: number }> {
  const due = listRevocationsDue();
  let revoked = 0;
  let failed = 0;
  for (const rec of due) {
    const cfg = getRotationConfig(rec.secretName);
    const provider = cfg ? providers[cfg.provider] : undefined;
    if (!cfg || !provider) {
      markRevocationStatus(rec.id, "failed");
      failed++;
      continue;
    }
    try {
      await provider.revoke(cfg.config, rec.oldExternalId);
      markRevocationStatus(rec.id, "revoked");
      revoked++;
    } catch {
      markRevocationStatus(rec.id, "failed");
      failed++;
    }
  }
  return { revoked, failed };
}
