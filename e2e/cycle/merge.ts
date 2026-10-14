// A person merges a merge request of the cycle, as the merge button would: set to merge when its pipeline succeeds.
//   node --experimental-transform-types --no-warnings e2e/cycle/merge.ts <user> <repo> <iid>

import { as, projectId, settle, wait } from "./lib.ts";

const [user, repo, iid] = process.argv.slice(2);
if (!user || !repo || !iid) throw new Error("merge.ts <user> <repo> <iid>");
const gl = as(user);
await gl.autoMerge(projectId(repo), Number(iid), wait);
const m = await settle(gl, projectId(repo), Number(iid), 20);
console.log(`${user} · ${repo} !${iid}: ${m.state}`);
process.exit(m.state === "merged" ? 0 : 1);
