// Production build for the npm package.
//
// Compiles src/*.ts to dist/*.js with esbuild so we can bake compile-time flags.
// process.env.KEYBLIND_DEV is defined to "false" and minified away, so the
// free-tier secret-limit bypass never ships in the published artifact. It only
// works when running from source (tests/CI). Type declarations are emitted
// separately by tsc (see package.json "build").
import { build } from "esbuild";
import { readdirSync, rmSync, existsSync } from "node:fs";

// Remove stale sourcemaps from prior builds. We ship without maps so the
// published tarball contains no embedded original source.
if (existsSync("dist")) {
  for (const f of readdirSync("dist")) {
    if (f.endsWith(".map")) rmSync(`dist/${f}`, { force: true });
  }
}

const entries = readdirSync("src")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => `src/${f}`);

await build({
  entryPoints: entries,
  outdir: "dist",
  outbase: "src",
  platform: "node",
  format: "esm",
  target: "node18",
  define: { "process.env.KEYBLIND_DEV": '"false"' },
  minify: true,
});
