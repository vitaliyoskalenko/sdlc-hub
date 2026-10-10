// hub-fanout: the shared files of a feature, copied to the repository of each team the feature names, so the
// assistant there reads the spec, the flows, the screens, the test plan and the contracts where it works. The copies
// are unchanged (tools read them); _handoff.md says where they come from and that they change in product-specs.

import { parseFeature } from "./files.ts";
import { listFeatures } from "./detect.ts";
import type { Config } from "./schema/project.ts";
import type { FileSource } from "./source.ts";

export const FANOUT_BRANCH = "hub/fanout";
/** The masked CI variable of product-specs with a team's fan-out token, on GitLab. */
export const fanoutTokenVariable = (team: string) => `HUB_FANOUT_TOKEN_${team.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
const SHARED = ["spec.md", "ux-flows.md", "screens.md", "test-plan.md"];

/** The files a team's repository should have, by path, from main of product-specs at `sha`. */
export function fanoutFiles(specs: FileSource, config: Config, team: string, sha: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const slug of listFeatures(specs)) {
    const dir = `docs/features/${slug}`;
    const feature = parseFeature(specs.read(`${dir}/hub/feature.yaml`) ?? "", "feature.yaml").value;
    if (!feature?.teams || !(team in feature.teams)) continue;
    const paths = [...SHARED.map((f) => `${dir}/${f}`), ...specs.list(`${dir}/contracts`)].filter((p) => specs.read(p) !== undefined);
    if (!paths.length) continue;
    for (const p of paths) out[p] = specs.read(p)!;
    out[`${dir}/_handoff.md`] = handoff(slug, feature.title, config, sha, paths.map((p) => p.slice(dir.length + 1)));
  }
  return out;
}

function handoff(slug: string, title: string, config: Config, sha: string, files: string[]): string {
  return [
    `# ${title}: shared files`,
    "",
    `Copied by hub-fanout from ${config.git.namespace}/${config.git.repo} at ${sha}, docs/features/${slug}/:`,
    "",
    ...files.map((f) => `- \`${f}\``),
    "",
    `They are read-only here: change them there, in ${config.git.namespace}/${config.git.repo}, through a merge request, and the next fan-out brings the change. This team's own files (sad.md, adr/, tasks.json, tasks/) stay as they are.`,
    "",
  ].join("\n");
}
