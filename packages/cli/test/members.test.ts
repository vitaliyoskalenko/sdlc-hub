import { describe, expect, it } from "vitest";
import type { Config } from "@sdlc-hub/core";
import { membersOf } from "../src/members.ts";

const config = (provider: "gitlab" | "github") => ({ git: { provider, host: provider === "github" ? "github.com" : "gitlab.example.com", namespace: "shop", repo: "product-specs" } }) as Config;

describe("members of the group or organization", () => {
  it("lists the GitLab group's members with this machine's token, once in ten minutes", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => (urls.push(String(url)), new Response(JSON.stringify([{ username: "olena.k" }, { username: "taras.m" }]), { status: 200 }))) as typeof fetch;
    let t = 0;
    const m = membersOf(config("gitlab"), { fill: () => "glpat", fetcher, now: () => t });
    expect(await m()).toEqual({ users: ["olena.k", "taras.m"] });
    t = 60_000;
    await m();
    expect(urls).toEqual(["https://gitlab.example.com/api/v4/groups/shop/members/all?per_page=100&page=1"]);
  });

  it("lists the GitHub organization's members, and says when it cannot", async () => {
    const fetcher = (async () => new Response(JSON.stringify([{ login: "olena-k" }]), { status: 200 })) as unknown as typeof fetch;
    expect(await membersOf(config("github"), { fill: () => "t", fetcher })()).toEqual({ users: ["olena-k"] });
    expect(await membersOf(config("github"), { fill: () => undefined })()).toEqual({ error: expect.stringMatching(/no token for github\.com/) });
    const denied = (async () => new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })) as unknown as typeof fetch;
    expect(await membersOf(config("gitlab"), { fill: () => "t", fetcher: denied })()).toEqual({ error: expect.stringMatching(/Could not list the members/) });
  });
});
