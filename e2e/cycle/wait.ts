// Waits until a merge request of the cycle merged, closed or its pipeline failed, and says which.
//   node --experimental-transform-types --no-warnings e2e/cycle/wait.ts <repo> <iid>

import { jobLog, projectId, root, settle } from "./lib.ts";

const [repo, iid] = process.argv.slice(2);
if (!repo || !iid) throw new Error("wait.ts <repo> <iid>");
const m = await settle(root(), projectId(repo), Number(iid), 20);
console.log(`${repo} !${iid} ${m.state} (pipeline ${m.head_pipeline?.status ?? "none"}): ${m.title}`);
if (m.state !== "merged" && m.head_pipeline) console.log(await jobLog(projectId(repo), m.head_pipeline.id, "hub-guard"));
process.exit(m.state === "merged" ? 0 : 1);
