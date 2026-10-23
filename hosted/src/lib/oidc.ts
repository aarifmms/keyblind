import * as jose from "jose";
import crypto from "node:crypto";

export interface OidcProvider {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowedDomains?: string[];
  groupsClaim?: string;
  adminGroup?: string;
  ownerGroup?: string;
}

export interface OidcState {
  provider: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectAfter: string;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

function getSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "keyblind-dashboard-dev-secret-change-in-production");
  if (!secret) throw new Error("JWT_SECRET must be set in production");
  return new TextEncoder().encode(secret);
}

export function getOidcProviders(): OidcProvider[] {
  const raw = process.env.OIDC_PROVIDERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? p.id ?? ""),
        issuer: String(p.issuer ?? ""),
        clientId: String(p.clientId ?? ""),
        clientSecret: String(p.clientSecret ?? ""),
        allowedDomains: Array.isArray(p.allowedDomains) ? p.allowedDomains.map(String) : undefined,
        groupsClaim: typeof p.groupsClaim === "string" ? p.groupsClaim : undefined,
        adminGroup: typeof p.adminGroup === "string" ? p.adminGroup : undefined,
        ownerGroup: typeof p.ownerGroup === "string" ? p.ownerGroup : undefined,
      }))
      .filter((p) => p.id && p.issuer && p.clientId && p.clientSecret);
  } catch {
    return [];
  }
}

export function getProvider(id: string): OidcProvider | undefined {
  return getOidcProviders().find((p) => p.id === id);
}

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const _discoveryCache = new Map<string, { at: number; doc: Discovery }>();

export async function getDiscovery(provider: OidcProvider): Promise<Discovery> {
  const cached = _discoveryCache.get(provider.id);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.doc;

  const url = `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Discovery failed (${res.status}) for ${provider.id}`);
  const doc = (await res.json()) as Discovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error(`Incomplete discovery document for ${provider.id}`);
  }
  _discoveryCache.set(provider.id, { at: Date.now(), doc });
  return doc;
}

const _jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

async function getCachedJwks(provider: OidcProvider) {
  let jwks = _jwksCache.get(provider.id);
  if (jwks) return jwks;
  const discovery = await getDiscovery(provider);
  jwks = jose.createRemoteJWKSet(new URL(discovery.jwks_uri));
  _jwksCache.set(provider.id, jwks);
  return jwks;
}

function base64url(input: Buffer | Uint8Array): string {
  return Buffer.from(input).toString("base64url");
}

export function codeChallengeFor(codeVerifier: string): string {
  return base64url(crypto.createHash("sha256").update(codeVerifier).digest());
}

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(crypto.randomBytes(32));
  return { codeVerifier, codeChallenge: codeChallengeFor(codeVerifier) };
}

export function generateOidcState(providerId: string, redirectAfter = "/dashboard"): OidcState {
  return {
    provider: providerId,
    state: base64url(crypto.randomBytes(16)),
    nonce: base64url(crypto.randomBytes(16)),
    codeVerifier: base64url(crypto.randomBytes(32)),
    redirectAfter,
  };
}

export async function buildAuthorizeUrl(
  provider: OidcProvider,
  state: string,
  nonce: string,
  codeChallenge: string,
  redirectUri: string,
): Promise<string> {
  const discovery = await getDiscovery(provider);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  id_token?: string;
}

async function postToken(endpoint: string, body: URLSearchParams, basicAuth?: string): Promise<TokenResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (basicAuth) headers["Authorization"] = `Basic ${basicAuth}`;
  const res = await fetch(endpoint, { method: "POST", headers, body: body.toString(), cache: "no-store" });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(
  provider: OidcProvider,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<string> {
  const discovery = await getDiscovery(provider);
  const basicAuth = Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64");

  const baseBody = () => {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", codeVerifier);
    return body;
  };

  try {
    const token = await postToken(discovery.token_endpoint, baseBody(), basicAuth);
    if (token.id_token) return token.id_token;
  } catch {
    // fall through to client_secret_post
  }

  const body = baseBody();
  body.set("client_id", provider.clientId);
  body.set("client_secret", provider.clientSecret);
  const token = await postToken(discovery.token_endpoint, body);
  if (!token.id_token) throw new Error("No id_token in token response");
  return token.id_token;
}

export async function verifyIdToken(provider: OidcProvider, idToken: string, nonce: string): Promise<Record<string, unknown>> {
  const jwks = await getCachedJwks(provider);
  return verifyIdTokenWithKey(provider, idToken, nonce, jwks);
}

// Verifies the id_token against an injected key resolver (production passes the
// remote JWKS; tests pass a local JWKS to avoid the network).
export async function verifyIdTokenWithKey(
  provider: OidcProvider,
  idToken: string,
  nonce: string,
  getKey: jose.JWTVerifyGetKey,
): Promise<Record<string, unknown>> {
  const { payload } = await jose.jwtVerify(idToken, getKey, {
    issuer: provider.issuer,
    audience: provider.clientId,
  });

  if (typeof payload.nonce !== "string" || payload.nonce !== nonce) {
    throw new Error("nonce mismatch");
  }
  if (typeof payload.email !== "string" || !payload.email) {
    throw new Error("id_token missing email");
  }
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("email not verified");
  }
  return payload as Record<string, unknown>;
}

export async function signOidcState(state: OidcState): Promise<string> {
  return new jose.SignJWT(state as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
}

export async function verifyOidcState(token: string): Promise<OidcState | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    const provider = payload.provider;
    const state = payload.state;
    const nonce = payload.nonce;
    const codeVerifier = payload.codeVerifier;
    const redirectAfter = payload.redirectAfter;
    if (typeof provider !== "string" || typeof state !== "string" || typeof nonce !== "string" || typeof codeVerifier !== "string" || typeof redirectAfter !== "string") {
      return null;
    }
    return { provider, state, nonce, codeVerifier, redirectAfter };
  } catch {
    return null;
  }
}
