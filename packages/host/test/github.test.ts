import { describe, expect, it } from "vitest";
import { GitHub, hubRuleset } from "../src/index.ts";

/** A fake GitHub answering from a table of "METHOD path" (path without the API base), recording every call. */
function fake(answers: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace("https://api.github.com", "")}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    if (!(key in answers)) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const a = answers[key];
    return new Response(JSON.stringify(typeof a === "function" ? (a as (b: unknown) => unknown)(body) : a), { status: 200 });
  }) as typeof fetch;
  return { gh: new GitHub("t", undefined, fetcher), calls };
}

describe("the GitHub client", () => {
  it("names everyone who pushed to a branch, its creation and force pushes included, and an unknown actor as such", async () => {
    const { gh } = fake({
      "GET /repos/shop/product-specs/activity?ref=refs%2Fheads%2Fhub%2Folena.k%2Fx&activity_type=branch_creation&per_page=100&page=1": [{ actor: { login: "olena.k" } }],
      "GET /repos/shop/product-specs/activity?ref=refs%2Fheads%2Fhub%2Folena.k%2Fx&activity_type=push&per_page=100&page=1": [{ actor: { login: "taras.m" } }],
      "GET /repos/shop/product-specs/activity?ref=refs%2Fheads%2Fhub%2Folena.k%2Fx&activity_type=force_push&per_page=100&page=1": [{ actor: null }],
    });
    expect(await gh.pushers("shop", "product-specs", "hub/olena.k/x")).toEqual(["(unknown)", "olena.k", "taras.m"]);
  });
  it("seals a secret to the repository's public key", async () => {
    const pk = Buffer.alloc(32, 9).toString("base64");
    const { gh, calls } = fake({ "GET /repos/shop/backend/actions/secrets/public-key": { key_id: "k1", key: pk }, "PUT /repos/shop/backend/actions/secrets/HUB_STATE_KEY": {} });
    await gh.setRepoSecret("shop", "backend", "HUB_STATE_KEY", "-----BEGIN KEY-----");
    const put = calls.find((c) => c.key.startsWith("PUT"))!.body as { encrypted_value: string; key_id: string };
    expect(put.key_id).toBe("k1");
    expect(Buffer.from(put.encrypted_value, "base64").length).toBe(32 + 16 + "-----BEGIN KEY-----".length);
    expect(put.encrypted_value).not.toContain("BEGIN");
  });
  it("sets auto-merge through GraphQL, waiting while GitHub refuses", async () => {
    let n = 0;
    const { gh, calls } = fake({ "POST /graphql": () => (++n < 3 ? { errors: [{ message: "Pull request is in clean status" }] } : { data: {} }) });
    await gh.autoMerge({ node_id: "PR_1" } as never, "MERGE", async () => undefined);
    expect(calls.filter((c) => c.key === "POST /graphql")).toHaveLength(3);
    expect((calls[0]!.body as { variables: unknown }).variables).toEqual({ id: "PR_1", method: "MERGE" });
  });
  it("has a ruleset for main: pull requests only, hub-guard required, no deletion or force push, nobody bypasses", () => {
    const r = hubRuleset(15368);
    expect(r.bypass_actors).toEqual([]);
    expect(r.rules.map((x) => x.type)).toEqual(["pull_request", "required_status_checks", "deletion", "non_fast_forward"]);
    expect(r.rules[1]!.parameters).toMatchObject({ required_status_checks: [{ context: "hub-guard", integration_id: 15368 }] });
  });
});

describe("a request that fails on the way", () => {
  it("is tried again, and the error names the cause after three tries", async () => {
    let n = 0;
    const flaky = (async () => {
      if (++n < 3) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      return new Response(JSON.stringify({ login: "nazar.t" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await new GitHub("t", undefined, flaky).me()).login).toBe("nazar.t");
    const down = (async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }) as unknown as typeof fetch;
    await expect(new GitHub("t", undefined, down).me()).rejects.toThrow("Could not reach GitHub for GET /user: fetch failed (ENOTFOUND)");
  }, 20_000);
});
