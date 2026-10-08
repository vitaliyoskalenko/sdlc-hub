// The hub-report job that the install proposes to each team repository, and the edit that includes it.

import { isMap, isScalar, isSeq, parseDocument, YAMLSeq } from "yaml";

export const HUB_REPORT_FILE = "ci/hub-report.gitlab-ci.yml";

/**
 * The jobs publish the team's snapshot of each feature, and the pipeline's result, to hub-state of product-specs.
 * The hub code comes from product-specs itself, at main. HUB_STATE_TOKEN (a masked group variable) is the only
 * credential; it goes to git through its environment, never on a command line. HUB_GIT_URL overrides the server
 * address for runners that reach GitLab under another name. Every job may fail without turning the pipeline red,
 * and a failure of hub-report never counts as a failed test: allowed failures do not stop on_success jobs.
 */
export function hubReportJob(opts: { specs: string; team: string; stage: string }): string {
  const run = 'node /tmp/hub-specs/hub/cli.js report --team "$HUB_TEAM" --specs-url "$HUB_GIT_BASE/$HUB_SPECS.git" --push';
  return `# Added by SDLC Hub. Publishes this team's tasks, tracker, review verdict, merge request and the result of each
# pipeline for each feature to the hub-state branch of ${opts.specs}. It changes nothing in this repository.
.sdlc-hub:
  image: node:22-alpine
  allow_failure: true
  variables:
    HUB_SPECS: "${opts.specs}"
    HUB_TEAM: "${opts.team}"
  # One literal block: a line such as "Authorization: Basic" would otherwise be read as a YAML key.
  before_script:
    - |
      apk add --no-cache git >/dev/null
      export HUB_GIT_BASE="\${HUB_GIT_URL:-$CI_SERVER_URL}"
      export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'hub-report:%s' "$HUB_STATE_TOKEN" | base64 | tr -d '\\n')"
      git clone --quiet --depth 1 --branch main "$HUB_GIT_BASE/$HUB_SPECS.git" /tmp/hub-specs

hub-report:
  extends: .sdlc-hub
  stage: ${opts.stage}
  rules:
    - if: $HUB_STATE_TOKEN
      when: always
  script:
    - ${run}

# The autotests gate reads these: the latest pipeline of every team repository must be green.
hub-tests-passed:
  extends: .sdlc-hub
  stage: .post
  rules:
    - if: $HUB_STATE_TOKEN
      when: on_success
  script:
    - ${run} --tests passed

hub-tests-failed:
  extends: .sdlc-hub
  stage: .post
  rules:
    - if: $HUB_STATE_TOKEN
      when: on_failure
  script:
    - ${run} --tests failed
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

export const HUB_CI_PROJECT = "hub-ci";
export const HUB_CI_FILE = "ci/product-specs.yml";

/**
 * The CI configuration of product-specs. It lives in the hub-ci project, which only the admin changes, and
 * product-specs points its "CI/CD configuration file" setting at it, so a merge request cannot remove the guard.
 * The checkout is the merge request's branch, which is only data: the hub code comes from main, as fetched.
 */
export function hubGuardCi(): string {
  return `# Written by SDLC Hub. product-specs runs this file instead of a .gitlab-ci.yml of its own, so a merge request
# cannot change or remove the guard. Change it only by a merge request to the admin.
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

hub-guard:
  image: node:22-alpine
  variables:
    GIT_DEPTH: "0"
  # HUB_GUARD_TOKEN (a masked project variable, read_api) lets the guard ask GitLab who opened the merge request
  # and who pushed to it. When it refuses a save from the site (a hub/<user>/... branch), it records the reason in
  # hub-state and deletes the branch with HUB_STATE_TOKEN. HUB_GIT_URL overrides the server address for runners
  # that reach GitLab under another name.
  script:
    - |
      apk add --no-cache git >/dev/null
      git fetch --quiet origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
      mkdir -p /tmp/hub && git show FETCH_HEAD:hub/cli.js > /tmp/hub/cli.mjs
      node /tmp/hub/cli.mjs guard --rules FETCH_HEAD
`;
}
