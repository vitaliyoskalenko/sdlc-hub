// hub fanout: brings the shared files of each feature to the repositories of its teams, as a merge request on the branch
// hub/fanout that the team lead merges. Two ways, one set of files (fanoutFiles in core):
// - GitLab: the hub-fanout job on main of product-specs pushes to each team repository with that team's token
//   (HUB_FANOUT_TOKEN_<TEAM>), and push options open the merge request.
// - GitHub: a workflow in each team repository reads product-specs with its deploy key, runs `hub fanout --into .`,
//   and opens the pull request with its own token.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FANOUT_BRANCH, fanoutFiles, fanoutTokenVariable, loadProject, type FileSource } from "@sdlc-hub/core";
import { tokenEnv, type Line } from "@sdlc-hub/save";

const TITLE = "Shared files from product-specs (hub-fanout)";
export { fanoutTokenVariable };

/** Writes the files into a checkout and commits them on hub/fanout; false when the checkout already has them. */
export function writeFanout(dir: string, files: Record<string, string>, env: NodeJS.ProcessEnv): boolean {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("checkout", "-q", "-B", FANOUT_BRANCH);
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  // Only the copies: the team's own files in the same folders are not touched.
  git("add", "--", ...Object.keys(files));
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: dir, env }).status === 0) return false;
  git("commit", "-q", "-m", TITLE);
  return true;
}

const authorEnv = (env: NodeJS.ProcessEnv) => ({ ...env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "hub-fanout", GIT_AUTHOR_EMAIL: "hub-fanout@localhost", GIT_COMMITTER_NAME: "hub-fanout", GIT_COMMITTER_EMAIL: "hub-fanout@localhost" });

/** GitLab, from the product-specs pipeline: one merge request per team repository that has a token. */
export function fanoutPush(o: { specs: FileSource; sha: string; serverUrl: string; env: NodeJS.ProcessEnv; tokenUser?: string }): { ok: boolean; lines: Line[] } {
  const lines: Line[] = [];
  const project = loadProject(o.specs).value;
  if (!project) return { ok: false, lines: [{ ok: false, text: ".hub/ does not load on main" }] };
  for (const t of project.config.teams) {
    const files = fanoutFiles(o.specs, project.config, t.id, o.sha.slice(0, 12));
    if (!Object.keys(files).length) {
      lines.push({ ok: true, text: `${t.id}: no feature names this team yet`, blocking: false });
      continue;
    }
    const token = o.env[fanoutTokenVariable(t.id)];
    if (!token) {
      lines.push({ ok: false, text: `${t.id}: ${fanoutTokenVariable(t.id)} is not set; run setup again`, blocking: false });
      continue;
    }
    const env = authorEnv(tokenEnv(token, o.env, o.tokenUser));
    const url = `${o.serverUrl.replace(/\/+$/, "")}/${t.repo}.git`;
    const dir = mkdtempSync(join(tmpdir(), "hub-fanout-"));
    try {
      const head = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(execFileSync("git", ["ls-remote", "--symref", url, "HEAD"], { env, encoding: "utf8" }))?.[1] ?? "main";
      execFileSync("git", ["init", "-q"], { cwd: dir, env });
      execFileSync("git", ["fetch", "-q", "--depth", "1", url, head], { cwd: dir, env });
      execFileSync("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dir, env });
      if (!writeFanout(dir, files, env)) {
        lines.push({ ok: true, text: `${t.id}: ${t.repo} has the shared files already`, blocking: false });
        continue;
      }
      // An open merge request with the same files already: nothing to push.
      const open = /^([0-9a-f]+)\s/.exec(execFileSync("git", ["ls-remote", url, `refs/heads/${FANOUT_BRANCH}`], { env, encoding: "utf8" }))?.[1];
      if (open) {
        execFileSync("git", ["fetch", "-q", "--depth", "1", url, FANOUT_BRANCH], { cwd: dir, env });
        const tree = (ref: string) => execFileSync("git", ["rev-parse", `${ref}^{tree}`], { cwd: dir, env, encoding: "utf8" }).trim();
        if (tree("HEAD") === tree("FETCH_HEAD")) {
          lines.push({ ok: true, text: `${t.id}: the merge request on ${FANOUT_BRANCH} in ${t.repo} has these files already`, blocking: false });
          continue;
        }
      }
      // The branch starts from the team's default branch each time; an open merge request follows it.
      const options = ["merge_request.create", `merge_request.target=${head}`, "merge_request.remove_source_branch", `merge_request.title=${TITLE}`].flatMap((x) => ["-o", x]);
      execFileSync("git", ["push", "-q", "--force", ...options, url, `HEAD:refs/heads/${FANOUT_BRANCH}`], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
      lines.push({ ok: true, text: `${t.id}: proposed the shared files to ${t.repo} on ${FANOUT_BRANCH}; the team lead merges it` });
    } catch (e) {
      lines.push({ ok: false, text: `${t.id}: ${(e as Error).message.split("\n")[0]}`, blocking: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { ok: lines.every((l) => l.ok || l.blocking === false), lines };
}

/** GitHub, from a team repository's workflow: write the team's files into this checkout, on hub/fanout. */
export function fanoutInto(o: { specs: FileSource; sha: string; team: string; dir: string; env: NodeJS.ProcessEnv }): { changed: boolean; files: number } {
  const project = loadProject(o.specs).value;
  if (!project) throw new Error(".hub/ does not load on main of product-specs");
  if (!project.config.teams.some((t) => t.id === o.team)) throw new Error(`config.yaml has no team ${o.team}`);
  const files = fanoutFiles(o.specs, project.config, o.team, o.sha.slice(0, 12));
  if (!Object.keys(files).length || !existsSync(join(o.dir, ".git"))) return { changed: false, files: 0 };
  return { changed: writeFanout(o.dir, files, authorEnv(o.env)), files: Object.keys(files).length };
}
