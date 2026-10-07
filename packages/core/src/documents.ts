// The documents of a feature on main, for the Documents tab: who owns each, and whether its sign-off is current.

import { contentHash } from "./content/hash.ts";
import { parseSignoffs } from "./files.ts";
import type { FileSource } from "./source.ts";

export interface FeatureDocument {
  /** Relative to docs/features/<slug>/. */
  path: string;
  /** The role that owns the file; `dev` files of steps 5 to 7 belong to the contract team's lead. */
  owner: string;
  /** current: a sign-off names this file with its present hash; stale: only with an older hash. */
  signoff: "current" | "stale" | "none";
}

const ORDER: [RegExp, string][] = [
  [/^spec\.md$/, "po"],
  [/^\.size$/, "po"],
  [/^\.route$/, "po"],
  [/^CONTEXT\.md$/, "po"],
  [/^ux-flows\.md$/, "designer"],
  [/^sad\.md$/, "dev"],
  [/^data-model\.md$/, "dev"],
  [/^contracts\//, "dev"],
  [/^screens\.md$/, "designer"],
  [/^test-plan\.md$/, "qa"],
  [/^hub\/feature\.yaml$/, "pm"],
  [/^hub\/release\.yaml$/, "ops"],
  [/^hub\/bugs\//, "qa"],
  [/^hub\/validation\//, "po"],
];

export function listDocuments(specs: FileSource, slug: string): FeatureDocument[] {
  const dir = `docs/features/${slug}`;
  const signoffs = parseSignoffs(specs.read(`${dir}/hub/signoffs.yaml`) ?? "[]", "signoffs.yaml").value ?? [];
  const docs: (FeatureDocument & { rank: number })[] = [];
  for (const full of specs.list(dir)) {
    const path = full.slice(dir.length + 1);
    const rank = ORDER.findIndex(([re]) => re.test(path));
    if (rank < 0) continue;
    const entries = signoffs.filter((e) => e.file === full && e.hash && e.decision !== "return");
    const hash = entries.length ? contentHash(specs.read(full) ?? "") : undefined;
    const signoff = entries.length === 0 ? "none" : entries.some((e) => e.hash === hash) ? "current" : "stale";
    docs.push({ path, owner: ORDER[rank]![1], signoff, rank });
  }
  return docs.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path)).map(({ rank: _rank, ...d }) => d);
}
