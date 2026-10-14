// Runs a command as a person of the cycle, in their clone of a repository:
//   node --experimental-transform-types --no-warnings e2e/cycle/as.ts <user> <repo> <command> [args...]
// For example: e2e/cycle/as.ts olena.k product-specs node hub/cli.js sync

import { spawnSync } from "node:child_process";
import { clone, envOf } from "./lib.ts";

const [user, repo, cmd, ...args] = process.argv.slice(2);
if (!user || !repo || !cmd) throw new Error("as.ts <user> <repo> <command> [args...]");
const dir = clone(user, repo);
const r = spawnSync(cmd, args, { cwd: dir, stdio: "inherit", env: envOf(user) });
process.exit(r.status ?? 1);
