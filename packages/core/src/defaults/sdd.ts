// The engine adapter for genkovich/sdd, checked against v2.3.0. See the specification, "Engine adapter".

export const DEFAULT_SDD_ENGINE_YAML = `id: sdd
source: genkovich/sdd
version: "2.3.x"
artifacts: docs/features/{slug}
invoke:
  claude: "/sdd:{stage} {slug}"
  codex: "$sdd-{stage} {slug}"
  cursor: "/sdd-{stage} {slug}"
steps:
  specify:     { stage: specify, in: specs, done_when: ["file:spec.md", "file:.size", "file:.route"] }
  clarify:     { stage: clarify, in: specs, skippable_on: [quick, standard], done_when: ["signoff:clarify"] }
  ux-flows:    { stage: ux-flows, in: specs, skippable_on: [quick, standard], done_when: ["file:ux-flows.md"] }
  tech-design: { stages: [design, sequences], in: contract, done_when: ["file:sad.md", "file:adr/*.md", "file:_sequences-log.md | finished:tech-design | route:quick"] }
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
