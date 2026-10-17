# CLAUDE.md

**[`AGENTS.md`](./AGENTS.md) is the policy for this repo; it is imported below.**

@AGENTS.md

This file is a router, not a source of truth. It holds only what is specific to
Claude Code; everything else lives in `AGENTS.md` so there is one copy to keep
correct:

| You want                                                     | It is in                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Hard rules                                                   | [`docs/policy/hard-rules.md`](./docs/policy/hard-rules.md), embedded in `AGENTS.md` by `npm run sync:policy` |
| Which skill to use                                           | `AGENTS.md` § Repository ownership                                          |
| Lookups (`feature` / `where` / `table`) and which doc to read | `AGENTS.md` § Authoritative references                                      |
| Layering, module boundaries, where handlers live             | `AGENTS.md` § Architecture boundaries                                       |
| Commands, tests, deploys, ops flags                          | `AGENTS.md` § Keep contracts and documentation synchronized, then `docs/command/` |
| What to verify before handing back                           | `AGENTS.md` § Scope, safety, and verification                               |

Never paste a rule, a command list, or an architecture summary into this file:
a second copy is a copy that goes stale. `npm run check:policy` fails if hard
rules appear here.

## Claude Code specifics

- Personal reply style (terse progress + short resume): `~/.claude/CLAUDE.md`.
- Local permission overrides: `.claude/settings.local.json` (gitignored).
