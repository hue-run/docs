---
name: verify-mint-checks
description: "Prove a hue-run/docs change passes Mintlify's own checks: MDX build validation, internal links and anchors, and media accessibility (`bun run check:mint`). Use after editing .mdx pages, docs.json, links, headings or images."
---

# Verify Mintlify checks

`bun run check:mint` runs three Mintlify CLI checks in sequence (about 12 s). Run only the one your change touches (about 2.5 s each); CI runs all three.

## Launch

Nothing to start. Needs `bun install --frozen-lockfile`; the pinned CLI is `node_modules/.bin/mint` (`mint` in `package.json`). Run from the repo root.

## Doctor

```sh
npx mint version   # cli version 4.2.905, the version pinned in package.json
```

Never run `mint update`; the CLI version is pinned on purpose.

## Drive

| Change | Command | Pass line |
| --- | --- | --- |
| MDX syntax, components, frontmatter, `docs.json` | `npx mint validate` | `success build validation passed` |
| Links, headings, anchors, page moves | `npx mint broken-links --check-anchors` | `success no broken links found` |
| Images, video, alt text | `npx mint a11y --skip-contrast` | `success no accessibility issues found` |

Recipes, failure output and gotchas: [`features/README.md`](features/README.md).

## Evidence

Print the evidence before Cleanup: run each check as `<command>; echo "exit $?"` and paste the command, its `success …` line and the exit code into the PR. For a link or anchor fix, also paste the failing run from before the fix. For a deliberate break, print the failure before you restore the file.

## Cleanup

The checks write nothing to the working tree. Before a deliberate break, save the file: `cp <file> /tmp/<name>.orig`. Restore it with `cp /tmp/<name>.orig <file>`, not `git checkout`, which also discards your own edits to that file.
