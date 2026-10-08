// The hub-report job that the install proposes to each team repository, and the edit that includes it.

import { isMap, isScalar, isSeq, parseDocument, YAMLSeq } from "yaml";

export const HUB_REPORT_FILE = "ci/hub-report.gitlab-ci.yml";

/**
 * The job publishes the team's snapshot of each feature to hub-state of product-specs. The hub code comes from
 * product-specs itself, at main. HUB_STATE_TOKEN (a masked group variable) is the only credential; it goes to git
 * through its environment, never on a command line. HUB_GIT_URL overrides the server address for runners that reach
 * GitLab under another name.
 */
export function hubReportJob(opts: { specs: string; team: string; stage: string }): string {
  return `# Added by SDLC Hub. Publishes this team's tasks, tracker, review verdict and merge request for each feature
# to the hub-state branch of ${opts.specs}. It changes nothing in this repository.
hub-report:
  stage: ${opts.stage}
  image: node:22-alpine
  rules:
    - if: $HUB_STATE_TOKEN
      when: always
  variables:
    HUB_SPECS: "${opts.specs}"
    HUB_TEAM: "${opts.team}"
  script:
    - apk add --no-cache git >/dev/null
    - export HUB_GIT_BASE="\${HUB_GIT_URL:-$CI_SERVER_URL}"
    - export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'hub-report:%s' "$HUB_STATE_TOKEN" | base64 | tr -d '\\n')"
    - git clone --quiet --depth 1 --branch main "$HUB_GIT_BASE/$HUB_SPECS.git" /tmp/hub-specs
    - node /tmp/hub-specs/hub/cli.js report --team "$HUB_TEAM" --specs-url "$HUB_GIT_BASE/$HUB_SPECS.git" --push
`;
}

/** The stage for the job: .post when the repository already has CI jobs, test when the include is its only CI. */
export const reportStage = (existingCi: string | null) => (existingCi?.trim() ? ".post" : "test");

/** Adds `include: - local: <file>` to a .gitlab-ci.yml, once, keeping its comments and the rest. */
export function withInclude(existing: string | null, file = HUB_REPORT_FILE): string {
  if (!existing?.trim()) return `include:\n  - local: ${file}\n`;
  const doc = parseDocument(existing);
  if (!isMap(doc.contents)) throw new Error(".gitlab-ci.yml is not a mapping; add the include by hand");
  const has = (node: unknown): boolean =>
    (isScalar(node) && node.value === file) || (isMap(node) && node.get("local") === file) || (isSeq(node) && node.items.some(has));
  const inc = doc.get("include", true);
  if (has(inc)) return existing;
  // No include yet: add it above the rest, so the team's file stays exactly as it was.
  if (inc === undefined) return `include:\n  - local: ${file}\n${existing}`;
  const item = doc.createNode({ local: file });
  if (isSeq(inc)) inc.items.push(item);
  else {
    const seq = new YAMLSeq();
    seq.items.push(inc, item);
    doc.set("include", seq);
  }
  return doc.toString();
}
