# Keyblind — LinkedIn Carousel Posts (last 10 commits)

One carousel per commit, newest first. Each has a caption (post text) plus 6-8
square slides. Slide 1 is the hook, the last slide is always the CTA. Square
canvas is 1080x1080.

---

## 1. Keyblind is now a Claude Code skill

**Commit:** `48887b3` — add keyblind skill and migrate manifest to v0.4

**Caption:**

I turned Keyblind into a native Claude Code skill.

Until now, an AI agent handled secrets by guessing. Now it loads a small
instruction bundle that tells it exactly how to store, resolve, and sandbox a
secret over MCP, before it ever touches your keys.

Skills are the new "API docs" for AI agents. If your tool speaks MCP, shipping a
skill is how agents actually discover it and use it correctly.

27 tools, fully local, zero network. Open source, MIT.

Are you shipping skills for your MCP tools yet?

`#keyblind #claudecode #mcp #aisecurity #buildinpublic`

**Slides:**

1. **Keyblind is now a native Claude Code skill** — the agent self-discovers how to keep your keys safe.
2. **The problem** — agents can't tell the difference between code and secrets, so plaintext leaks into transcripts.
3. **What a skill is** — a small prompt bundle the agent loads on demand, no config, no guessing.
4. **What it teaches the agent** — store encrypted, resolve at runtime, sandbox `.env`, never echo plaintext.
5. **The moment it fires** — the user asks to store or use a key, the skill shows the safe path automatically.
6. **Why runtime resolution matters** — the decrypted value is injected just in time, never written to the conversation.
7. **The stack** — AES-256-GCM vault, 27 MCP tools, zero network, zero telemetry.
8. **Try it** — `npm i -g keyblind` then `keyblind quickstart`.

---

## 2. One-click install from the Smithery registry

**Commit:** `2f310ba` — update smithery.yaml to current format

**Caption:**

Keyblind is now installable from the Smithery MCP registry.

One click, and your agent has a fully encrypted secrets vault wired up over MCP.
No copy-pasting JSON, no hand-editing config files.

The goal is the same one I've had from day one: make "your AI agent never sees
your keys" the default, not a setup project.

Distribution matters as much as the product when the product is developer
infrastructure.

`#keyblind #smithery #mcp #developertools #buildinpublic`

**Slides:**

1. **Keyblind is on Smithery** — one click to install a secrets vault for your agent.
2. **The usual pain** — hand-editing MCP config JSON to wire up a server.
3. **Registry install** — search, add, done. The server config is handled for you.
4. **What you get** — AES-256-GCM encryption, runtime resolution, sandboxing.
5. **Zero network** — everything stays on your machine, no cloud, no account.
6. **Why this matters** — lower install friction means more devs actually protect their keys.
7. **Try it** — install from Smithery, or `npm i -g keyblind`.

---

## 3. Repositioned for the agentic era

**Commit:** `004f729` — refresh distribution metadata and positioning

**Caption:**

I refreshed Keyblind's positioning across the README, landing page, Product Hunt,
Glama, and the manifest.

The core message didn't change. What changed is how sharply I say it: Keyblind is
a secrets vault for AI agents. Secrets resolve at runtime. Plaintext never enters
the transcript.

Same product, clearer story. Positioning is a grind you never finish, you just get
one line closer every pass.

Which one-liner lands better with you:

"Blind AI to your keys" or "Your agent never sees your keys"?

`#keyblind #positioning #developerproduct #buildinpublic`

**Slides:**

1. **Repositioned** — a sharper story for the same product.
2. **The core claim** — your AI agent never sees your real keys.
3. **How** — encrypt at rest, resolve at runtime, plaintext never hits the transcript.
4. **Where it changed** — README, landing page, Product Hunt, Glama, registry manifest.
5. **Why now** — agentic coding is mainstream, secret leaks are the new supply chain risk.
6. **Positioning is never done** — each pass gets one line closer to the truth.
7. **Try it** — `npm i -g keyblind` then `keyblind quickstart`.

---

## 4. v0.8.8 shipped

**Commit:** `9544653` — bump version to 0.8.8

**Caption:**

Keyblind v0.8.8 is out.

This release bundles the onboarding and editor work from the last sprint: a
one-command `quickstart`, `setup-mcp --local` for project configs, and Cline +
Zed support.

The theme of this version: the fastest possible path from "I have a key" to
"my agent can't see it."

Open source, MIT. 27 tools. Zero network.

`#keyblind #release #oss #aisecurity #buildinpublic`

**Slides:**

1. **v0.8.8 is live** — the "fastest path to safe" release.
2. **One-command onboarding** — `keyblind quickstart` sets up the vault and MCP.
3. **Project-local config** — `setup-mcp --local` writes per-repo editor config.
4. **More editors** — Cline and Zed now wired in one command.
5. **Still zero trust in the network** — fully local, no cloud, no telemetry.
6. **The point** — protection you set up in seconds, not an afternoon.
7. **Get it** — `npm i -g keyblind`.

---

## 5. Team-wide editor config in one command

**Commit:** `8c68941` — add `setup-mcp --local` for project editor configs

**Caption:**

I added `keyblind setup-mcp --local`.

It writes project-local MCP config files into your repo for Cursor, Windsurf,
Copilot, and Cline (project mode). The files contain only the `keyblind start`
command, no secrets, so they're safe to commit.

The effect: every developer who clones the repo gets Keyblind wired into their
editor automatically. Security becomes a property of the repo, not a per-person
setup task.

That's the shift I care about: move secret hygiene from "someone remembered" to
"the repo enforces it."

`#keyblind #mcp #developersecurity #teamwork #buildinpublic`

**Slides:**

1. **`setup-mcp --local`** — commit your agent's secrets vault config to the repo.
2. **The old way** — each dev hand-wires MCP config in their own `$HOME`.
3. **The new way** — config lives in the repo, anyone who clones it is covered.
4. **What gets written** — `.cursor/mcp.json`, `.windsurf/mcp.json`, Copilot, Cline.
5. **Safe to commit** — the file holds only `keyblind start`, never a secret.
6. **Idempotent** — re-run it, it merges without clobbering existing servers.
7. **The shift** — secret hygiene moves from "someone remembered" to "the repo enforces it."
8. **Try it** — `keyblind setup-mcp --local --editors cursor,windsurf`.

---

## 6. Cline and Zed join the party

**Commit:** `5a49018` — extend setup-mcp to configure Cline and Zed

**Caption:**

Keyblind's one-command MCP setup now covers Cline and Zed, not just Claude Code.

So the same `keyblind setup-mcp` that works for Claude Code also wires up your
Cline and Zed installations. One command, every editor you actually use.

"Works with every MCP client" stops being a marketing line when the setup script
actually targets them all.

Which editor do you want to see next?

`#keyblind #cline #zed #mcp #aisecurity #buildinpublic`

**Slides:**

1. **Cline and Zed support** — one command now configures them too.
2. **The promise** — works with every MCP client, not just one editor.
3. **Claude Code** — already wired since day one.
4. **Cline** — now auto-configured from the same `setup-mcp` command.
5. **Zed** — same treatment, same single command.
6. **Why** — devs switch editors, but they shouldn't lose their secret protection.
7. **Try it** — `keyblind setup-mcp`.

---

## 7. From zero to vault in one command

**Commit:** `e468820` — add `keyblind quickstart` one-command onboarding

**Caption:**

I added `keyblind quickstart`.

One command that installs the vault, initializes encryption, and configures
Claude Code MCP. No reading docs, no multi-step setup.

For a security tool, the setup is the product. If it takes three commands and a
README, most people never finish. One command means people actually end up
protected.

That's the whole design philosophy: security that's too easy to skip.

`#keyblind #onboarding #aisecurity #developertools #buildinpublic`

**Slides:**

1. **`keyblind quickstart`** — zero to vault in one command.
2. **The old flow** — install, init, configure MCP, restart, three docs open.
3. **The new flow** — one command, done.
4. **What it does** — creates the vault, generates the key, wires up Claude Code MCP.
5. **Why it matters** — security tools lose users at the setup step.
6. **The philosophy** — protection that's too easy to skip.
7. **Try it** — `npm i -g keyblind && keyblind quickstart`.

---

## 8. Zero production vulnerabilities

**Commit:** `96d1991` — pin transitive deps to patched versions (zero prod audit)

**Caption:**

Keyblind now ships with zero known production vulnerabilities.

I pinned every transitive dependency to patched versions so `npm audit` comes
back clean on the production tree.

For a secrets vault, a vulnerable dependency isn't a code smell, it's a direct
threat. A tool that holds your keys has to be as clean at the dependency layer
as it is at the crypto layer.

Trust is earned in the supply chain, one pinned version at a time.

`#keyblind #supplychain #security #npm #oss #buildinpublic`

**Slides:**

1. **Zero prod vulnerabilities** — `npm audit` is clean on the production tree.
2. **Why it matters** — a secrets vault can't afford a vulnerable dependency.
3. **The fix** — pinned every transitive dep to a patched version.
4. **The threat model** — your keys are only as safe as the whole dependency chain.
5. **Crypto isn't enough** — AES-256-GCM means little if a dep below it is backdoored.
6. **The discipline** — audit on every release, never let it drift.
7. **Check it** — `npm i -g keyblind && npm audit --omit=dev`.

---

## 9. I deleted a feature on purpose

**Commit:** `771d12a` — remove Let's Encrypt/HTTPS feature and acme-client dependency

**Caption:**

I deleted Keyblind's built-in HTTPS server and the Let's Encrypt client that
powered it.

On paper it was a feature. In practice it was 188 lines of code plus a dependency
tree that added attack surface to a tool whose entire job is not leaking secrets.

The dashboard now runs behind the tools people already trust. Smaller code, fewer
dependencies, less to exploit.

Sometimes the best security feature is the one you remove.

`#keyblind #security #minimalism #buildinpublic`

**Slides:**

1. **I removed a feature on purpose** — the built-in HTTPS server is gone.
2. **What it was** — automatic Let's Encrypt TLS for the local dashboard.
3. **Why it sounded good** — HTTPS everywhere, zero config.
4. **Why I killed it** — 188 lines plus a dependency tree, all adding attack surface.
5. **The tradeoff** — a secrets tool shouldn't bundle its own TLS stack.
6. **Less is more** — fewer dependencies, less to exploit, easier to audit.
7. **The lesson** — the best security feature is sometimes the one you delete.
8. **The result** — smaller code, cleaner `npm audit`, same dashboard.

---

## 10. Docs that reflect reality

**Commit:** `5daf174` — reflect that setup-mcp now configures Cline and Zed

**Caption:**

Updated the docs to match what the code already does.

Keyblind's `setup-mcp` now configures Cline and Zed, and the README and editor
guide finally say so.

It's a small commit, but I treat docs as part of the feature. A tool can work
perfectly and still lose users because the docs are one release behind.

Feature shipped is feature documented, or it didn't ship.

`#keyblind #documentation #developertools #buildinpublic`

**Slides:**

1. **Docs that reflect reality** — the editor guide now says Cline and Zed.
2. **The commit** — tiny, but it closes the loop on the Cline + Zed feature.
3. **The rule** — a feature isn't shipped until the docs say so.
4. **Why devs care** — they check the README before they check the source.
5. **The gap** — stale docs silently cost you users even when the code works.
6. **The habit** — doc updates land in the same PR as the feature, not later.
7. **The result** — README, editor guide, and code all agree.

---

## Notes

- Square canvas: 1080x1080. Keep slides to one headline + one short line.
- Voice is solo-founder, build-in-public, no em-dashes.
- Rotate hashtags per post; 3-6 relevant tags max.
- Slide 1 is the hook (the big claim), the last slide is always a concrete CTA.
