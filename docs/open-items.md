# Open items

State on 7 October 2026, after an independent review of the specification and both prototypes. Items already fixed are not listed.

## Specification

- The repository tree and the data samples in "Repository layout" and "Data model" predate the review. They do not show `.hub/keys/`, per-person usage files (`metrics/<yyyy-mm>/<person>.jsonl.age`), `.hub/install.log`, `hub/validation/` or the fields of the QA decision (decision, reason, bugs, cycle). The prose in "Hardening and lifecycle" is newer and wins.
- The delivery plan table is unchanged; a paragraph under it says where the newer screens and `hub-report` belong.
- "Setup" means three things: the first-install site, the per-person `hub setup` command and the setup script. "Step" and "stage" are used loosely; intended meaning: step = one of the twenty, engine stage = an SDD stage.
- The two diagrams (architecture; QA and release) still say GitLab only and were not redrawn.
- Prompt templates (`.hub/prompts/`) have no specified format yet.
- The task and dependency schema across team repositories is thin: how `backend:T-02` style cross-team dependencies are stored is not specified.
- Jira mirror of bugs: no command or trigger is specified, only the setting.

## To verify before building on it

- GitLab: a merge request set to merge automatically uses the rights of the person who set it (the design therefore allows merge for Developers on protected `main`).
- GitLab: pipelines for merge requests from forks; group and project access tokens on self-managed Free; the MCP server on Free from 19.2.
- GitHub: required check tied to GitHub Actions as its source; auto-merge and plan limits for private repositories.
- Claude Code: whether one plugin can declare another as a dependency; exact hook payloads; headless JSON fields.
- Codex and Cursor: skill invocation syntax (`$hub-name`, `/hub-name`), hooks, where usage can be read.

## Hub prototype

- Role tiles for PM, designer and Ops are still fixed sample numbers.
- Not shown: answering a QA question, opening a task file, the headless result before saving, editing prices.
- Settings does not reflect what was entered in the setup prototype (two separate pages with no shared data). It always shows Jira and four teams.
- The hub prototype shows four fixed sample teams although the list is free in setup.
- Phone: the tab row and the side menu scroll sideways without a hint.

## Setup prototype

- A team repository row on the phone has labels, but the preset buttons replace rows without asking.
- The GitHub Free state is reachable only through a prototype toggle.
