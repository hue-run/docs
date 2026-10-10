# Copied evaluation helpers

`evaluations/eval-ready-agent.mdx` publishes TypeScript and Python helpers that customers copy into their agents. `scripts/eval-ready-agent.test.mjs` extracts each titled snippet from the page and runs it, so the published code is what gets tested.

## Sub-features

- `helper-ts` runs the TypeScript helper under Node.js type stripping.
- `helper-py` runs the Python helper with `python3`.

## How to get to it (user POV)

- Copy the helper from the **Eval-ready agent** page into an agent repository.

## Driving it with node

Preconditions:

- `python3 --version` prints 3.10 or later.

- **Both helpers.** Run `node --test scripts/eval-ready-agent.test.mjs`. Expect `ℹ tests 2`, `ℹ pass 2`, about 0.3 s.
- **One language.** Run `node --test --test-name-pattern="Python" scripts/eval-ready-agent.test.mjs` (or `TypeScript`). Expect `ℹ tests 1`.

## Gotchas

- The test finds snippets by their code-block `title="…"`. Renaming a title breaks the test with `missing helper <title>`.
- Synthetic `*.invalid` URLs and tokens are deliberate; never replace them with real endpoints or keys.
