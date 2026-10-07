// The structural check behind rules below the file level ("Guard rules" in the specification):
// a role may change one section, or one front matter key, of a file it does not own.
// Both versions are parsed; with the allowed region cut out, the rest must be byte-identical,
// and the region must keep its place.

export interface FrontKey {
  key: string;
  /** Offset of the key's first line. */
  start: number;
  /** Offset where the next key, or the closing `---` line, starts. */
  end: number;
}

export interface Section {
  /** The heading line without trailing spaces, such as `## Test plan`. */
  heading: string;
  level: number;
  /** Offset of the heading line. */
  start: number;
  /** Offset of the next heading of the same or a higher level, or the end of the text. */
  end: number;
  /** 1-based line of the heading. */
  line: number;
}

export interface Structure {
  front: { start: number; end: number; keys: FrontKey[] } | null;
  sections: Section[];
}

export type Region = { kind: "section"; heading: string } | { kind: "front"; key: string };

export type RegionCheck = { ok: true } | { ok: false; reason: string; line?: number };

interface Line {
  text: string;
  start: number;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf("\n", start);
    const end = nl < 0 ? text.length : nl + 1;
    out.push({ text: text.slice(start, nl < 0 ? text.length : nl).replace(/\r$/, ""), start });
    start = end;
  }
  return out;
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const KEY = /^([A-Za-z_][\w-]*)[ \t]*:/;

export function parseStructure(text: string): Structure {
  const ls = lines(text);
  let i = 0;
  let front: Structure["front"] = null;
  if (ls[0]?.text === "---") {
    const close = ls.findIndex((l, n) => n > 0 && l.text === "---");
    if (close > 0) {
      const keys: FrontKey[] = [];
      for (let n = 1; n < close; n++) {
        const m = KEY.exec(ls[n]!.text);
        if (m) {
          const prev = keys[keys.length - 1];
          if (prev) prev.end = ls[n]!.start;
          keys.push({ key: m[1]!, start: ls[n]!.start, end: ls[close]!.start });
        }
      }
      const after = ls[close + 1]?.start ?? text.length;
      front = { start: 0, end: after, keys };
      i = close + 1;
    }
  }

  const sections: Section[] = [];
  let fence: string | null = null;
  for (; i < ls.length; i++) {
    const l = ls[i]!;
    const f = FENCE.exec(l.text);
    if (f) {
      const mark = f[1]!;
      if (fence === null) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = ATX.exec(l.text);
    if (h) sections.push({ heading: l.text.trimEnd(), level: h[1]!.length, start: l.start, end: text.length, line: i + 1 });
  }
  sections.forEach((s, n) => {
    const next = sections.slice(n + 1).find((o) => o.level <= s.level);
    if (next) s.end = next.start;
  });
  return { front, sections };
}

/** Where a region sits in the text, as a span to cut. */
interface Span {
  start: number;
  end: number;
}

/**
 * The span of a section: from its heading to the next heading of the same or a higher level, so blank lines
 * before that heading belong to it. The last section of a file has no such heading, so it takes the blank
 * lines before its own heading instead. Either way, adding a section with its usual blank separator leaves
 * the rest of the file untouched.
 */
function sectionSpan(text: string, s: Section, structure: Structure): Span {
  const isLast = !structure.sections.some((o) => o.start > s.start && o.level <= s.level);
  if (!isLast) return { start: s.start, end: s.end };
  let start = s.start;
  while (start >= 2 && text[start - 1] === "\n" && text[start - 2] === "\n") start--;
  if (start === 1 && text[0] === "\n") start = 0;
  return { start, end: s.end };
}

const cut = (text: string, span: Span) => text.slice(0, span.start) + text.slice(span.end);

const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}

/**
 * Check an edit that may change only one region of a file.
 * `base` is the version on main, or undefined for a new file.
 */
export function checkRegionEdit(base: string | undefined, next: string, region: Region): RegionCheck {
  const before = base ?? "";
  const sb = parseStructure(before);
  const sn = parseStructure(next);

  let spansB: Span[];
  let spansN: Span[];
  let boundaries: number[];
  let name: string;
  if (region.kind === "section") {
    name = `the section "${region.heading}"`;
    spansB = sb.sections.filter((s) => s.heading === region.heading).map((s) => sectionSpan(before, s, sb));
    spansN = sn.sections.filter((s) => s.heading === region.heading).map((s) => sectionSpan(next, s, sn));
    boundaries = [...sb.sections.map((s) => s.start), before.length];
  } else {
    name = `the front matter key "${region.key}"`;
    if (!sb.front && base !== undefined) return { ok: false, reason: `The file on main has no front matter, so ${name} cannot be changed alone` };
    if (!sn.front) return { ok: false, reason: `The file has no front matter, so ${name} cannot be changed alone`, line: 1 };
    spansB = (sb.front?.keys ?? []).filter((k) => k.key === region.key);
    spansN = sn.front.keys.filter((k) => k.key === region.key);
    boundaries = sb.front ? [...sb.front.keys.map((k) => k.start), sb.front.keys.at(-1)?.end ?? sb.front.end] : [];
  }

  if (spansB.length > 1 || spansN.length > 1)
    return { ok: false, reason: `${capitalise(name)} appears more than once, so the allowed region is ambiguous` };

  const b = spansB[0];
  const n = spansN[0];
  const restB = b ? cut(before, b) : before;
  const restN = n ? cut(next, n) : next;
  if (restB !== restN) {
    const at = firstDifference(restB, restN);
    const offset = n && at >= n.start ? at + (n.end - n.start) : at;
    return { ok: false, reason: `Changed outside ${name}`, line: lineAt(next, offset) };
  }
  if (b && n && b.start !== n.start) return { ok: false, reason: `${capitalise(name)} moved`, line: lineAt(next, n.start) };
  if (!b && n && !boundaries.includes(n.start))
    return { ok: false, reason: `${capitalise(name)} must be added as a whole, between two others or at the end`, line: lineAt(next, n.start) };
  return { ok: true };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
