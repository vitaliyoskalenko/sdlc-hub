// Turning text into validated values: YAML or JSON in, a Result with line-placed issues out.

import { isMap, isSeq, LineCounter, parseDocument, type Document } from "yaml";
import type { z } from "zod";
import type { Issue, Result } from "./issues.ts";

type Path = (string | number)[];
type LineOf = (path: Path) => number | undefined;

/**
 * Validate data against a schema built from strict objects.
 * Unknown keys are reported as warnings and dropped; every other problem is an error.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  data: unknown,
  file: string,
  lineOf: LineOf = () => undefined,
): Result<z.output<S>> {
  const issues: Issue[] = [];
  let result = schema.safeParse(data);
  if (!result.success) {
    const unknown = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    if (unknown.length > 0) {
      const copy = structuredClone(data);
      for (const u of unknown) {
        const owner = getAt(copy, u.path as Path);
        for (const key of (u as { keys: string[] }).keys) {
          const path = [...(u.path as Path), key];
          issues.push({ level: "warning", file, line: lineOf(path), path: dotted(path), message: `Unknown key "${key}" is ignored` });
          if (owner && typeof owner === "object") delete (owner as Record<string, unknown>)[key];
        }
      }
      result = schema.safeParse(copy);
    }
  }
  if (!result.success) {
    for (const i of result.error.issues) {
      if (i.code === "unrecognized_keys") continue;
      const path = i.path as Path;
      issues.push({ level: "error", file, line: lineOf(path), path: dotted(path), message: humanise(i.message) });
    }
    return { issues };
  }
  return { value: result.data, issues };
}

export function parseYaml<S extends z.ZodType>(schema: S, text: string, file: string, lineOffset = 0): Result<z.output<S>> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    return {
      issues: doc.errors.map((e) => ({
        level: "error" as const,
        file,
        line: lineCounter.linePos(e.pos[0]).line + lineOffset,
        message: e.message.split("\n")[0] ?? e.message,
      })),
    };
  }
  const lineOf: LineOf = (path) => {
    const line = nodeLine(doc, lineCounter, path);
    return line === undefined ? undefined : line + lineOffset;
  };
  return validate(schema, doc.toJS(), file, lineOf);
}

export function parseJson<S extends z.ZodType>(schema: S, text: string, file: string, line?: number): Result<z.output<S>> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { issues: [{ level: "error", file, line, message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  return validate(schema, data, file, () => line);
}

/** Split `---` front matter from a Markdown body. */
export function splitFrontMatter(text: string): { front: string; body: string; bodyLine: number } | undefined {
  const m = /^---\r?\n([\s\S]*?\r?\n)?---\r?\n?/.exec(text);
  if (!m) return undefined;
  const front = m[1] ?? "";
  return { front, body: text.slice(m[0].length), bodyLine: m[0].split("\n").length };
}

// --- helpers

function nodeLine(doc: Document, lc: LineCounter, path: Path): number | undefined {
  // Walk up to the nearest node that exists: a missing key is placed on the mapping that lacks it.
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? doc.contents : doc.getIn(path.slice(0, n), true);
    const range = (node as { range?: [number, number, number] } | undefined)?.range;
    if (range && (n === 0 || node !== undefined)) {
      if (n < path.length && !isMap(node) && !isSeq(node)) continue;
      return lc.linePos(range[0]).line;
    }
  }
  return undefined;
}

function getAt(data: unknown, path: Path): unknown {
  let cur = data;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

const dotted = (path: Path): string => path.join(".");

function humanise(message: string): string {
  if (/received undefined/.test(message)) return "Missing required field";
  return message.replace(/^Invalid input: /, "");
}
