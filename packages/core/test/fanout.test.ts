import { describe, expect, it } from "vitest";
import { base } from "@sdlc-hub/fixtures";
import { fanoutFiles, loadProject, memorySource, FANOUT_BRANCH } from "../src/index.ts";

const F = "docs/features";
const main = {
  ...base(),
  [`${F}/tasks-issues/spec.md`]: "# Tasks\n",
  [`${F}/tasks-issues/ux-flows.md`]: "# Flows\n",
  [`${F}/tasks-issues/contracts/openapi.yaml`]: "openapi: 3.1.0\n",
  [`${F}/tasks-issues/sad.md`]: "# SAD, the contract team's\n",
  [`${F}/tasks-issues/hub/feature.yaml`]: "title: Tasks\nowner: olena.k\nteams:\n  backend: { lead: taras.m }\n  web: { lead: petro.v }\n",
  [`${F}/returns/spec.md`]: "# Returns\n",
  [`${F}/returns/hub/feature.yaml`]: "title: Returns\nowner: olena.k\nteams:\n  backend: { lead: taras.m }\n",
  [`${F}/early/spec.md`]: "# Not at epic yet\n",
};
const project = loadProject(memorySource(base())).value!;

describe("fan-out: the shared files each team gets", () => {
  it("copies spec, flows, screens, test plan and contracts of the team's features, with a handoff note", () => {
    const web = fanoutFiles(memorySource(main), project.config, "web", "abc1234");
    expect(Object.keys(web).sort()).toEqual([`${F}/tasks-issues/_handoff.md`, `${F}/tasks-issues/contracts/openapi.yaml`, `${F}/tasks-issues/spec.md`, `${F}/tasks-issues/ux-flows.md`]);
    expect(web[`${F}/tasks-issues/spec.md`]).toBe("# Tasks\n"); // unchanged: tools read these files
    expect(web[`${F}/tasks-issues/_handoff.md`]).toMatch(/product-specs at abc1234[\s\S]*spec\.md[\s\S]*change them there/i);
    expect(Object.keys(fanoutFiles(memorySource(main), project.config, "backend", "abc1234")).filter((p) => p.endsWith("_handoff.md")).sort()).toEqual([`${F}/returns/_handoff.md`, `${F}/tasks-issues/_handoff.md`]);
  });

  it("gives nothing to a team no feature names yet, and names the branch it uses", () => {
    expect(fanoutFiles(memorySource(main), project.config, "ios", "abc1234")).toEqual({});
    expect(FANOUT_BRANCH).toBe("hub/fanout");
  });
});
