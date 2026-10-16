import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagramKey, diagramSvg } from "../src/diagrams.ts";

const guides = join(import.meta.dirname, "../../../docs/guides");
const blocks = readdirSync(guides)
  .filter((f) => f.endsWith(".md"))
  .flatMap((f) => [...readFileSync(join(guides, f), "utf8").matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => ({ guide: f, text: m[1]! })));

describe("the guides' diagrams", () => {
  it("are drawn for every mermaid block as it is now: run npm run diagrams after changing one", () => {
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(diagramSvg(b.text), `${b.guide}: ${b.text.split("\n")[0]}`).toMatch(/^<svg/);
  });

  it("keep no picture of a block that is gone", () => {
    const keys = new Set(blocks.map((b) => diagramKey(b.text)));
    const files = readdirSync(join(guides, "diagrams")).filter((f) => f.endsWith(".svg"));
    expect(files.filter((f) => !keys.has(f.replace(/\.svg$/, "")))).toEqual([]);
  });

  it("are plain SVG: no script, no HTML inside", () => {
    for (const b of blocks) {
      const svg = diagramSvg(b.text)!;
      expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=/i);
    }
  });
});
