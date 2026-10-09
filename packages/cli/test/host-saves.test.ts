import { describe, expect, it } from "vitest";
import type { Config } from "@sdlc-hub/core";
import { hostSaves } from "../src/host-saves.ts";

const config = (provider: "gitlab" | "github", host: string, auto_merge?: boolean) => ({ git: { provider, host, namespace: "shop", repo: "product-specs", ...(auto_merge === undefined ? {} : { auto_merge }) } }) as Config;

describe("how a save opens its request", () => {
  it("leaves GitLab to its push options", () => {
    expect(hostSaves(config("gitlab", "gitlab.example.com"))).toEqual({});
  });

  it("opens a GitHub pull request with the person's own token and sets it to merge itself", async () => {
    const calls: { url: string; auth: string; body: unknown }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") ?? "", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const answer = String(url).endsWith("/pulls") ? { number: 12, node_id: "PR_12", html_url: "https://github.com/shop/product-specs/pull/12" } : { data: {} };
      return new Response(JSON.stringify(answer), { status: 200 });
    }) as typeof fetch;
    const asked: string[] = [];
    const o = hostSaves(config("github", "github.com"), { fill: (web) => (asked.push(web), "ghp_person"), fetcher });
    expect(o.pushOptions!("t", "main")).toEqual([]);
    expect(await o.propose!({ branch: "hub/olena.k/x-1", title: "Sign off clarify", target: "main" })).toEqual({ iid: 12, url: "https://github.com/shop/product-specs/pull/12" });
    expect(asked).toEqual(["https://github.com"]);
    expect(calls.map((c) => c.url)).toEqual(["https://api.github.com/repos/shop/product-specs/pulls", "https://api.github.com/graphql"]);
    expect(calls[0]!.body).toMatchObject({ head: "hub/olena.k/x-1", base: "main", title: "Sign off clarify" });
    expect(calls.every((c) => c.auth.includes("ghp_person"))).toBe(true);
  });

  it("says how to sign in when git has no token for GitHub", async () => {
    const o = hostSaves(config("github", "github.example.com"), { fill: () => undefined });
    await expect(o.propose!({ branch: "b", title: "t", target: "main" })).rejects.toThrow(/no token for github\.example\.com.*gh auth login/);
  });

  it("without auto-merge, opens the request and leaves the merge to a person, on both hosts", async () => {
    expect(hostSaves(config("gitlab", "gitlab.example.com", false)).pushOptions!("t", "main")).not.toContain("merge_request.merge_when_pipeline_succeeds");
    const urls: string[] = [];
    const fetcher = (async (url: string) => (urls.push(String(url)), new Response(JSON.stringify({ number: 3, node_id: "PR_3", html_url: "https://github.com/shop/product-specs/pull/3" }), { status: 200 }))) as typeof fetch;
    expect(await hostSaves(config("github", "github.com", false), { fill: () => "t", fetcher }).propose!({ branch: "b", title: "t", target: "main" })).toEqual({ iid: 3, url: "https://github.com/shop/product-specs/pull/3" });
    expect(urls).toEqual(["https://api.github.com/repos/shop/product-specs/pulls"]);
  });

  it("nudges a GitHub pull request that should have merged: merges it, which GitHub allows once hub-guard passed", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url).replace("https://api.github.com", "")}`);
      return new Response(JSON.stringify(String(url).endsWith("/merge") ? { merged: true } : { state: "open", merged: false }), { status: 200 });
    }) as typeof fetch;
    await hostSaves(config("github", "github.com"), { fill: () => "t", fetcher }).nudge!({ mr: { iid: 9, url: "" } } as never);
    expect(calls).toEqual(["GET /repos/shop/product-specs/pulls/9", "PUT /repos/shop/product-specs/pulls/9/merge"]);
    expect(hostSaves(config("github", "github.com", false)).nudge).toBeUndefined();
  });
});
