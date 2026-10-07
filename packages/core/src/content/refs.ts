// Ids that link documents: acceptance criteria, user stories and screens.
// SDD writes AC-01; the specification's examples write AC-4. Both name the same id.

const REF = /\b(AC|US|SCR)-(\d+)\b/g;

export function normaliseRef(ref: string): string {
  const m = /^(AC|US|SCR)-(\d+)$/.exec(ref);
  return m ? `${m[1]}-${Number.parseInt(m[2]!, 10)}` : ref;
}

export function extractRefs(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(REF)) out.add(`${m[1]}-${Number.parseInt(m[2]!, 10)}`);
  return out;
}
