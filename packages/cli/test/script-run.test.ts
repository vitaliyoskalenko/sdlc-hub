// Runs a generated setup script for real: the git host is a folder of bare repositories reached by file://, the
// hub is the bundle from `npm run build`, and claude is a stand-in on PATH that records its arguments.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseConfig, parsePersonState, parseRoles, setupScript } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";

const bundle = new URL("../dist/cli.mjs", import.meta.url).pathname;
const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

describe.skipIf(!existsSync(bundle))("a generated setup script, run", () => {
  it("clones the role's repositories, sets the person up and tells the admin", () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-script-run-"));
    temp.push(dir);
    const f = fixtures["demo"]!;
    const { root } = materialize(f, join(dir, "seed"));
    mkdirSync(join(root, "hub"), { recursive: true });
    copyFileSync(bundle, join(root, "hub/cli.js"));
    writeFileSync(join(root, "hub/package.json"), '{ "private": true, "type": "module" }\n');
    git(root, "add", "-A");
    git(root, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-m", "vendor the hub");
    // The host: shop/product-specs and the team repositories, bare.
    const host = join(dir, "host");
    const config = { ...parseConfig(f.main[".hub/config.yaml"]!, "c").value! };
    git(dir, "clone", "-q", "--bare", root, join(host, "shop/product-specs.git"));
    for (const t of config.teams) {
      const seed = join(dir, "seed", t.repo.split("/")[1]!);
      if (!existsSync(join(seed, ".git"))) {
        mkdirSync(seed, { recursive: true });
        git(seed, "init", "-q", "-b", "main");
      }
      git(seed, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "start");
      git(dir, "clone", "-q", "--bare", seed, join(host, `${t.repo}.git`));
    }
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$@" >> "${join(dir, "claude.log")}"\n`);
    chmodSync(join(bin, "claude"), 0o755);

    const person = parseRoles(f.main[".hub/roles.yaml"]!, "r").value!.people.find((p) => p.user === "petro.v")!;
    const script = setupScript({ config: { ...config, git: { ...config.git, host: `file://${host}` } }, person, shell: "bash", release: "x", date: "2026-10-08", by: "nazar.t" });
    writeFileSync(join(dir, "setup.sh"), script);
    const work = join(dir, "work");
    const r = spawnSync("bash", [join(dir, "setup.sh")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}`, HUB_WORK: work, HUB_NO_START: "1", HUB_KEYS_DIR: join(dir, "keys"), GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Petro V.", GIT_CONFIG_KEY_1: "user.email", GIT_CONFIG_VALUE_1: "petro.v@example.com" } });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("6/6 Opening the site");
    expect(existsSync(join(work, "product-specs/.git"))).toBe(true);
    expect(existsSync(join(work, "web-admin/.git"))).toBe(true); // Petro's team
    expect(existsSync(join(work, "backend"))).toBe(false); // not his
    expect(git(join(work, "product-specs"), "config", "hub.user")).toBe("petro.v");
    expect(readFileSync(join(dir, "claude.log"), "utf8")).toContain("plugin install hub@product-specs --scope local");
    expect(parsePersonState(git(join(host, "shop/product-specs.git"), "show", "hub-state:people/petro.v.json"), "p").value).toMatchObject({ user: "petro.v", assistant: "claude" });
    expect(r.stdout).toContain("✓ You are Petro V. (petro.v), dev");

    // Run again: it checks before it acts.
    const again = spawnSync("bash", [join(dir, "setup.sh")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}`, HUB_WORK: work, HUB_NO_START: "1", HUB_KEYS_DIR: join(dir, "keys") } });
    expect(again.status, `${again.stdout}\n${again.stderr}`).toBe(0);
  }, 120_000);
});

/** Docker with the image of e2e/pwsh (docker build -t sdlc-hub-pwsh e2e/pwsh): HUB_PWSH_IT=1 runs the test below. */
const pwsh = process.env["HUB_PWSH_IT"] === "1" && existsSync(bundle);

describe.skipIf(!pwsh)("a generated PowerShell setup script, run in PowerShell on Linux (claim 17, in part)", () => {
  it("clones the role's repositories and sets the person up, as the bash script does", () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-ps-run-"));
    temp.push(dir);
    const f = fixtures["demo"]!;
    const { root } = materialize(f, join(dir, "seed"));
    mkdirSync(join(root, "hub"), { recursive: true });
    copyFileSync(bundle, join(root, "hub/cli.js"));
    writeFileSync(join(root, "hub/package.json"), '{ "private": true, "type": "module" }\n');
    git(root, "add", "-A");
    git(root, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-m", "vendor the hub");
    const host = join(dir, "host");
    const config = { ...parseConfig(f.main[".hub/config.yaml"]!, "c").value! };
    git(dir, "clone", "-q", "--bare", root, join(host, "shop/product-specs.git"));
    for (const t of config.teams) {
      const seed = join(dir, "seed", t.repo.split("/")[1]!);
      if (!existsSync(join(seed, ".git"))) {
        mkdirSync(seed, { recursive: true });
        git(seed, "init", "-q", "-b", "main");
      }
      git(seed, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "start");
      git(dir, "clone", "-q", "--bare", seed, join(host, `${t.repo}.git`));
    }
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/claude"), `#!/bin/sh\necho "$@" >> /w/claude.log\n`);
    chmodSync(join(dir, "bin/claude"), 0o755);
    const person = parseRoles(f.main[".hub/roles.yaml"]!, "r").value!.people.find((p) => p.user === "petro.v")!;
    // Inside the container the folder is /w, and the host is file:///w/host.
    writeFileSync(join(dir, "setup.ps1"), setupScript({ config: { ...config, git: { ...config.git, host: "file:///w/host" } }, person, shell: "powershell", release: "x", date: "2026-10-10", by: "nazar.t" }));
    const run = () =>
      spawnSync("docker", ["run", "--rm", "-v", `${dir}:/w`, "-e", "HUB_WORK=/w/work", "-e", "HUB_NO_START=1", "-e", "HUB_KEYS_DIR=/w/keys", "-e", "PATH=/w/bin:/usr/local/bin:/usr/bin:/bin:/opt/microsoft/powershell/7", "-e", "GIT_CONFIG_COUNT=3", "-e", "GIT_CONFIG_KEY_0=user.name", "-e", "GIT_CONFIG_VALUE_0=Petro V.", "-e", "GIT_CONFIG_KEY_1=user.email", "-e", "GIT_CONFIG_VALUE_1=petro.v@example.com", "-e", "GIT_CONFIG_KEY_2=safe.directory", "-e", "GIT_CONFIG_VALUE_2=*", "sdlc-hub-pwsh", "pwsh", "-NoProfile", "-File", "/w/setup.ps1"], { encoding: "utf8", timeout: 300_000 });
    const r = run();
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("6/6 Opening the site");
    expect(r.stdout).toContain("✓ You are Petro V. (petro.v), dev");
    expect(existsSync(join(dir, "work/product-specs/.git"))).toBe(true);
    expect(existsSync(join(dir, "work/web-admin/.git"))).toBe(true);
    expect(existsSync(join(dir, "work/backend"))).toBe(false);
    expect(readFileSync(join(dir, "claude.log"), "utf8")).toContain("plugin install hub@product-specs --scope local");
    expect(parsePersonState(git(join(host, "shop/product-specs.git"), "show", "hub-state:people/petro.v.json"), "p").value).toMatchObject({ user: "petro.v" });
    const again = run();
    expect(again.status, `${again.stdout}\n${again.stderr}`).toBe(0);
  }, 600_000);
});
