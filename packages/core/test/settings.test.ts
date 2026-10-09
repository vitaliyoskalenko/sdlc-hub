import { describe, expect, it } from "vitest";
import { CONFIG } from "@sdlc-hub/fixtures";
import { guardSettings, parseConfig, settingsChange, settingsEdit } from "../src/index.ts";

const commented = `# Written by setup\n${CONFIG}`;

describe("Settings: edits to .hub/config.yaml", () => {
  it("sets advisory mode and switches checks off, keeping the rest of the file and its comments", () => {
    const c = settingsChange(commented, { guard: { mode: "advisory", checks: { pushers: false } } });
    if (typeof c === "string") throw new Error(c);
    expect(c).toMatchObject({ path: ".hub/config.yaml", base: commented });
    expect(c.next).toMatch(/^# Written by setup\n/);
    const cfg = parseConfig(c.next!, "c").value!;
    expect(guardSettings(cfg)).toEqual({ mode: "advisory", checks: { files: true, signoffs: true, pushers: false, members: true } });
    expect(cfg.teams).toEqual(parseConfig(CONFIG, "c").value!.teams);
  });

  it("turns headless runs and assistants on and off, and sets or clears links", () => {
    const c = settingsChange(CONFIG, { headless: true, assistants: { cursor: true, codex: false }, links: { figma: "https://figma.com/p/1", confluence: "" } });
    if (typeof c === "string") throw new Error(c);
    const cfg = parseConfig(c.next!, "c").value!;
    expect(cfg.headless.enabled).toBe(true);
    expect(cfg.assistants).toEqual(["claude", "cursor"]);
    expect(cfg.links).toEqual({ figma: "https://figma.com/p/1" });
  });

  it("says when nothing changes, and refuses what is not a setting", () => {
    expect(settingsChange(CONFIG, { headless: parseConfig(CONFIG, "c").value!.headless.enabled })).toBe("Nothing to change");
    expect(settingsEdit({ guard: { mode: "loose" } })).toMatch(/mode/);
    expect(settingsEdit({ teams: [] })).toMatch(/teams/);
    expect(settingsEdit({ links: { figma: "not a link" } })).toMatch(/https/);
    expect(settingsEdit({ guard: { checks: { files: false } } })).toEqual({ guard: { checks: { files: false } } });
  });
});
