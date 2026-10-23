#!/usr/bin/env node
// Renders the Keyblind LinkedIn carousel slides to 1080x1080 PNGs (and a PDF
// per post) using headless Chrome. Run from the repo root:
//   node scripts/generate-carousel-images.mjs

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "carousel");
const TMP = path.join(OUT, ".tmp-html");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCALE = 2; // 2x for crispness -> 2160x2160 output

const ACCENT = "#58a6ff";
const GREEN = "#3fb950";

const SHIELD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderSlide({ title, body, code, kicker, kind = "point", index, total }) {
  const isHook = kind === "hook";
  const isCta = kind === "cta";
  const h1Size = isHook ? "74px" : isCta ? "58px" : "52px";
  const bodySize = isHook ? "34px" : "30px";
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: radial-gradient(1200px 800px at 82% -10%, rgba(88,166,255,0.18), transparent 60%),
                radial-gradient(900px 700px at -10% 110%, rgba(88,166,255,0.08), transparent 55%),
                linear-gradient(160deg, #0d1117 0%, #0a0e14 100%);
    color: #f0f6fc;
    display: flex; flex-direction: column;
    padding: 64px 72px;
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 10px; color: ${ACCENT}; font-weight: 700; font-size: 24px; letter-spacing: 0.2px; }
  .pager { color: #8b949e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; letter-spacing: 2px; }
  main { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: ${isHook || isCta ? "center" : "flex-start"}; text-align: ${isHook || isCta ? "center" : "left"}; max-width: 940px; ${isHook || isCta ? "margin: 0 auto;" : ""} }
  .kicker { color: ${ACCENT}; text-transform: uppercase; letter-spacing: 4px; font-size: 20px; font-weight: 700; margin-bottom: 22px; }
  h1 { font-size: ${h1Size}; line-height: 1.08; font-weight: 800; letter-spacing: -0.5px; }
  .bar { width: ${isHook || isCta ? "88px" : "64px"}; height: 6px; border-radius: 3px; background: linear-gradient(90deg, ${ACCENT}, ${GREEN}); margin: 28px ${isHook || isCta ? "auto" : "0"}; }
  p.body { color: #b1bac4; font-size: ${bodySize}; line-height: 1.45; max-width: 840px; }
  .code {
    margin-top: 30px; padding: 22px 30px; border-radius: 14px;
    background: #161b22; border: 1px solid #30363d;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; color: ${GREEN};
  }
  footer { display: flex; justify-content: space-between; align-items: center; color: #6e7681; font-size: 20px; }
  footer .dot { color: ${ACCENT}; font-weight: 700; }
</style></head>
<body>
  <header>
    <div class="brand">${SHIELD_SVG} Keyblind</div>
    <div class="pager">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </header>
  <main>
    ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}
    <h1>${esc(title)}</h1>
    <div class="bar"></div>
    ${body ? `<p class="body">${esc(body)}</p>` : ""}
    ${code ? `<div class="code">${esc(code)}</div>` : ""}
  </main>
  <footer><span><span class="dot">keyblind</span>.dev</span><span>blind AI to your keys</span></footer>
</body></html>`;
}

const posts = [
  {
    slug: "01-skill",
    title: "Keyblind is now a Claude Code skill",
    slides: [
      { kind: "hook", kicker: "Keyblind x Claude Code", title: "Keyblind is now a native Claude Code skill", body: "The agent self-discovers how to keep your keys safe." },
      { title: "The problem", body: "Agents can't tell the difference between code and secrets, so plaintext leaks into transcripts." },
      { title: "What a skill is", body: "A small prompt bundle the agent loads on demand. No config, no guessing." },
      { title: "What it teaches the agent", body: "Store encrypted, resolve at runtime, sandbox .env, never echo plaintext." },
      { title: "The moment it fires", body: "The user asks to store or use a key, the skill shows the safe path automatically." },
      { title: "Why runtime resolution matters", body: "The decrypted value is injected just in time, never written to the conversation." },
      { title: "The stack", body: "AES-256-GCM vault, 27 MCP tools, zero network, zero telemetry." },
      { kind: "cta", title: "Try it", code: "npm i -g keyblind && keyblind quickstart" },
    ],
  },
  {
    slug: "02-smithery",
    title: "One-click install from Smithery",
    slides: [
      { kind: "hook", kicker: "Keyblind x Smithery", title: "Keyblind is on Smithery", body: "One click to install a secrets vault for your agent." },
      { title: "The usual pain", body: "Hand-editing MCP config JSON to wire up a server." },
      { title: "Registry install", body: "Search, add, done. The server config is handled for you." },
      { title: "What you get", body: "AES-256-GCM encryption, runtime resolution, sandboxing." },
      { title: "Zero network", body: "Everything stays on your machine. No cloud, no account." },
      { title: "Why this matters", body: "Lower install friction means more devs actually protect their keys." },
      { kind: "cta", title: "Try it", code: "npm i -g keyblind" },
    ],
  },
  {
    slug: "03-positioning",
    title: "Repositioned for the agentic era",
    slides: [
      { kind: "hook", kicker: "Positioning", title: "Repositioned", body: "A sharper story for the same product." },
      { title: "The core claim", body: "Your AI agent never sees your real keys." },
      { title: "How", body: "Encrypt at rest, resolve at runtime, plaintext never hits the transcript." },
      { title: "Where it changed", body: "README, landing page, Product Hunt, Glama, registry manifest." },
      { title: "Why now", body: "Agentic coding is mainstream; secret leaks are the new supply-chain risk." },
      { title: "Positioning is never done", body: "Each pass gets one line closer to the truth." },
      { kind: "cta", title: "Try it", code: "keyblind quickstart" },
    ],
  },
  {
    slug: "04-v088",
    title: "v0.8.8 shipped",
    slides: [
      { kind: "hook", kicker: "Release", title: "v0.8.8 is live", body: "The fastest path to safe release." },
      { title: "One-command onboarding", body: "keyblind quickstart sets up the vault and MCP." },
      { title: "Project-local config", body: "setup-mcp --local writes per-repo editor config." },
      { title: "More editors", body: "Cline and Zed now wired in one command." },
      { title: "Still zero trust in the network", body: "Fully local, no cloud, no telemetry." },
      { title: "The point", body: "Protection you set up in seconds, not an afternoon." },
      { kind: "cta", title: "Get it", code: "npm i -g keyblind" },
    ],
  },
  {
    slug: "05-setup-local",
    title: "Team-wide editor config in one command",
    slides: [
      { kind: "hook", kicker: "New command", title: "setup-mcp --local", body: "Commit your agent's secrets vault config to the repo." },
      { title: "The old way", body: "Each dev hand-wires MCP config in their own $HOME." },
      { title: "The new way", body: "Config lives in the repo; anyone who clones it is covered." },
      { title: "What gets written", body: ".cursor/mcp.json, .windsurf/mcp.json, Copilot, Cline." },
      { title: "Safe to commit", body: "The file holds only keyblind start, never a secret." },
      { title: "Idempotent", body: "Re-run it; it merges without clobbering existing servers." },
      { title: "The shift", body: "Secret hygiene moves from \"someone remembered\" to \"the repo enforces it.\"" },
      { kind: "cta", title: "Try it", code: "keyblind setup-mcp --local --editors cursor,windsurf" },
    ],
  },
  {
    slug: "06-cline-zed",
    title: "Cline and Zed join the party",
    slides: [
      { kind: "hook", kicker: "Editor coverage", title: "Cline and Zed support", body: "One command now configures them too." },
      { title: "The promise", body: "Works with every MCP client, not just one editor." },
      { title: "Claude Code", body: "Already wired since day one." },
      { title: "Cline", body: "Now auto-configured from the same setup-mcp command." },
      { title: "Zed", body: "Same treatment, same single command." },
      { title: "Why", body: "Devs switch editors, but they shouldn't lose their secret protection." },
      { kind: "cta", title: "Try it", code: "keyblind setup-mcp" },
    ],
  },
  {
    slug: "07-quickstart",
    title: "From zero to vault in one command",
    slides: [
      { kind: "hook", kicker: "Onboarding", title: "keyblind quickstart", body: "Zero to vault in one command." },
      { title: "The old flow", body: "Install, init, configure MCP, restart. Three docs open." },
      { title: "The new flow", body: "One command, done." },
      { title: "What it does", body: "Creates the vault, generates the key, wires up Claude Code MCP." },
      { title: "Why it matters", body: "Security tools lose users at the setup step." },
      { title: "The philosophy", body: "Protection that's too easy to skip." },
      { kind: "cta", title: "Try it", code: "npm i -g keyblind && keyblind quickstart" },
    ],
  },
  {
    slug: "08-zero-vulns",
    title: "Zero production vulnerabilities",
    slides: [
      { kind: "hook", kicker: "Supply chain", title: "Zero prod vulnerabilities", body: "npm audit is clean on the production tree." },
      { title: "Why it matters", body: "A secrets vault can't afford a vulnerable dependency." },
      { title: "The fix", body: "Pinned every transitive dep to a patched version." },
      { title: "The threat model", body: "Your keys are only as safe as the whole dependency chain." },
      { title: "Crypto isn't enough", body: "AES-256-GCM means little if a dep below it is backdoored." },
      { title: "The discipline", body: "Audit on every release. Never let it drift." },
      { kind: "cta", title: "Check it", code: "npm i -g keyblind && npm audit --omit=dev" },
    ],
  },
  {
    slug: "09-delete-feature",
    title: "I deleted a feature on purpose",
    slides: [
      { kind: "hook", kicker: "Security minimalism", title: "I removed a feature on purpose", body: "The built-in HTTPS server is gone." },
      { title: "What it was", body: "Automatic Let's Encrypt TLS for the local dashboard." },
      { title: "Why it sounded good", body: "HTTPS everywhere, zero config." },
      { title: "Why I killed it", body: "188 lines plus a dependency tree, all adding attack surface." },
      { title: "The tradeoff", body: "A secrets tool shouldn't bundle its own TLS stack." },
      { title: "Less is more", body: "Fewer dependencies, less to exploit, easier to audit." },
      { title: "The lesson", body: "The best security feature is sometimes the one you delete." },
      { kind: "cta", title: "The result", body: "Smaller code, cleaner npm audit, same dashboard." },
    ],
  },
  {
    slug: "10-docs",
    title: "Docs that reflect reality",
    slides: [
      { kind: "hook", kicker: "Documentation", title: "Docs that reflect reality", body: "The editor guide now says Cline and Zed." },
      { title: "The commit", body: "Tiny, but it closes the loop on the Cline + Zed feature." },
      { title: "The rule", body: "A feature isn't shipped until the docs say so." },
      { title: "Why devs care", body: "They check the README before they check the source." },
      { title: "The gap", body: "Stale docs silently cost you users even when the code works." },
      { title: "The habit", body: "Doc updates land in the same PR as the feature, not later." },
      { kind: "cta", title: "The result", body: "README, editor guide, and code all agree." },
    ],
  },
];

function screenshot(htmlPath, outPng) {
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=" + SCALE,
    "--window-size=1080,1080",
    "--default-background-color=00000000",
    "--virtual-time-budget=2000",
    "--screenshot=" + outPng,
    "file://" + htmlPath,
  ], { stdio: "inherit" });
}

function pdf(htmlPath, outPdf) {
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--print-to-pdf=" + outPdf,
    "file://" + htmlPath,
  ], { stdio: "inherit" });
}

function renderPostPdf(post) {
  const pages = post.slides.map((s, i) => {
    const inner = renderSlide({ ...s, index: i + 1, total: post.slides.length });
    // Extract body content of the slide (strip the outer doctype wrapper)
    const body = inner.replace(/[\s\S]*?<body>/, "").replace(/<\/body>[\s\S]*/, "");
    return `<div class="page">${body}</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 1080px 1080px; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { margin: 0; }
    .page { width: 1080px; height: 1080px; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
  </style></head><body>${pages}</body></html>`;
}

fs.mkdirSync(TMP, { recursive: true });

for (const post of posts) {
  const dir = path.join(OUT, post.slug);
  const htmlDir = path.join(TMP, post.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(htmlDir, { recursive: true });

  post.slides.forEach((slide, i) => {
    const html = renderSlide({ ...slide, index: i + 1, total: post.slides.length });
    const htmlPath = path.join(htmlDir, `slide-${String(i + 1).padStart(2, "0")}.html`);
    fs.writeFileSync(htmlPath, html);
    const pngPath = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    screenshot(htmlPath, pngPath);
  });

  const pdfHtml = renderPostPdf(post);
  const pdfHtmlPath = path.join(htmlDir, "carousel.html");
  fs.writeFileSync(pdfHtmlPath, pdfHtml);
  pdf(pdfHtmlPath, path.join(dir, "carousel.pdf"));

  console.log(`✓ ${post.slug} — ${post.slides.length} slides + PDF`);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log("\nDone. Output in " + OUT);
