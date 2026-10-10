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
  pull-requests: write
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

export const FANOUT_WORKFLOW = ".github/workflows/hub-fanout.yml";
export const RECHECK_WORKFLOW = ".github/workflows/hub-recheck.yml";

/** After .hub/ changes on the default branch, every open pull request runs hub-guard again under the new rules. */
export function hubRecheckWorkflow(): string {
  return `# Written by SDLC Hub. When .hub/ changes on the default branch (a person's role, the guard settings), every open
# pull request runs hub-guard again, so a result under the old rules does not merge.
name: hub-recheck
on:
  push:
    branches: [main]
    paths: [".hub/**"]
permissions:
  actions: write
  checks: read
  pull-requests: read
  contents: read
jobs:
  hub-recheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          sparse-checkout: hub
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node hub/cli.js recheck --github
        env:
          GITHUB_TOKEN: \${{ github.token }}
`;
}

/**
 * The team repository's fan-out: every hour, and on demand, it reads product-specs with the deploy key in
 * HUB_STATE_KEY, writes this team's shared files on hub/fanout and opens a pull request for the team lead. GitHub gives
 * no token for another repository that install could create, so the team repository fetches instead of being pushed to.
 */
export function hubFanoutWorkflow(opts: { specs: string; team: string; host?: string }): string {
  const host = opts.host ?? "github.com";
  return `# Added by SDLC Hub. Brings the shared files of this team's features (spec, flows, screens, test plan, contracts)
# from ${opts.specs} as a pull request on hub/fanout. The team lead merges it.
name: hub-fanout
on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:
  # POST /repos/<team repository>/dispatches with event_type hub-fanout: needs only Contents write on the token.
  repository_dispatch:
    types: [hub-fanout]
permissions:
  contents: write
  pull-requests: write
jobs:
  hub-fanout:
    runs-on: ubuntu-latest
    env:
      HUB_STATE_KEY: \${{ secrets.HUB_STATE_KEY }}
    steps:
      - uses: actions/checkout@v4
        if: env.HUB_STATE_KEY != ''
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        if: env.HUB_STATE_KEY != ''
        with:
          node-version: 22
      - name: Shared files from ${opts.specs}
        if: env.HUB_STATE_KEY != ''
        env:
          GH_TOKEN: \${{ github.token }}
          BASE: \${{ github.event.repository.default_branch }}
        run: |
          install -m 600 /dev/null /tmp/hub-key && printf '%s\\n' "$HUB_STATE_KEY" > /tmp/hub-key
          export GIT_SSH_COMMAND="ssh -i /tmp/hub-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
          git clone --quiet --depth 1 "git@${host}:${opts.specs}.git" /tmp/hub-specs
          out=$(node /tmp/hub-specs/hub/cli.js fanout --team ${JSON.stringify(opts.team)} --specs /tmp/hub-specs --into .)
          echo "$out"
          case "$out" in *FANOUT_CHANGED=1*) ;; *) exit 0 ;; esac
          git fetch --quiet origin hub/fanout 2>/dev/null || true
          if [ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse --verify -q FETCH_HEAD^{tree} 2>/dev/null)" ]; then echo "hub/fanout has these files already"; else git push --quiet --force origin hub/fanout; fi
          gh pr view hub/fanout --json state -q .state 2>/dev/null | grep -q OPEN || gh pr create --base "$BASE" --head hub/fanout --title "Shared files from product-specs (hub-fanout)" --body "Copied by hub-fanout from ${opts.specs}. The team lead merges it; change these files in ${opts.specs}, not here."
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
