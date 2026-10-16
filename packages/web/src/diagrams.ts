// The guides' diagrams, drawn ahead of time by scripts/diagrams.mjs: each ```mermaid block of docs/guides/*.md as an
// SVG named by a hash of its text. The site shows the picture without carrying mermaid; a block without its SVG
// stays code, and a test says to run `npm run diagrams`.

const files = import.meta.glob("../../../docs/guides/diagrams/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** FNV-1a over the block's text: the same key scripts/diagrams.mjs names the file by. */
export function diagramKey(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const byKey = new Map(Object.entries(files).map(([path, svg]) => [path.split("/").pop()!.replace(/\.svg$/, ""), svg]));

/** The drawn diagram of a mermaid block, or undefined when it was not drawn. */
export const diagramSvg = (text: string): string | undefined => byKey.get(diagramKey(text));
