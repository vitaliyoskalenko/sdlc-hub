// The GitHub Actions workflows the install writes. hub-guard runs on pull_request_target, so its definition and the
// hub it runs always come from the default branch; the pull request is checked out only as data and never run.
// hub-report runs when the team's own workflows complete, so it records their result for the autotests gate.

export const GUARD_WORKFLOW = ".github/workflows/hub-guard.yml";
export const REPORT_WORKFLOW = ".github/workflows/hub-report.yml";

export function hubGuardWorkflow(): string {
  return `# Written by SDLC Hub. It runs from the default branch for every pull request into it, so a pull request cannot
# change the guard that judges it. The pull request is checked out as data only: none of its code runs here.
name: hub-guard
on:
  pull_request_target:
    types: [opened, synchronize, reopened]
permissions:
  contents: write
  pull-requests: read
jobs:
  hub-guard:
    runs-on: ubuntu-latest
    steps:
      - name: The hub, from the default branch
        uses: actions/checkout@v4
        with:
          path: base
          sparse-checkout: hub
          persist-credentials: false
      - name: The pull request, as data
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          path: pr
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Judge the changes by the roles on the default branch
        working-directory: pr
        env:
          GITHUB_TOKEN: \${{ github.token }}
          BASE_REF: \${{ github.event.pull_request.base.ref }}
        run: |
          git -c http.extraHeader="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\\n')" fetch -q origin "+refs/heads/$BASE_REF:refs/remotes/origin/$BASE_REF"
          node ../base/hub/cli.js guard --github --rules "refs/remotes/origin/$BASE_REF"
`;
}

/**
 * The team repository's job: after each of the team's workflows completes, publish the snapshot and the result to
 * hub-state of product-specs, through a deploy key of product-specs kept as the secret HUB_STATE_KEY. A repository
 * with no workflows of its own reports on every push, as passed.
 */
export function hubReportWorkflow(opts: { specs: string; team: string; workflows: string[]; host?: string }): string {
  const host = opts.host ?? "github.com";
  const trigger = opts.workflows.length
    ? `  workflow_run:\n    workflows: [${opts.workflows.map((w) => JSON.stringify(w)).join(", ")}]\n    types: [completed]`
    : "  push:";
  const result = opts.workflows.length ? "${{ github.event.workflow_run.conclusion == 'success' && 'passed' || 'failed' }}" : "passed";
  const sha = opts.workflows.length ? "${{ github.event.workflow_run.head_sha }}" : "${{ github.sha }}";
  const branch = opts.workflows.length ? "${{ github.event.workflow_run.head_branch }}" : "${{ github.ref_name }}";
  const runId = opts.workflows.length ? "${{ github.event.workflow_run.id }}" : "${{ github.run_id }}";
  const runUrl = opts.workflows.length ? "${{ github.event.workflow_run.html_url }}" : "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}";
  return `# Added by SDLC Hub. Publishes this team's tasks, tracker, review verdict and the result of its workflows for each
# feature to the hub-state branch of ${opts.specs}. It changes nothing in this repository.
name: hub-report
on:
${trigger}
permissions:
  contents: read
jobs:
  hub-report:
    runs-on: ubuntu-latest
    # Secrets cannot be read in a job's if: each step checks the key in its environment instead.
    env:
      HUB_STATE_KEY: \${{ secrets.HUB_STATE_KEY }}
    steps:
      - uses: actions/checkout@v4
        if: env.HUB_STATE_KEY != ''
        with:
          ref: ${sha}
          persist-credentials: false
      - uses: actions/setup-node@v4
        if: env.HUB_STATE_KEY != ''
        with:
          node-version: 22
      - name: Publish to hub-state
        if: env.HUB_STATE_KEY != ''
        env:
          CI_COMMIT_REF_NAME: ${branch}
          CI_COMMIT_SHA: ${sha}
          CI_PIPELINE_ID: ${runId}
          CI_PIPELINE_URL: ${runUrl}
        run: |
          install -m 600 /dev/null /tmp/hub-key && printf '%s\\n' "$HUB_STATE_KEY" > /tmp/hub-key
          export GIT_SSH_COMMAND="ssh -i /tmp/hub-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
          git clone --quiet --depth 1 --branch main "git@${host}:${opts.specs}.git" /tmp/hub-specs
          node /tmp/hub-specs/hub/cli.js report --team ${JSON.stringify(opts.team)} --specs-url "git@${host}:${opts.specs}.git" --push --tests ${result}
`;
}
