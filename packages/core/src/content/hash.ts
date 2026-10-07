import { createHash } from "node:crypto";

/** The content hash a sign-off records: SHA-256 of the text with line endings normalised to LF. */
export function contentHash(text: string): string {
  return "sha256:" + createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("hex");
}
