import { describe, expect, it } from "vitest";
import { parseConfig } from "@sdlc-hub/core";
import { CONFIG } from "@sdlc-hub/fixtures";
import { checklistOf } from "../src/checklist.ts";

const config = parseConfig(CONFIG, "c").value!;

describe("the host checklist on Settings", () => {
  it("reads what install set up on GitLab, and warns of a token close to its end", async () => {
    const answers: Record<string, unknown> = {
      "/projects/shop%2Fproduct-specs": { id: 1, ci_config_path: "ci/product-specs.yml@shop/hub-ci", only_allow_merge_if_pipeline_succeeds: true, forking_access_level: "disabled" },
      "/projects/1/protected_branches/main": { name: "main", push_access_levels: [{ access_level: 0 }], merge_access_levels: [{ access_level: 30 }] },
      "/projects/1/repository/branches/hub-state": { name: "hub-state", commit: { id: "a" } },
      "/projects/1/access_tokens": [{ id: 1, name: "hub-report", active: true, revoked: false, expires_at: "2027-09-01" }, { id: 2, name: "hub-guard", active: true, revoked: false, expires_at: "2026-10-20" }],
      "/groups/shop": { id: 9, full_path: "shop" },
      "/groups/9/variables/HUB_STATE_TOKEN": { key: "HUB_STATE_TOKEN" },
      "/projects/1/variables/HUB_GUARD_TOKEN": { key: "HUB_GUARD_TOKEN" },
    };
    const fetcher = (async (url: string) => {
      const path = String(url).replace("https://gitlab.example.com/api/v4", "");
      return path in answers ? new Response(JSON.stringify(answers[path]), { status: 200 }) : new Response(JSON.stringify({ message: "404 Not Found" }), { status: 404 });
    }) as typeof fetch;
    const r = await checklistOf(config, { fill: () => "glpat", fetcher, now: () => new Date("2026-10-10T00:00:00Z") })();
    if ("error" in r) throw new Error(r.error);
    const text = (s: RegExp) => r.items.find((i) => s.test(i.text));
    expect(text(/takes no pushes/)?.ok).toBe(true);
    expect(text(/HUB_STATE_TOKEN is set; its token expires on 2027-09-01/)?.ok).toBe(true);
    expect(text(/HUB_GUARD_TOKEN expires on 2026-10-20, in 10 days: renew it/)?.ok).toBe(false);
    expect(text(/HUB_FANOUT_TOKEN_BACKEND is missing: run setup again/)?.ok).toBe(false);
  });

  it("says when this machine has no token to read the host", async () => {
    expect(await checklistOf(config, { fill: () => undefined })()).toEqual({ error: expect.stringMatching(/no token for gitlab\.example\.com/) });
  });
});
