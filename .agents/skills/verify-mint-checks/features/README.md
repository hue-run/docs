# Mintlify checks verification map

The maintained source for proving the Mintlify CLI checks that `bun run check:mint` runs. Read this index, then use the matching feature file.

## Baseline preconditions

- `bun install --frozen-lockfile` has run, so `npx mint` resolves to the pinned CLI.
- Each check passes on the base commit.
- No Hue account, key or network service is needed.

## Driving conventions

- Run from the repo root; the CLI reads `docs.json` and every non-ignored `.mdx` file.
- Run the one check that matches the change; CI runs all three.

## Proof and skip reporting

- CLI proof is the command, the `success …` or error lines, and the exit code.
- A link fix needs the failing line before and the `success` line after.

## Feature entry contract

Each feature file has an H1, one paragraph, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the mint CLI`, `Gotchas`.

## Features

- [Build validation](./validate.md) covers `mint validate`.
- [Links and anchors](./broken-links.md) covers `mint broken-links --check-anchors`.
- [Media accessibility](./a11y.md) covers `mint a11y --skip-contrast`.
