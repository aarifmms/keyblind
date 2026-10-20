# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.8.x   | Yes |
| 0.7.x   | Yes (security fixes only) |
| < 0.7.0 | No |

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub Security Advisories:

1. Go to https://github.com/aarifmms/keyblind/security/advisories/new
2. Describe the vulnerability, its impact, and steps to reproduce.

Do not open a public issue for a security vulnerability. Public issues are for
bugs, feature requests, and non-security questions.

### What to include

- Affected version(s)
- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept if available
- Any suggested fix or mitigation

## Response Timeline

We aim to:

- Acknowledge your report within 3 business days
- Provide an initial assessment within 7 business days
- Coordinate a fix and a coordinated disclosure timeline with you

## Disclosure Process

We follow coordinated disclosure:

1. Confirm the vulnerability and assess severity
2. Develop and test a fix privately
3. Release the fix and publish an advisory
4. Credit the reporter (unless you ask to remain anonymous)

## Scope

Keyblind is a local, single-machine secrets vault. Its security model assumes
the machine and the OS user account are trusted. In-scope issues include:

- Cryptographic weaknesses in vault encryption, key derivation, or secret sharing
- Ways the MCP server could leak a secret's plaintext into the LLM transcript
- Sandbox bypasses that restore or reveal real `.env` values to AI agents
- License key forgery or signature bypass
- Ledger integrity bypass (hash chain or signature verification)

Out of scope:

- Attacks requiring an already-compromised machine or OS account
- Social engineering, phishing, or physical access
- Denial of service against a local process
- Vulnerabilities in third-party dependencies unless Keyblind misuses them

## Security Model

- Secrets are encrypted at rest with AES-256-GCM (PBKDF2 key derivation, 600K iterations)
- The encryption key is machine-identity-bound and optionally stored in the OS keychain
- Zero network, zero telemetry. Keyblind never phones home
- Secret values are resolved at runtime and never written into LLM transcripts
