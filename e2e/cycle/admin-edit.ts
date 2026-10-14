// The admin changes a file of .hub/ through a merge request that only the admin role passes, and waits for it.
//   node --experimental-transform-types --no-warnings e2e/cycle/admin-edit.ts <path> <from> <to>
// <from> is replaced by <to> once; the edit stops when <from> is not in the file.

import { as, projectId, settle } from "./lib.ts";

const [path, from, to] = process.argv.slice(2);
if (!path || from === undefined || to === undefined) throw new Error("admin-edit.ts <path> <from> <to>");
const admin = as("nazar.t");
const specs = projectId("product-specs");
const text = (await admin.file(specs, path, "main"))!;
if (!text.includes(from)) throw new Error(`${path} has no "${from}"`);
const mr = await admin.propose(specs, { target: "main", branch: `admin-${Date.now()}`, title: `Change ${path}`, description: "", actions: [{ action: "update", file_path: path, content: text.replace(from, to) }] });
console.log(`nazar.t · ${path}: !${mr.iid} ${(await settle(admin, specs, mr.iid)).state}`);
