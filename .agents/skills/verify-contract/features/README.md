# Docs contract verification map

The maintained source for proving the repository-only checks in `scripts/`. Read this index, then use the matching feature file.

## Baseline preconditions

- `bun install --frozen-lockfile` has run; Node.js 24 and `python3` 3.10+ are on `PATH`.
- `node scripts/check-docs.mjs` passes on the base commit.
- No network, Hue account or key is needed, except for `docs:platform` and `docs:platform:check`.

## Driving conventions

- Run commands from the repo root; they read files relative to it.
- Prefer one test file or `--test-name-pattern` over `bun run check:contract`.
- Never run `bun run docs:platform` without being asked: it rewrites contracts from production.

## Proof and skip reporting

- CLI proof is the command, the last lines of output and the exit code.
- A new or changed rule needs two runs: passing on the real tree and failing on a deliberate break.
- Report a check you could not run with the command and the missing prerequisite (network, `gh` auth).

## Feature entry contract

Each feature file has an H1, one paragraph, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with node`, `Gotchas`.

## Features

- [Docs check](./check-docs.md) covers `scripts/check-docs.mjs` and `scripts/check-docs.test.mjs`.
- [Copied evaluation helpers](./eval-helpers.md) covers the TypeScript and Python helpers tested from `evaluations/eval-ready-agent.mdx`.
- [Producer contracts](./producer-contracts.md) covers `docs-contract.json` generation and the platform pin.
