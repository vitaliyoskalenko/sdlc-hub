// Words on the site. Wording follows the hub prototype (prototypes/hub); revision 52 of the specification wins
// where they differ (step ids, epic, contract team, decide and return).

import type { Assistant, StepStatus } from "./api.ts";

export const ROLE: Record<string, { n: string; s: string; css: string }> = {
  po: { n: "PO / Analyst", s: "PO", css: "po" },
  pm: { n: "Project manager", s: "PM", css: "pm" },
  designer: { n: "Designer", s: "Design", css: "des" },
  dev: { n: "Engineering", s: "Dev", css: "dev" },
  qa: { n: "QA", s: "QA", css: "qa" },
  ops: { n: "Ops / Release", s: "Ops", css: "ops" },
  admin: { n: "Admin", s: "Admin", css: "admin" },
  auto: { n: "Automatic gate", s: "Auto", css: "admin" },
};
export const roleOf = (r: string) => ROLE[r] ?? { n: r, s: r, css: "admin" };

/** What each role does in the flow, for the popup on a lane of the flow map. */
export const ROLE_DOES: Record<string, string> = {
  po: "Writes the specification, answers its open questions, and accepts the finished feature.",
  pm: "Plans the epic and the sprint, names the teams, and gives the go or no-go for the release.",
  designer: "Draws the user flows and the screens.",
  dev: "Designs, builds, reviews and ships the code, in each team's own repository.",
  qa: "Plans the tests, verifies the feature on staging, and makes the final check.",
  ops: "Puts the feature on staging, rolls it out, and watches it after the rollout.",
};

export const STATUS: Record<StepStatus, [kind: string, label: string]> = {
  done: ["ok", "Done"],
  running: ["info", "Running"],
  signoff: ["warn", "Waiting for sign-off"],
  returned: ["bad", "Returned"],
  blocked: ["bad", "Blocked"],
  ready: ["info", "Ready to start"],
  todo: ["mute", "Not started"],
  skipped: ["mute", "Skipped on this route"],
  missed: ["bad", "Missed"],
};

export const LEGEND: [StepStatus, string][] = [
  ["done", "done"],
  ["running", "running"],
  ["signoff", "waiting for sign-off"],
  ["returned", "returned"],
  ["blocked", "blocked"],
  ["todo", "not started"],
  ["skipped", "skipped"],
  ["missed", "missed"],
];

export const ASSISTANTS: [Assistant, string][] = [
  ["claude", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
];

export interface StepText {
  title: string;
  what: string;
  /** Extra guidance passed in the prompt. */
  hint: string;
  files: string[];
  where: string;
}

export const STEP: Record<string, StepText> = {
  specify: { title: "Spec from an interview", what: "The assistant interviews the analyst and writes the spec: user stories and acceptance criteria. It also sets the size and the route.", hint: "Read the linked research page and the tickets first. Ask me one question at a time.", files: ["spec.md", ".size", ".route"], where: "product-specs" },
  clarify: { title: "Closing ambiguities", what: "A devil's-advocate pass finds the gaps; the analyst closes or defers each one, then signs off the spec.", hint: "Walk me through every open question one at a time and challenge my answers.", files: ["spec.md", "CONTEXT.md"], where: "product-specs" },
  epic: { title: "Size, route and team leads", what: "The PM confirms size and route, names the teams and their leads, and marks a feature with no user interface. If the size or route is wrong, the PM returns the step to the PO.", hint: "", files: ["hub/feature.yaml", "hub/signoffs.yaml"], where: "product-specs" },
  "ux-flows": { title: "User flows", what: "One flow per user story and the list of screens, for every platform of the feature.", hint: "Use components from our design library and name each screen SCR-NN.", files: ["ux-flows.md"], where: "product-specs" },
  "tech-design": { title: "Technical design", what: "The team that publishes the API contract fits the feature into its architecture; the other teams' leads review it.", hint: "This is the contract team's repository. Keep every API change backward compatible.", files: ["sad.md", "adr/*"], where: "the contract team's repository" },
  "data-model": { title: "Data schema and migrations", what: "The contract team writes the schema and the forward and rollback migrations, staged in the feature folder. The other teams wait here.", hint: "Write forward and rollback migrations and keep them staged in the feature folder.", files: ["data-model.md", "migrations/"], where: "the contract team's repository" },
  api: { title: "API contract agreed with the other teams", what: "The contract team derives the contract. Its merge request carries sad.md, data-model.md and contracts/ to product-specs, and the other teams' leads sign it off.", hint: "List every error response. Then open the contract merge request in product-specs.", files: ["contracts/*"], where: "the contract team's repository, then product-specs" },
  screens: { title: "Screens in every state", what: "Every screen in every state for each platform, linked to the design frames.", hint: "Every screen needs default, loading, empty and error states.", files: ["screens.md"], where: "product-specs" },
  tasks: { title: "Tasks in each team repository", what: "Each team splits its own work into tasks of a day or less. A wait on another team is written as team:task in the tracker.", hint: "UI tasks first on the mock. Put switching to the real API in a separate last task, blocked by the contract team's task.", files: ["tasks.json", "tasks/tracker.md"], where: "each team repository" },
  sprint: { title: "Stories and the sprint plan", what: "The PM confirms the sprint and the order between teams, which the hub derives from the cross-team references.", hint: "List what each team can start today and what waits for another team.", files: ["hub/feature.yaml", "hub/signoffs.yaml"], where: "product-specs" },
  "plan-tests": { title: "Test plan from the criteria", what: "QA maps every acceptance criterion to at least one test on each platform. Small features keep the plan in spec.md.", hint: "List the test accounts and the seed data staging needs.", files: ["test-plan.md", "spec.md ## Test plan"], where: "product-specs" },
  implement: { title: "Implementation through TDD", what: "Each team builds its tasks test first. Teams that wait for the contract build against a mock until it lands.", hint: "Stop and ask me if a test cannot pass without changing the contract or the spec.", files: ["tasks/tracker.md"], where: "each team repository" },
  review: { title: "Independent review", what: "A clean-context reviewer checks each change against the spec; each team lead signs off the review.", hint: "For every criterion name the test that proves it, or say that none does.", files: ["_review/review-<date>.md"], where: "each team repository" },
  ship: { title: "Changelog and merge request", what: "Each team runs its part for real, writes the changelog and opens a merge request.", hint: "Prepare the merge request and do not merge it.", files: ["changelog", "merge request"], where: "each team repository" },
  staging: { title: "Deploy to staging", what: "The contract team goes to staging first, the clients switch off the mock, and QA gets the builds.", hint: "Do not deploy anything to production.", files: ["hub/release.yaml"], where: "product-specs" },
  verify: { title: "AI-assisted verification", what: "QA and the assistant walk staging and file bugs traced to criteria. A return at the final check comes back here.", hint: "Give a verdict per criterion with a screenshot. Show me the list before creating bugs.", files: ["hub/bugs/", "test-plan.md", "tests/<run>.json"], where: "product-specs" },
  autotests: { title: "Autotests in CI", what: "Pipelines in every team repository run the automated tests. Local runs are recorded but never open this gate.", hint: "", files: ["tests/<run>.json"], where: "hub-state" },
  "qa-final": { title: "Final check: return or release", what: "QA looks at the criteria, the bugs and the test runs and decides: pass to release, or return to development.", hint: "", files: ["hub/signoffs.yaml"], where: "product-specs" },
  accept: { title: "Acceptance and go / no-go", what: "The PO accepts the feature on staging; then the PM gives the go or the no-go in release.yaml.", hint: "", files: ["hub/signoffs.yaml", "hub/release.yaml"], where: "product-specs" },
  release: { title: "Release and watch", what: "Production deploys in order and a staged rollout, then the watch period.", hint: "Do not start any production job yourself. A person presses every button.", files: ["hub/release.yaml"], where: "product-specs" },
};

/** Commands on Your guide, per role: [command, arguments, what it does]. */
export const ROLE_CMDS: Record<string, [string, string, string][]> = {
  po: [["new", "<slug>", "start a feature"], ["next", "<slug>", "run your next stage"], ["signoff", "clarify <slug>", "sign off the spec"], ["return", "ux-flows <slug> \"<reason>\"", "send a step back to its owner"], ["validate", "<slug>", "check other documents after you change the spec"]],
  pm: [["status", "", "where every feature is"], ["signoff", "epic <slug>", "confirm size, route and the team leads"], ["return", "epic <slug> \"<reason>\"", "send the size or route back to the PO"], ["next", "<slug>", "plan the sprint"]],
  designer: [["next", "<slug>", "user flows, then screens"], ["status", "<slug>", "what waits for you"]],
  dev: [["next", "<slug>", "run your team's next stage"], ["run", "fix <slug>", "fix a bug on your team"], ["test", "<slug>", "run the autotests locally"], ["signoff", "tasks <slug>", "leads: sign off your team's task split"]],
  qa: [["next", "<slug>", "write the test plan"], ["verify", "<slug>", "walk staging with the assistant"], ["bug", "<slug>", "file a bug"], ["decide", "<slug>", "return or pass to release"]],
  ops: [["run", "staging <slug>", "deploy to staging and hand builds to QA"], ["release", "<slug>", "walk the release checklist"], ["doctor", "", "check the installation"]],
  admin: [["doctor", "", "check the installation"], ["sync", "", "pull both branches"], ["status", "", "where every feature is"]],
};

export const ROLE_SITE: Record<string, string[]> = {
  po: ["See which specs wait for your sign-off", "Read every document of a feature and whether its sign-off is current", "See the steps returned to you, with the reason"],
  pm: ["See progress and what each feature waits on", "See the waits between teams on the Tasks screen", "See where every feature is on the Features graph"],
  designer: ["See which flows and screens wait for you", "Read the spec and the contract behind each screen"],
  dev: ["See your team's tasks and what they wait for", "See which steps wait for your sign-off as a lead", "Read the spec, the contract and the test plan"],
  qa: ["See the features at verify, autotests and the final check", "See the blocking bugs and the test runs of each feature", "Read the spec and the test plan"],
  ops: ["See which features reach staging and release", "Read the release record of each feature"],
  admin: ["See every feature and every role's view", "Check that .hub/ loads without problems"],
};

export function hubCmd(a: Assistant, cmd: string, rest = ""): string {
  const r = rest ? ` ${rest}` : "";
  return a === "claude" ? `/hub:${cmd}${r}` : a === "codex" ? `$hub-${cmd}${r}` : `/hub-${cmd}${r}`;
}

export function engineCmd(template: string, stage: string, slug: string): string {
  return template.replace("{stage}", stage).replace("{slug}", slug);
}

// --- command help

export interface CommandHelp {
  title: string;
  what: string;
  syntax: string;
  args: [string, string][];
  examples: (slug: string) => string[];
  llm: boolean;
  /** An example of what the command prints. */
  output: (me: string, role: string, slug: string) => string;
  then: string;
  raw?: boolean;
}

export const COMMANDS: Record<string, CommandHelp> = {
  start: { title: "Start your work session", what: "Starts the local site if it is not running, syncs both branches and lists what is waiting for you.", syntax: "start", args: [], examples: () => [""], llm: false, output: (me, role) => `SDLC Hub 1.0.0 · ${me} (${role})\nSynced main and hub-state.\nSite: http://127.0.0.1:4173`, then: "Nothing changes in the repository. The site opens on Home." },
  status: { title: "See where every feature is", what: "Prints the current step of every feature, or of one feature, and what it waits on. It reads files and makes no decisions.", syntax: "status [<slug>]", args: [["<slug>", "Optional. One feature instead of all."]], examples: (s) => ["", s], llm: false, output: (_m, _r, s) => `${s}\nStep:       detected from the files\nWaiting on: the person named on the Flow screen`, then: "Read only. The same table is on the Features screen." },
  next: { title: "Run your next stage of a feature", what: "Finds the feature's current step, checks that it belongs to your role and that the gate before it is passed, then runs the stage. Engine stages go to the engine; hub steps run in the hub.", syntax: "next <slug>", args: [["<slug>", "The feature's folder name under docs/features/."]], examples: (s) => [s], llm: true, output: (me, role, s) => `${s}: your step.\nYou are ${me} (${role}).\nGate before it: passed ✓\n→ the engine stage runs here, in your assistant`, then: "The result is committed on a branch. A merge request opens and merges by itself when hub-guard passes. The site shows the new step after the next sync." },
  run: { title: "Run one named stage", what: "Runs the stage you name instead of the next one: to redo a stage after something changed, or for fix, the return path from verify.", syntax: "run <step> <slug>", args: [["<step>", "A step id such as clarify, ux-flows, tech-design, plan-tests, staging, or fix."], ["<slug>", "The feature."]], examples: (s) => [`fix ${s}`, `plan-tests ${s}`], llm: true, output: (me, role, s) => `${s}: run again.\nYou are ${me} (${role}).\n→ the stage runs here, in your assistant`, then: "Same as next. Documents that depend on a rerun stage are marked as needing validation." },
  new: { title: "Start a feature", what: "Creates the feature folder and its hub files, then starts the first stage: the spec interview.", syntax: "new <slug>", args: [["<slug>", "A short name in lower case with hyphens. It becomes the folder name."]], examples: () => ["gift-cards"], llm: true, output: () => "Created docs/features/gift-cards/ and hub/feature.yaml\n→ specify gift-cards", then: "The feature appears on the Features screen at step 1." },
  validate: { title: "Check other documents after a spec change", what: "Reads every document that refers to the changed acceptance criteria and reports what no longer agrees. It changes nothing.", syntax: "validate <slug>", args: [["<slug>", "The feature whose spec changed."]], examples: (s) => [s], llm: true, output: () => "Checked the documents that refer to AC-04.\nNothing was edited. The report is on the feature's Documents screen.", then: "Each owner reruns their stage, or confirms that their document still holds; the PO can say that only the wording changed." },
  signoff: { title: "Record a sign-off", what: "Records that you approve a gate in your role, with the content hash of the approved file. No LLM is involved. The hub-guard job accepts the entry only from the person the gate needs.", syntax: "signoff <step> <slug>", args: [["<step>", "The step whose gate you approve: clarify, epic, ux-flows, tasks, sprint, accept and others."], ["<slug>", "The feature."]], examples: (s) => [`clarify ${s}`, `epic ${s}`], llm: false, output: (me, role) => `You are ${me} (${role}).\nWrote hub/signoffs.yaml\nMerge request passed hub-guard and merged.`, then: "The step moves on after the next sync." },
  return: { title: "Send a step back", what: "Instead of signing off, the owner of a gate sends the step back with a reason. flow.yaml says where it goes; at epic, the size and route go back to the PO.", syntax: "return <step> <slug> \"<reason>\"", args: [["<step>", "The step whose gate you own."], ["<slug>", "The feature."], ["\"<reason>\"", "Why, in one sentence. It is shown to the person who gets the step back."]], examples: (s) => [`epic ${s} "Size M is too small"`], llm: false, output: (me) => `Recorded a return by ${me}.\nThe step goes back with your reason.`, then: "The step shows as returned until its owner signs it off again." },
  bug: { title: "File a bug", what: "Creates one bug file from what you describe: title, acceptance criterion, platforms, severity and the team that owns the fix.", syntax: "bug <slug>", args: [["<slug>", "The feature the bug belongs to."]], examples: (s) => [s], llm: true, output: () => "Matched to AC-04. Owning team: backend. Severity high.\nWrote hub/bugs/BUG-0012.md", then: "The owning team runs fix; QA retests." },
  verify: { title: "Verify the feature on staging", what: "Walks the acceptance criteria with you on staging, platform by platform, and records a verdict for each.", syntax: "verify <slug>", args: [["<slug>", "The feature on staging."]], examples: (s) => [s], llm: true, output: () => "AC-04 · web: is the task block hidden without access?\n> no\nRecorded AC-04 web = fail. Filed BUG-0012 (high, backend).", then: "Verdicts, bugs and test runs are recorded for the final check." },
  test: { title: "Run the autotests on your machine", what: "Runs the repository's automated tests locally and records the run, labelled as local. Only CI runs count for the gate.", syntax: "test <slug>", args: [["<slug>", "The feature whose tests to run."]], examples: (s) => [s], llm: false, output: () => "40 passed · 0 failed\nRecorded as a local run on hub-state.\nOnly the CI run opens the autotest gate.", then: "The run is listed with the label local." },
  decide: { title: "Record the final QA decision", what: "The QA final check: pass to release, or return to development with a reason and the bugs. Pass is refused while a high bug is open or CI is red.", syntax: "decide <slug>", args: [["<slug>", "The feature. The command asks: pass, or return with a reason."]], examples: (s) => [s], llm: false, output: () => "Every criterion passes ✓\nNo high bug open ✓\nCI green in every repository ✓\nRecorded qa-final: pass", then: "A return sends the feature back to verify; the owning teams run fix." },
  release: { title: "Walk the release checklist", what: "Goes through the release order with you. Every tick is recorded. It never starts a production job itself.", syntax: "release <slug>", args: [["<slug>", "The feature with a go from the PM."]], examples: (s) => [s], llm: true, output: () => "Go from the PM ✓\n1. backend deployed?\n> yes\nWrote hub/release.yaml", then: "The watch period starts when the rollout reaches 100%." },
  sync: { title: "Pull both branches", what: "Pulls main and hub-state so that the site and the assistant see what others did.", syntax: "sync", args: [], examples: () => [""], llm: false, output: () => "main: 2 new commits\nhub-state: 5 new records", then: "The site updates by itself when the files change." },
  doctor: { title: "Check the installation", what: "Checks your git identity, your role on main, the engine, the assistant and the session with the git host.", syntax: "doctor", args: [], examples: () => [""], llm: false, output: (me, role) => `✓ git identity ${me}\n✓ role ${role} on main\n✓ engine adapter is valid`, then: "A failed check says what to do." },
  serve: { title: "Start the local site", what: "Starts the local server on this machine only and opens the site. It reads the working tree and the hub-state branch.", syntax: "node hub/cli.js serve [--port <n>]", args: [["--port <n>", "Optional. 4173 by default."]], examples: () => [], llm: false, output: () => "Serving http://127.0.0.1:4173 (this machine only)\nCtrl+C stops the server.", then: "Run it in a terminal inside product-specs.", raw: true },
};

/** Which command help a command line belongs to. */
export function commandKey(text: string): string | undefined {
  const m = /^(?:\/hub:|\$hub-|\/hub-)([a-z]+)/.exec(text) ?? /^node hub\/cli\.js ([a-z]+)/.exec(text);
  return m && COMMANDS[m[1]!] ? m[1] : undefined;
}
