# The full feature cycle on the local GitLab

One feature from `/hub:new` to release, on the local GitLab CE in Docker, with every role played by its own person and every engine stage run by the real SDD in Claude Code. It is not part of `npm test` or `npm run e2e`: it takes a few hours and spends tokens of the Claude Code subscription.

## What it needs

- The local GitLab and its runner from [`e2e/gitlab/bootstrap.mjs`](../gitlab/bootstrap.mjs) (see the README's "Testing against real hosts").
- Claude Code, signed in.
- SDD 2.3.0 checked out: `git clone --depth 1 --branch v2.3.0 https://github.com/genkovich/sdd.git <dir>`.
- Node 22 or newer. The scripts are TypeScript and run with `node --experimental-transform-types --no-warnings e2e/cycle/<script>.ts`.

Environment:

| Variable | What |
|---|---|
| `CYCLE_WORK` | The folder for each person's workspace (their clones, keys and run logs). Default: `$TMPDIR/sdlc-hub-cycle`. |
| `CYCLE_SDD` | The SDD checkout. Default: `$CYCLE_WORK/../sdd`. |
| `CYCLE_MODEL` | The model of the engine stages. Default: `sonnet`. |

Secrets stay in `~/.sdlc-hub-test/gitlab.json` (mode 600), under `cycle`. Nothing writes the system keychain or this machine's Claude Code plugin registry: each person's keys go to their workspace, and the plugins are loaded with `--plugin-dir`.

## Set up

```
node e2e/cycle/bootstrap.mjs          # group cycle: eight people with tokens, product-specs, backend and web-admin
npm run -s build
node --experimental-transform-types --no-warnings e2e/cycle/install.ts
```

`install.ts` runs the checks and the install as the admin, the team leads merge their hub-report merge requests, the admin adds the people, and each person runs the setup script the admin generated for them.

## Play the cycle

Each step is done by the person whose step it is, with one of these:

| Script | What a person does with it |
|---|---|
| `claude.ts <user> <repo> <label> "<prompt>"` | Runs Claude Code headless in their clone, for example `"/hub:next order-notes"` in product-specs or `"/sdd:tasks order-notes"` in a team repository. The answer, cost and time go to `<workspace>/<user>/runs/<label>.json`. |
| `tool.ts <user> <tool> '<json>'` | Calls a tool of the hub's MCP server, as the assistant does once the person confirmed in the chat: `hub_signoff`, `hub_verdicts`, `hub_bug`, `hub_decide`, `hub_release_edit`. |
| `site.ts <user> <action> '<json>'` | Starts their local site and posts what a button posts, for example the PM's teams in `details`, then waits for the merge. |
| `as.ts <user> <repo> <command...>` | Any command in their clone as them: `node hub/cli.js sync`, `git push`. |
| `merge.ts <user> <repo> <iid>` | Merges a merge request, as the merge button does. |
| `wait.ts <repo> <iid>` | Waits for a merge request to merge, and shows the hub-guard log if it did not. |
| `steps.ts <user> <slug>` | Prints every step as the hub detects it on that person's machine. |

An engine stage that runs in a team repository runs on the branch `feat/<slug>`; the lead pushes the branch and the team's pipeline publishes its snapshot. The rest goes through the hub: `hub_record` saves what a stage left in product-specs as a merge request in the person's name.
