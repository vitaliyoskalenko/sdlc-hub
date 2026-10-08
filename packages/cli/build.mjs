// Bundles the CLI, server, core and the built web app into one ES module file: hub/cli.js once vendored.
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = new URL("../web/dist", import.meta.url).pathname;
if (!existsSync(join(dist, "index.html"))) throw new Error("Build the web app first: npm run build -w @sdlc-hub/web");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}
const assets = Object.fromEntries(walk(dist).map((f) => [relative(dist, f), readFileSync(f).toString("base64")]));

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.mjs",
  logLevel: "warning",
  banner: { js: "import { createRequire as __hubRequire } from 'node:module'; const require = __hubRequire(import.meta.url);" },
  plugins: [
    {
      name: "web-assets",
      setup(b) {
        b.onLoad({ filter: /web-assets\.ts$/ }, () => ({ contents: `export const WEB_ASSETS = ${JSON.stringify(assets)};`, loader: "ts" }));
      },
    },
  ],
});
