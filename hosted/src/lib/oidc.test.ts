import { describe, it, expect, afterEach, vi } from "vitest";
import * as jose from "jose";
import { getOidcProviders, signOidcState, verifyOidcState, verifyIdTokenWithKey, codeChallengeFor, generatePkce, type OidcProvider } from "./oidc";

const ORIGINAL_OIDC = process.env.OIDC_PROVIDERS;

afterEach(() => {
  if (ORIGINAL_OIDC === undefined) delete process.env.OIDC_PROVIDERS;
  else process.env.OIDC_PROVIDERS = ORIGINAL_OIDC;
  vi.unstubAllGlobals();
});

describe("getOidcProviders", () => {
  it("parses a valid provider array", () => {
    process.env.OIDC_PROVIDERS = JSON.stringify([
      { id: "google", name: "Google", issuer: "https://accounts.google.com", clientId: "c", clientSecret: "s", allowedDomains: ["corp.com"] },
      { id: "okta", name: "Okta", issuer: "https://corp.okta.com", clientId: "c2", clientSecret: "s2", groupsClaim: "groups", adminGroup: "admins", ownerGroup: "owners" },
    ]);
    const providers = getOidcProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].id).toBe("google");
    expect(providers[0].allowedDomains).toEqual(["corp.com"]);
    expect(providers[1].adminGroup).toBe("admins");
    expect(providers[1].ownerGroup).toBe("owners");
  });

  it("drops providers missing required fields", () => {
    process.env.OIDC_PROVIDERS = JSON.stringify([
      { id: "bad", name: "Bad" },
      { id: "good", name: "Good", issuer: "https://iss", clientId: "c", clientSecret: "s" },
    ]);
    expect(getOidcProviders().map((p) => p.id)).toEqual(["good"]);
  });

  it("returns empty for unset or invalid config", () => {
    delete process.env.OIDC_PROVIDERS;
    expect(getOidcProviders()).toEqual([]);
    process.env.OIDC_PROVIDERS = "not-json";
    expect(getOidcProviders()).toEqual([]);
  });
});

describe("state sign/verify", () => {
  it("round-trips a signed state and rejects invalid tokens", async () => {
    const state = { provider: "okta", state: "s", nonce: "n", codeVerifier: "v", redirectAfter: "/dashboard" };
    const token = await signOidcState(state);
    expect(await verifyOidcState(token)).toEqual(state);
    expect(await verifyOidcState("not-a-jwt")).toBeNull();
    expect(await verifyOidcState("")).toBeNull();
  });
});

describe("PKCE", () => {
  it("derives a stable S256 challenge and fresh verifiers", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(codeChallengeFor(a.codeVerifier)).toBe(a.codeChallenge);
  });
});

describe("verifyIdToken", () => {
  const provider: OidcProvider = { id: "issuer-example", name: "Test", issuer: "https://issuer.example", clientId: "client-id", clientSecret: "secret" };

  async function setup(claims: Record<string, unknown>, nonce: string) {
    const { publicKey, privateKey } = await jose.generateKeyPair("ES256");
    const pubJwk = { ...(await jose.exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };

    const idToken = await new jose.SignJWT({ nonce, ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(provider.issuer)
      .setAudience(provider.clientId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    return { idToken, getKey: jose.createLocalJWKSet({ keys: [pubJwk] }) };
  }

  it("verifies a well-formed id_token against a local JWKS", async () => {
    const { idToken, getKey } = await setup({ email: "a@corp.com", email_verified: true, sub: "sub-1", name: "Alice" }, "nonce-1");
    const payload = await verifyIdTokenWithKey(provider, idToken, "nonce-1", getKey);
    expect(payload.email).toBe("a@corp.com");
    expect(payload.sub).toBe("sub-1");
  });

  it("rejects a nonce mismatch", async () => {
    const { idToken, getKey } = await setup({ email: "a@corp.com", email_verified: true, sub: "sub-1" }, "nonce-1");
    await expect(verifyIdTokenWithKey(provider, idToken, "wrong-nonce", getKey)).rejects.toThrow(/nonce mismatch/);
  });

  it("rejects an unverified email", async () => {
    const { idToken, getKey } = await setup({ email: "a@corp.com", email_verified: false, sub: "sub-1" }, "nonce-2");
    await expect(verifyIdTokenWithKey(provider, idToken, "nonce-2", getKey)).rejects.toThrow(/email not verified/);
  });

  it("rejects a wrong issuer", async () => {
    const { idToken, getKey } = await setup({ email: "a@corp.com", email_verified: true, sub: "sub-1" }, "nonce-3");
    const wrongIssuer: OidcProvider = { ...provider, issuer: "https://evil.example" };
    await expect(verifyIdTokenWithKey(wrongIssuer, idToken, "nonce-3", getKey)).rejects.toThrow();
  });
});
