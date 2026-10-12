// Markdown to HTML for documents and reports: raw HTML off, so a document cannot put markup on the page.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
export const renderMarkdown = (text: string): string => md.render(text);

/** A document's YAML front matter as key and value pairs, and the body after it. Only flat `key: value` lines. */
export function frontMatter(text: string): { front: [string, string][]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { front: [], body: text };
  const front = m[1]!
    .split(/\r?\n/)
    .map((l) => /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(l))
    .filter((x): x is RegExpExecArray => !!x)
    .map((x) => [x[1]!, x[2]!.replace(/^["']|["']$/g, "")] as [string, string]);
  return { front, body: text.slice(m[0].length) };
}
