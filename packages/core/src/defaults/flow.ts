// The flow.yaml that init writes. The twenty steps of the specification, "The twenty steps".
// Engine steps take their evidence from the engine adapter; hub steps carry it here.

export const DEFAULT_FLOW_YAML = `schema_version: 1
lanes: [po, pm, designer, dev, qa, ops]
release:
  watch_days: 7
  checklist:
    - Every team's production deploy is done
    - The rollback plan is checked
    - Monitoring and alerts are on for the feature
    - Release notes are published
steps:
  - id: specify
    role: po
    kind: engine
  - id: clarify
    role: po
    kind: engine
    gate: { role: po, text: "The spec is ready: every open question closed or deferred" }
  - id: epic
    role: pm
    kind: hub
    llm: false
    evidence: ["signoff:epic"]
    gate: { role: pm, text: "Size, route and the team leads", returns_to: clarify }
  - id: ux-flows
    role: designer
    kind: engine
    gate: { role: po, text: "The flows match the user stories" }
  - id: tech-design
    role: dev
    kind: engine
    gate: { role: dev, by: other-team-leads, text: "Architecture review by the other teams' leads" }
  - id: data-model
    role: dev
    kind: engine
    gate: { role: dev, by: contract-lead, text: "The schema and the rollback migration" }
  - id: api
    role: dev
    kind: engine
    gate: { role: dev, by: other-team-leads, text: "The contract, signed off by the lead of every other team" }
  - id: screens
    role: designer
    kind: engine
    gate: { role: po, text: "Every state can be built on each platform" }
  - id: tasks
    role: dev
    kind: engine
    gate: { role: dev, by: team-leads, text: "The task split, by each team lead" }
  - id: sprint
    role: pm
    kind: hub
    evidence: ["signoff:sprint"]
    gate: { role: pm, text: "Sprint contents, and the order between teams derived from the cross-team references" }
  - id: plan-tests
    role: qa
    kind: engine
    gate: { role: qa, text: "Every criterion is covered on every platform" }
  - id: implement
    role: dev
    kind: engine
    gate: { role: auto, text: "Tests and lint on every task" }
  - id: review
    role: dev
    kind: engine
    gate: { role: dev, by: team-leads, text: "Each team lead signs off the review of their team's merge request" }
  - id: ship
    role: dev
    kind: engine
    gate: { role: dev, by: team-leads, text: "The part was run for real against its criteria" }
  - id: staging
    role: ops
    kind: hub
    evidence: ["release:staging-passed"]
    gate: { role: ops, text: "The smoke check passed on every client" }
  - id: verify
    role: qa
    kind: hub
    evidence: ["signoff:verify"]
    gate: { role: qa, text: "Every criterion passes or is not applicable on every platform" }
  - id: autotests
    role: qa
    kind: hub
    llm: false
    evidence: ["tests:ci-green"]
    gate: { role: auto, text: "The latest CI run is green in every team repository" }
  - id: qa-final
    role: qa
    kind: hub
    llm: false
    evidence: ["signoff:qa-final"]
    gate: { role: qa, text: "Pass to release, or return to development with a reason", returns_to: verify }
  - id: accept
    role: po
    kind: hub
    llm: false
    evidence: ["signoff:accept", "release:go"]
    gate: { role: po, text: "The PO accepts, then the PM gives the go or the no-go" }
  - id: release
    role: ops
    kind: hub
    evidence: ["release:rolled-out", "release:watch-over"]
    gate: { role: ops, text: "Every production deploy and rollout stage, then the watch period" }
`;
