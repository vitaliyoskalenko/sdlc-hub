// Bundles the CLI, server and core into one ES module file. In phase 1b this becomes hub/cli.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.mjs",
  logLevel: "warning",
  // Some dependencies are CommonJS and call require(); give the ES module one.
  banner: { js: "import { createRequire as __hubRequire } from 'node:module'; const require = __hubRequire(import.meta.url);" },
});
