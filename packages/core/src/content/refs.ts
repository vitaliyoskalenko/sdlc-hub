// Ids that link documents: acceptance criteria, user stories and screens.
// SDD writes AC-01, and clarify adds AC-02b; the specification's examples write AC-4. AC-01 and AC-1 name one id.

const REF = /\b(AC|US|SCR)-(\d+)([a-z]?)\b/g;

export function normaliseRef(ref: string): string {
  const m = /^(AC|US|SCR)-(\d+)([a-z]?)$/.exec(ref);
  return m ? `${m[1]}-${Number.parseInt(m[2]!, 10)}${m[3]}` : ref;
}

export function extractRefs(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(REF)) out.add(`${m[1]}-${Number.parseInt(m[2]!, 10)}${m[3]}`);
  return out;
}
