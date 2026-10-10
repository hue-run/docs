# Build validation

`mint validate` builds every published page and `docs.json` the way the Mintlify deployment does, so MDX syntax errors, unknown components and invalid configuration fail before merge.

## Sub-features

- `validate-mdx` parses every `.mdx` page and its components.
- `validate-config` checks `docs.json` against Mintlify's schema.

## How to get to it (user POV)

- Run `npx mint validate`, or `bun run check:mint` for all three checks.

## Driving it with the mint CLI

Preconditions:

- Baseline preconditions hold.

- **Pass.** Run `npx mint validate`. Expect exit 0 and `success build validation passed`, about 2.5 s.
- **Fail.** Leave a component unclosed in a scratch edit, for example delete a `</Note>`, and rerun. Expect exit 1, `warning - parsing error ./<file>.mdx:<line>:<col> - Expected a closing tag for `<Note>`` and `error Build validation failed with 1 warning(s).` Restore the copy you saved first (see Cleanup in [`../SKILL.md`](../SKILL.md)).

## Gotchas

- Files listed in `.mintignore` (and Mintlify's built-in ignores such as `.agents/` and `.claude/`) are not built; a repository-only file outside those paths is published.
- `mint dev` can render a page that `mint validate` rejects. Validate is the deployment gate.
