# SDLC Hub

A local web site and an assistant plugin that live inside a team's `product-specs` repository and show the whole AI-assisted, spec-driven development flow of every feature. The design is in `docs/specification.md` (the source of truth), `docs/decisions.md` and `docs/open-items.md`; `CLAUDE.md` is the short version.

## Run it

Node 22 or newer and git.

```
npm install
npm run demo -- --as iryna.s     # build, write the demo project to a temporary folder, serve it
```

Open the address it prints, `http://127.0.0.1:4173/?as=iryna.s`. The dashed "Demo" control in the top bar switches the person and the assistant; `--as <user>` picks who you are at start. The people are `nazar.t` (admin), `olena.k` (PO), `maksym.d` (PM), `daria.l` (designer), `taras.m`, `petro.v`, `andrii.p`, `sofiia.h` (team leads of backend, web, Android, iOS), `iryna.s` (QA) and `bohdan.r` (Ops). Ctrl+C stops the demo and deletes the folder.

Other fixtures: `npm run demo -- --fixture <name>`, for example `quick-route`, `implement-blocked`, `qa-return-cycle-2` or `no-user-interface` (all in `packages/fixtures/src/cases.ts`).

On a real `product-specs` checkout: `npm run build`, then from inside the checkout `node <this repo>/packages/cli/dist/cli.mjs serve`. You are the person in `.hub/roles.yaml` that matches your git identity, or `--as <user>`.

## Check it

```
npm test            # unit and integration tests (Vitest)
npm run typecheck
npm run e2e         # build, then walk every page as every person at 1366px and 390px (Playwright)
```

`npx playwright install chromium` once before the first `npm run e2e`.

## Layout

| Package | What |
|---|---|
| `packages/core` | Data model and validators, the SDD adapter, step detection, roles and paths. No I/O. |
| `packages/git` | Read-only view of product-specs: the working tree, the `hub-state` branch, team clones, git authors. |
| `packages/server` | Loopback-only server: Host and Origin checks, session cookie, read-only REST and SSE, the web app. |
| `packages/web` | The site (Preact + Vite). |
| `packages/cli` | `serve` and `demo`, bundled into one file by esbuild. |
| `packages/fixtures` | Synthetic fixture repositories and the demo project, until a real SDD run replaces them. |
| `prototypes/` | The UI reference from the design phase. |
