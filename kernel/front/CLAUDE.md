# CLAUDE.md

**[`AGENTS.md`](./AGENTS.md) is the policy for this repo; it is imported below.**

@AGENTS.md

This file is a router, not a source of truth. It holds only what is specific to
Claude Code; everything else lives in `AGENTS.md` so there is one copy to keep
correct:

| You want                                       | It is in                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard rules                                     | [`../back/docs/policy/hard-rules.md`](../back/docs/policy/hard-rules.md), embedded by `npm --prefix ../back run sync:policy` |
| What this repo owns, and what the siblings own | `AGENTS.md` § Scope and related repositories                                                                                                            |
| Screens map, symbol lookup, where to start     | `AGENTS.md` § Before changing code                                                                                                                      |
| Layering, i18n, theme conventions              | `AGENTS.md` § Implementation conventions                                                                                                                |
| Which checks to run before handing back        | `AGENTS.md` § Verification                                                                                                                              |

Never paste a rule, a command list, or a repo-ownership table into this file: a
second copy is a copy that goes stale.

## Claude Code specifics

- From the back workspace, front work uses
  `../back/.agents/skills/tuucho-frontend-change/SKILL.md`.
- Personal reply style (terse progress + short resume): `~/.claude/CLAUDE.md`.
- Local permission overrides: `.claude/settings.local.json` (gitignored).
