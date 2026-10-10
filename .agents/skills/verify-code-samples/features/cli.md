# CLI commands

A developer runs the `hue` CLI with the package named explicitly, `npx -y @hue-run/sdk@<version> <command>`, from a project directory.

## Sub-features

- `cli-help` prints usage for the top-level command and each subcommand.
- `cli-flags` accepts every flag a page documents.

## How to get to it (user POV)

- `sdks/cli.mdx`, `guides/agent-setup.mdx`, `evaluations/run-your-agent.mdx` and `evaluations/eval-ready-agent.mdx`.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold; no install is needed beyond `npx`.

- **Usage.** Run `env -u HUE_API_KEY npx -y @hue-run/sdk@<version> --help`. Expect exit 0 and `Usage: hue <setup|resume|status|claim|login|eval|mcp|listen> …`, about 2 s on first fetch.
- **Subcommand flags.** Run `env -u HUE_API_KEY npx -y @hue-run/sdk@<version> <subcommand> --help` (for example `eval`). Expect exit 0 and every flag the changed page uses, for example `--case <name|id|url>`; check with `| grep -- "--<flag>"`.
- **No side effects.** Run commands that write state (`login`, `mcp install`, `eval` without `--help`) only with `--help` here; they need a real key or account.

## Gotchas

- A bare `npx hue` runs an unrelated npm package; the docs check rejects it in code blocks.
- `npx` caches packages; pass the exact version so a cached older release is not used.
