import { describe, expect, it } from "vitest";
import { listDocuments, memorySource } from "../src/index.ts";
import { fixtures } from "@sdlc-hub/fixtures";

describe("listDocuments", () => {
  it("lists the feature's documents with owner and sign-off state", () => {
    const f = fixtures["stale-signoff"]!;
    const docs = listDocuments(memorySource(f.main), "stale-flows");
    const by = Object.fromEntries(docs.map((d) => [d.path, d]));
    expect(by["spec.md"]).toMatchObject({ owner: "po", signoff: "current" });
    expect(by["ux-flows.md"]).toMatchObject({ owner: "designer", signoff: "stale" });
    expect(by[".size"]).toMatchObject({ owner: "po", signoff: "none" });
    expect(by["hub/signoffs.yaml"]).toBeUndefined();
  });

  it("orders documents by the flow and names team-owned ones", () => {
    const f = fixtures["demo"]!;
    const docs = listDocuments(memorySource(f.main), "tasks-issues").map((d) => [d.path, d.owner]);
    expect(docs.slice(0, 4)).toEqual([["spec.md", "po"], [".size", "po"], [".route", "po"], ["ux-flows.md", "designer"]]);
    expect(docs).toContainEqual(["contracts/openapi.yaml", "dev"]);
    expect(docs).toContainEqual(["hub/bugs/BUG-0012.md", "qa"]);
  });
});
