// "plain": the small engine that ships with the hub. It proves the adapter contract (the engine is replaceable) and
// gives a team a fallback that needs no engine plugin: each stage is a prompt file in .hub/engines/plain/, run by the
// hub's own stage command in any assistant. Its stages write the same files the step detection reads.

export const DEFAULT_PLAIN_ENGINE_YAML = `id: plain
source: sdlc-hub/plain
version: "1.0.0"
artifacts: docs/features/{slug}
invoke:
  claude: "/hub:stage {stage} {slug}"
  codex: "$hub-stage {stage} {slug}"
  cursor: "/hub-stage {stage} {slug}"
steps:
  specify:     { stage: specify, in: specs, done_when: ["file:spec.md", "file:.size", "file:.route"] }
  clarify:     { stage: clarify, in: specs, skippable_on: [quick, standard], done_when: ["signoff:clarify"] }
  ux-flows:    { stage: ux-flows, in: specs, skippable_on: [quick, standard], done_when: ["file:ux-flows.md"] }
  tech-design: { stage: design, in: contract, done_when: ["file:sad.md", "file:adr/*.md"] }
  data-model:  { stage: data-model, in: contract, skippable_on: [quick, standard], done_when: ["file:data-model.md"] }
  api:         { stage: api, in: contract, skippable_on: [quick, standard], done_when: ["file:contracts/*", "mr:contract"] }
  screens:     { stage: screens, in: specs, skippable_on: [quick, standard], done_when: ["file:screens.md"] }
  tasks:       { stage: tasks, in: teams, done_when: ["file:tasks.json", "file:tasks/tracker.md"] }
  plan-tests:  { stage: plan-tests, in: specs, skippable_on: [quick, standard], done_when: ["file:test-plan.md | section:spec.md#Test plan"] }
  implement:   { stage: implement, in: teams, done_when: ["tracker:all-done"] }
  review:      { stage: review, in: teams, done_when: ["review:PASS"] }
  ship:        { stage: ship, in: teams, done_when: ["mr:open"] }
returns:
  fix:         { stage: fix, from: [verify, qa-final], in: owning-team, done_when: ["file:_fixes/*.md"] }
`;

const F = "docs/features/<slug>";

/** One prompt per stage: .hub/engines/plain/<stage>.md. Each says what to write, where, and in which format. */
export const PLAIN_PROMPTS: Record<string, string> = {
  specify: `# specify

Interview the person about the feature, one question at a time, until you can write the spec. Then write:

- \`${F}/spec.md\`: a short context, user stories as \`US-01\`, \`US-02\`, and acceptance criteria as list items \`- AC-01: <testable sentence>\`, \`- AC-02: ...\`, and a list of open questions.
- \`${F}/.size\`: one word, \`XS\`, \`S\`, \`M\`, \`L\` or \`XL\`.
- \`${F}/.route\`: one word. \`quick\` for XS, \`standard\` for S and M, \`full\` for L and XL.
`,
  clarify: `# clarify

Read \`${F}/spec.md\`. Challenge it: list every ambiguity, gap and conflict, one at a time, and ask the person to close or defer each. Write the answers into spec.md and keep the open questions list current. Change no criterion's meaning without the person's word. When nothing is open, tell the person the gate needs their sign-off.
`,
  "ux-flows": `# ux-flows

From \`${F}/spec.md\`, write \`${F}/ux-flows.md\`: one flow per user story (a mermaid flowchart is fine), and the list of screens named \`SCR-01\`, \`SCR-02\`, each with the criteria it covers.
`,
  design: `# design

In this team's repository, write \`${F}/sad.md\` with front matter \`feature_size\` (from .size) and \`target_surfaces\` (a list: backend-service, web-frontend, mobile-app, desktop-app, worker), then the design: components, data flow, risks. Record each decision as \`${F}/adr/NNNN-<short-title>.md\`.
`,
  "data-model": `# data-model

Write \`${F}/data-model.md\`: the tables or documents, their fields and indexes, and forward and rollback migrations staged in the feature folder.
`,
  api: `# api

Write the contract under \`${F}/contracts/\` (for example openapi.yaml), with every error response. Then open the contract merge request in product-specs that copies sad.md, data-model.md and contracts/ there.
`,
  screens: `# screens

From ux-flows.md, write \`${F}/screens.md\`: a table with Screen, State (default, loading, empty, error, success), Components and Criteria for every screen.
`,
  tasks: `# tasks

In this team's repository, split the work into tasks and write both files:

- \`${F}/tasks.json\`: \`{ "slug": "<slug>", "tasks": [{ "id": "T1", "title": "...", "layer": "...", "deps": ["T0"], "acs": ["AC-01"] }] }\`. A dependency on another team's task is written \`<team-id>:T2\`.
- \`${F}/tasks/tracker.md\`: one table \`| # | Task | Layer | Owner | Estimate | Blocked by | Status |\`, one row per task, status one of todo, in_progress, blocked, review, done.
`,
  "plan-tests": `# plan-tests

For each acceptance criterion, choose a level (unit, integration, e2e) and the platforms. For size M and up write \`${F}/test-plan.md\` as a table \`| AC | Level | Platforms | Test |\`; for XS and S add the same table under a \`## Test plan\` heading at the end of spec.md.
`,
  implement: `# implement

Take the next task of tasks/tracker.md whose dependencies are done, implement it test first, and set its status in the tracker (in_progress, then review, then done). One task at a time.
`,
  review: `# review

Review the feature branch against spec.md, sad.md and the tasks. Write \`${F}/_review/review-<YYYY-MM-DD>.md\` with the findings and one line \`Verdict: PASS\` or \`Verdict: CHANGES REQUESTED\`.
`,
  ship: `# ship

Open the merge request of the feature branch with a summary of what changed and the criteria it covers.
`,
  fix: `# fix

Read the bug in product-specs (\`${F}/hub/bugs/BUG-NNNN.md\`), reproduce it with a failing test, fix it, and write \`${F}/_fixes/<YYYY-MM-DD>-<short-slug>.md\` with the cause and the fix.
`,
};
