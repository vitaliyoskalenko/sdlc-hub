// The evidence language of `done_when` (engine adapter) and `evidence` (hub steps in flow.yaml).
// One string is one requirement; `a | b` means either is enough. See the specification, "Engine adapter".

export type Atom =
  | { kind: "file"; glob: string }
  | { kind: "section"; file: string; heading: string }
  | { kind: "signoff"; step: string }
  | { kind: "tracker-all-done" }
  | { kind: "review-pass" }
  | { kind: "mr-open" }
  | { kind: "mr-contract" }
  | { kind: "release"; what: ReleaseFact }
  | { kind: "tests-ci-green" }
  /** Holds on that route: makes a requirement apply only on the other routes, as in `file:x | route:quick`. */
  | { kind: "route"; route: string };

export type ReleaseFact = "staging-passed" | "go" | "rolled-out" | "watch-over";
const RELEASE_FACTS: readonly ReleaseFact[] = ["staging-passed", "go", "rolled-out", "watch-over"];

/** A requirement holds when any of its atoms holds. */
export interface Requirement {
  anyOf: Atom[];
  source: string;
}

export function parseRequirement(source: string): Requirement | { error: string } {
  const atoms: Atom[] = [];
  for (const part of source.split("|").map((p) => p.trim())) {
    const atom = parseAtom(part);
    if (typeof atom === "string") return { error: atom };
    atoms.push(atom);
  }
  return { anyOf: atoms, source };
}

function parseAtom(s: string): Atom | string {
  const colon = s.indexOf(":");
  const head = colon < 0 ? s : s.slice(0, colon);
  const arg = colon < 0 ? "" : s.slice(colon + 1).trim();
  switch (head) {
    case "file":
      return arg ? { kind: "file", glob: arg } : `Unknown evidence "${s}": file needs a path`;
    case "section": {
      const hash = arg.indexOf("#");
      if (hash <= 0 || hash === arg.length - 1) return `Unknown evidence "${s}": write section:<file>#<heading>`;
      return { kind: "section", file: arg.slice(0, hash), heading: arg.slice(hash + 1) };
    }
    case "signoff":
      return arg ? { kind: "signoff", step: arg } : `Unknown evidence "${s}": signoff needs a step`;
    case "tracker":
      return arg === "all-done" ? { kind: "tracker-all-done" } : `Unknown evidence "${s}"`;
    case "review":
      return arg === "PASS" ? { kind: "review-pass" } : `Unknown evidence "${s}"`;
    case "mr":
      if (arg === "open") return { kind: "mr-open" };
      if (arg === "contract") return { kind: "mr-contract" };
      return `Unknown evidence "${s}"`;
    case "release":
      return (RELEASE_FACTS as readonly string[]).includes(arg)
        ? { kind: "release", what: arg as ReleaseFact }
        : `Unknown evidence "${s}"`;
    case "tests":
      return arg === "ci-green" ? { kind: "tests-ci-green" } : `Unknown evidence "${s}"`;
    case "route":
      return ["quick", "standard", "full"].includes(arg) ? { kind: "route", route: arg } : `Unknown evidence "${s}": the routes are quick, standard and full`;
    default:
      return `Unknown evidence "${s}"`;
  }
}
