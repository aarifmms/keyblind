import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-hosted-token-test-"));
process.env.TURSO_DATABASE_URL = "file:" + path.join(tmpDir, "token.db");

import { createOrg } from "./org";
import { canonicalize } from "./manifest";
import { mintAgentToken } from "./agent-token";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("mintAgentToken", () => {
  it("mints a token whose signature verifies against the org public key", async () => {
    const org = await createOrg("Acme", "acme-token", "owner@corp.com");
    const token = JSON.parse(await mintAgentToken(org.id, "agent-1", "read:prod-*", 300));

    expect(token.format).toBe("keyblind-agent-token-v1");
    expect(token.org.id).toBe(org.id);
    expect(token.org.publicKey).toBe(org.publicKey);
    expect(token.agentId).toBe("agent-1");
    expect(token.scope).toBe("read:prod-*");
    expect(typeof token.exp).toBe("number");
    expect(token.exp).toBeGreaterThan(token.iat);

    const { signature, ...doc } = token;
    const pub = crypto.createPublicKey({ key: Buffer.from(org.publicKey, "base64"), format: "der", type: "spki" });
    expect(crypto.verify(null, Buffer.from(canonicalize(doc), "utf8"), pub, Buffer.from(signature, "base64"))).toBe(true);
  });

  it("caps the TTL at the maximum and defaults to the default TTL", async () => {
    const org = await createOrg("Beta", "beta-token", "owner@corp.com");
    const capped = JSON.parse(await mintAgentToken(org.id, "agent-1", "", 9999));
    expect(capped.exp - capped.iat).toBeLessThanOrEqual(300);

    const defaulted = JSON.parse(await mintAgentToken(org.id, "agent-1", ""));
    expect(defaulted.exp - defaulted.iat).toBe(300);
  });
});
