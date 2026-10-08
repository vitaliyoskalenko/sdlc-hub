// The setup site's API, behind the server's setup mode: sign in with a pasted token, check, install.

import { execFileSync } from "node:child_process";
import { GitLab, HostError } from "@sdlc-hub/host";
import { hostUrl, hubFiles, install, preflight, problem, type InstallResult, type SetupAnswers } from "@sdlc-hub/install";
import type { SetupHandler } from "@sdlc-hub/server";

/** Where a pasted token is kept: the system keychain through git's credential helper, or memory only. */
export interface CredentialStore {
  save(url: string, token: string): boolean;
}

/** `git credential approve` stores the token with the helper git is configured with (osxkeychain, libsecret, GCM). */
export const gitCredentials: CredentialStore = {
  save(url, token) {
    try {
      const helper = execFileSync("git", ["config", "--get", "credential.helper"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (!helper) return false;
      const u = new URL(url);
      execFileSync("git", ["credential", "approve"], { input: `protocol=${u.protocol.replace(":", "")}\nhost=${u.host}\nusername=oauth2\npassword=${token}\n\n`, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    } catch {
      return false;
    }
  },
};

export interface SetupOptions {
  /** The vendored hub: this bundle. */
  hubBundle: () => string;
  credentials: CredentialStore;
  fetcher?: typeof fetch;
}

export function setupHandler(opts: SetupOptions): SetupHandler {
  let gl: GitLab | undefined;
  let signedIn: { user: string; name: string; address: string; version: string | null; stored: boolean } | undefined;
  let running = false;
  let result: InstallResult | undefined;

  const answersOf = (body: unknown): SetupAnswers | string => {
    const a = (body as { answers?: SetupAnswers } | null)?.answers;
    if (!a || typeof a !== "object") return "Send the answers";
    if (a.host !== "gitlab") return "Install on GitHub is not available yet. It comes in a later version; until then, GitLab only.";
    for (const s of [1, 2]) if (problem(a, s)) return problem(a, s);
    const { issues } = hubFiles(a, { user: signedIn?.user ?? "admin", name: signedIn?.name ?? "Admin" });
    const errs = issues.filter((i) => i.level === "error");
    return errs.length ? errs.map((i) => `${i.path ?? i.file}: ${i.message}`).join("; ") : a;
  };

  return {
    async handle(method, path, body, emit) {
      if (method === "GET" && path === "/state") return { status: 200, body: { signedIn: signedIn ?? null, running, result: result ?? null } };

      if (method === "POST" && path === "/signin") {
        const { host, address, token } = (body ?? {}) as { host?: string; address?: string; token?: string };
        if (host !== "gitlab") return { status: 400, body: { error: "Install on GitHub is not available yet. It comes in a later version; until then, GitLab only." } };
        if (!address?.trim() || !token?.trim()) return { status: 400, body: { error: "Enter the address and paste a token" } };
        const url = hostUrl(address.trim());
        const next = new GitLab(url, token.trim(), opts.fetcher);
        try {
          const me = await next.me();
          const version = await next.version().then((v) => v.version, () => null);
          gl = next;
          signedIn = { user: me.username, name: me.name, address: address.trim(), version, stored: opts.credentials.save(url, token.trim()) };
          return { status: 200, body: signedIn };
        } catch (e) {
          const msg = e instanceof HostError && e.status === 401 ? "GitLab refused the token. Paste a personal access token with the api scope." : `Cannot reach ${url}: ${(e as Error).message}`;
          return { status: 400, body: { error: msg } };
        }
      }

      if (method === "POST" && path === "/signout") {
        gl = undefined;
        signedIn = undefined;
        return { status: 200, body: { ok: true } };
      }

      if (method === "POST" && path === "/preview") {
        const a = answersOf(body);
        if (typeof a === "string") return { status: 400, body: { error: a } };
        return { status: 200, body: hubFiles(a, { user: signedIn?.user ?? "you", name: signedIn?.name ?? "You" }).files };
      }

      if (method === "POST" && (path === "/check" || path === "/install")) {
        if (!gl || !signedIn) return { status: 401, body: { error: "Sign in first" } };
        const a = answersOf(body);
        if (typeof a === "string") return { status: 400, body: { error: a } };
        if (path === "/check") return { status: 200, body: await preflight(a, gl) };
        if (running) return { status: 409, body: { error: "Install is already running" } };
        const pre = await preflight(a, gl);
        if (!pre.ok) return { status: 400, body: { error: "The checks did not pass", preflight: pre } };
        running = true;
        result = undefined;
        const client = gl;
        void install(a, client, { hubBundle: opts.hubBundle(), onStep: (e) => emit("step", e) })
          .then((r) => {
            result = r;
            emit("done", r);
          })
          .catch((e: unknown) => {
            result = { ok: false, steps: [], left: [] };
            emit("failed", { error: String(e instanceof Error ? e.message : e) });
          })
          .finally(() => (running = false));
        return { status: 202, body: { started: true } };
      }
      return { status: 404, body: { error: "Not found" } };
    },
  };
}
