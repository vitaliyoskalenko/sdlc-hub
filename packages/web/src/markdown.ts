// Markdown to HTML for documents and reports: raw HTML off, so a document cannot put markup on the page.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
export const renderMarkdown = (text: string): string => md.render(text);
