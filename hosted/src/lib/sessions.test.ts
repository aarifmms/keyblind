import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-hosted-sessions-"));
process.env.TURSO_DATABASE_URL = "file:" + path.join(tmpDir, "sessions.db");

import { createSession, getSession, isSessionRevoked, revokeSession, revokeSessionsByIdp } from "./sessions";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sessions", () => {
  it("creates, reads, and revokes a session", async () => {
    const jti = await createSession({
      userId: "u1",
      issuer: "https://iss",
      sub: "sub-1",
      sid: "sid-1",
      idTokenHint: "idt",
      refreshToken: "rt",
    });

    const rec = await getSession(jti);
    expect(rec).not.toBeNull();
    expect(rec!.userId).toBe("u1");
    expect(rec!.issuer).toBe("https://iss");
    expect(rec!.sub).toBe("sub-1");
    expect(rec!.sid).toBe("sid-1");
    expect(rec!.idTokenHint).toBe("idt");
    expect(rec!.refreshToken).toBe("rt");
    expect(rec!.revokedAt).toBeNull();
    expect(await isSessionRevoked(jti)).toBe(false);

    await revokeSession(jti);
    expect(await isSessionRevoked(jti)).toBe(true);
  });

  it("revokes only matching sessions on backchannel logout", async () => {
    const a = await createSession({ userId: "u1", issuer: "https://iss", sub: "sub-1", sid: "sid-a" });
    const b = await createSession({ userId: "u1", issuer: "https://iss", sub: "sub-1", sid: "sid-b" });
    const other = await createSession({ userId: "u2", issuer: "https://iss", sub: "sub-2", sid: "sid-c" });

    const bySub = await revokeSessionsByIdp("https://iss", "sub-1");
    expect(bySub).toBe(2);
    expect(await isSessionRevoked(a)).toBe(true);
    expect(await isSessionRevoked(b)).toBe(true);
    expect(await isSessionRevoked(other)).toBe(false);

    const bySid = await revokeSessionsByIdp("https://iss", undefined, "sid-c");
    expect(bySid).toBe(1);
    expect(await isSessionRevoked(other)).toBe(true);
  });

  it("does not consider an unknown session revoked", async () => {
    expect(await isSessionRevoked("does-not-exist")).toBe(false);
  });
});
