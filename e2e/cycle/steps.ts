// Prints every step of a feature as the hub detects it on a person's machine: status, who, and why.
//   node --experimental-transform-types --no-warnings e2e/cycle/steps.ts <user> <slug>

import { detectFeature } from "@sdlc-hub/core";
import { openProject } from "@sdlc-hub/git";
import { clone } from "./lib.ts";

const [user, slug] = process.argv.slice(2);
if (!user || !slug) throw new Error("steps.ts <user> <slug>");
const open = openProject(clone(user, "product-specs"));
const s = detectFeature(open.project!, open.view, slug);
s.steps.forEach((x, i) =>
  console.log(`${String(i + 1).padStart(2)} ${x.id.padEnd(12)} ${x.status.padEnd(8)} ${x.waitingOn?.length ? `waits on ${x.waitingOn.join(", ")}` : x.by ? `by ${x.by}` : ""}${x.reason ? ` · ${x.reason}` : ""}${x.source ? ` [${x.source}]` : ""}`),
);
console.log(`current: ${s.current}${s.warnings.length ? `\nwarnings: ${s.warnings.join(" | ")}` : ""}`);
