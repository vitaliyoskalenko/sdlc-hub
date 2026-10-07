# SDLC Hub: design handoff

Everything produced in the design phase, packed for a new repository.

- `CLAUDE.md` — project memory for Claude Code. It is loaded automatically when you run `claude` in this folder.
- `docs/specification.md` — the specification (revision 50).
- `docs/open-items.md` — what is not finished or not verified.
- `docs/research/` — the SDD engine README and its tool adapters, saved during research.
- `prototypes/` — the hub, the first-install site and the AI-SDLC map, with their checks.

## Start

```
git init && git add . && git commit -m "Design handoff"
claude
```

A first message that works well:

> Read CLAUDE.md, docs/specification.md and docs/open-items.md. Then propose the workspace layout and a test-first plan for phase 1 (read-only site). Do not write code yet.
