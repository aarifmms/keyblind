import { execFileSync } from "node:child_process";
import type { RotationContext, RotationProvider } from "../rotation.js";

function runAws(args: string[], env?: Record<string, string>): string {
  const result = execFileSync("aws", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ...env },
  });
  return result.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitValue(value: string): { id: string; secret: string } {
  const idx = value.indexOf(":");
  if (idx === -1) return { id: value, secret: "" };
  return { id: value.slice(0, idx), secret: value.slice(idx + 1) };
}

function requireUser(ctx: RotationContext): string {
  const user = ctx.iamUserName;
  if (!user) throw new Error('AWS IAM rotation requires ctx.iamUserName (pass --iam-user <user>).');
  return user;
}

export const awsIamRotationProvider: RotationProvider = {
  name: "aws",

  async create(ctx: RotationContext) {
    const user = requireUser(ctx);
    const json = runAws(["iam", "create-access-key", "--user-name", user, "--output", "json"]);
    const key = (JSON.parse(json) as { AccessKey: { AccessKeyId: string; SecretAccessKey: string } }).AccessKey;
    return {
      value: `${key.AccessKeyId}:${key.SecretAccessKey}`,
      externalId: key.AccessKeyId,
    };
  },

  async verify(ctx: RotationContext, value: string) {
    const { id, secret } = splitValue(value);
    if (!id || !secret) return false;
    // IAM is eventually consistent: a freshly created access key can return
    // InvalidClientTokenId for several seconds before it is usable. Retry with
    // backoff until it propagates (or the window expires).
    const deadline = Date.now() + 30_000;
    let delay = 1000;
    for (;;) {
      try {
        runAws(["sts", "get-caller-identity", "--output", "json"], {
          AWS_ACCESS_KEY_ID: id,
          AWS_SECRET_ACCESS_KEY: secret,
          AWS_EC2_METADATA_DISABLED: "true",
        });
        return true;
      } catch {
        if (Date.now() >= deadline) return false;
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
      }
    }
  },

  async revoke(ctx: RotationContext, externalId: string) {
    const user = requireUser(ctx);
    try {
      runAws(["iam", "update-access-key", "--user-name", user, "--access-key-id", externalId, "--status", "Inactive"]);
    } catch {
      // Key may already be inactive or absent; deleting is the goal either way.
    }
    runAws(["iam", "delete-access-key", "--user-name", user, "--access-key-id", externalId]);
  },

  extractExternalId(value: string): string {
    return splitValue(value).id;
  },
};
