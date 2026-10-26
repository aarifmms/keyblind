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
    try {
      runAws(["sts", "get-caller-identity", "--output", "json"], {
        AWS_ACCESS_KEY_ID: id,
        AWS_SECRET_ACCESS_KEY: secret,
        AWS_PROFILE: "",
        AWS_DEFAULT_PROFILE: "",
        AWS_EC2_METADATA_DISABLED: "true",
      });
      return true;
    } catch {
      return false;
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
