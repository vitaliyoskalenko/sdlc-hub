// Prints every step of a feature as the hub detects it on a person's machine: status, who, and why.
//   node --experimental-transform-types --no-warnings e2e/cycle/steps.ts <user> <slug>

import { detectFeature } from "@sdlc-hub/core";
import { openProject } from "@sdlc-hub/git";
import { join } from "node:path";
import { clone, home, run } from "./lib.ts";

const [user, slug] = process.argv.slice(2);
if (!user || !slug) throw new Error("steps.ts <user> <slug>");
// As the person sees it after hub sync: main moved on.
const dir = clone(user, "product-specs");
run(user, dir, "node", ["hub/cli.js", "sync"], { PATH: `${join(home(user), "bin")}:${process.env["PATH"]}` });
const open = openProject(dir);
const s = detectFeature(open.project!, open.view, slug);
s.steps.forEach((x, i) =>
  console.log(`${String(i + 1).padStart(2)} ${x.id.padEnd(12)} ${x.status.padEnd(8)} ${x.waitingOn?.length ? `waits on ${x.waitingOn.join(", ")}` : x.by ? `by ${x.by}` : ""}${x.reason ? ` · ${x.reason}` : ""}${x.source ? ` [${x.source}]` : ""}`),
);
for (const w of s.waits) console.log(`wait: ${w.team}:${w.task} on ${w.on}${w.done ? " (over)" : ""}`);
console.log(`current: ${s.current}${s.warnings.length ? `\nwarnings: ${s.warnings.join(" | ")}` : ""}`);
