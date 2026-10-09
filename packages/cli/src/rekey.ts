// hub usage rekey: when the readers of per-person usage change (a new PM, a new admin, a new key), the records in
// hub-state are still encrypted to the old ones. The admin's or a PM's machine can read every record, so it decrypts
// each and encrypts it again to the readers roles.yaml names now: the person, the admins and the PMs.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gitIdentity, openProject, personOf, refSource } from "@sdlc-hub/git";
import { writeHubState, type Line } from "@sdlc-hub/save";
import { decryptWith, encryptTo, keyStore, recipientsFor } from "@sdlc-hub/usage";
import { remoteUrl, runCommand, type Run } from "./person.ts";

export async function rekey(o: { root: string; run?: Run }): Promise<{ ok: boolean; lines: Line[] }> {
  const run = o.run ?? runCommand;
  const lines: Line[] = [];
  const say = (ok: boolean, text: string, blocking = true) => lines.push({ ok, text, blocking });
  const done = () => ({ ok: lines.every((l) => l.ok || l.blocking === false), lines });

  const fetched = run("git", ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main", "+refs/heads/hub-state:refs/remotes/origin/hub-state"], o.root);
  if (fetched.status !== 0) {
    say(false, `Could not reach the git host: ${fetched.out.split("\n").at(-1)}`);
    return done();
  }
  const { project } = openProject(o.root);
  if (!project) {
    say(false, ".hub/ does not load");
    return done();
  }
  const user = personOf(o.root, project.roles);
  const person = project.roles.people.find((p) => p.user === user);
  if (!person || !(person.roles.includes("admin") || person.roles.includes("pm"))) {
    say(false, "Only the admin or a PM can rekey: they are the ones who can read every person's usage");
    return done();
  }
  const remote = remoteUrl(o.root, run);
  const identity = keyStore(remote).load();
  if (!identity) {
    say(false, "This machine has no usage key for this project: run your setup script first");
    return done();
  }
  // The readers come from main as it is on the remote: keys and roles merged there are the ones that count.
  const main = refSource(o.root, "refs/remotes/origin/main");
  const state = refSource(o.root, "refs/remotes/origin/hub-state");
  const files: Record<string, string> = {};
  const unreadable: string[] = [];
  const noReaders: string[] = [];
  for (const p of state.list("metrics")) {
    const m = /^metrics\/\d{4}-\d{2}\/([^/]+)\/[^/]+\.jsonl\.age$/.exec(p);
    if (!m) continue;
    const text = await decryptWith(state.read(p) ?? "", [identity]);
    if (text === undefined) {
      unreadable.push(p);
      continue;
    }
    const recipients = recipientsFor(main, project.roles, m[1]!);
    if (!recipients.length) {
      noReaders.push(p);
      continue;
    }
    files[p] = await encryptTo(text, recipients);
  }
  if (!Object.keys(files).length) say(true, "No usage record to rekey", false);
  else {
    const id = gitIdentity(o.root);
    try {
      writeHubState({
        url: remote,
        message: `hub usage rekey: ${Object.keys(files).length} records for the readers in roles.yaml`,
        author: { name: id.name || person.user, email: id.email || `${person.user}@localhost` },
        edit(d) {
          for (const [p, t] of Object.entries(files)) {
            mkdirSync(dirname(join(d, p)), { recursive: true });
            writeFileSync(join(d, p), t);
          }
          return true;
        },
      });
      say(true, `Encrypted ${Object.keys(files).length} usage record${Object.keys(files).length === 1 ? "" : "s"} again, to each person, the admins and the PMs`);
    } catch (e) {
      say(false, `Could not push the records: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  if (unreadable.length) say(false, `${unreadable.length} record${unreadable.length === 1 ? " was" : "s were"} not encrypted to this machine's key and stay as they are: ${unreadable.join(", ")}. Run rekey on a machine whose key they name.`, false);
  if (noReaders.length) say(false, `${noReaders.length} record${noReaders.length === 1 ? " has" : "s have"} no reader with a key in .hub/keys/ and stay as they are`, false);
  return done();
}
