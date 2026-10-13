# CLI commands

A developer runs the `hue` CLI with the package named explicitly, `npx -y @hue-run/sdk@<version> <command>`, from a project directory.

## Sub-features

- `cli-help` prints usage for the top-level command and each subcommand.
- `cli-flags` accepts every flag a page documents.
- `cli-import-langfuse` imports a Langfuse project's traces and media into Hue.

## How to get to it (user POV)

- `sdks/cli.mdx`, `guides/agent-setup.mdx`, `evaluations/run-your-agent.mdx` and `evaluations/eval-ready-agent.mdx`.
- `sdks/cli.mdx` **Import traces from Langfuse**, and `integrations/opentelemetry.mdx` **Use with Langfuse**.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold; no install is needed beyond `npx`.

- **Usage.** Run `env -u HUE_API_KEY npx -y @hue-run/sdk@<version> --help`. Expect exit 0 and `Usage: hue <setup|resume|status|claim|login|eval|mcp|listen|import> …`, about 2 s on first fetch.
- **Subcommand flags.** Run `env -u HUE_API_KEY npx -y @hue-run/sdk@<version> <subcommand> --help` (for example `eval`). Expect exit 0 and every flag the changed page uses, for example `--case <name|id|url>`; check with `| grep -- "--<flag>"`.
- **Import from Langfuse (loopback, not end to end).** Install the release in a scratch ESM project, write `.env.langfuse` with test keys and `LANGFUSE_BASE_URL` pointing at a loopback stand-in that answers `GET /api/public/v2/observations` (the probe, the `isRootObservation=true` listing filtered by `fromStartTime` and `toStartTime`, and one trace's observations), `GET /api/public/media/{id}` with a loopback download URL, and `401` without Basic auth. Point `HUE_BASE_URL` at a Hue stand-in that answers `GET /api/v1/projects/current`, the blob upload calls and OTLP. Run the page's commands as printed (add `--yes` without a terminal). Expect the dry run to need no `HUE_API_KEY` and to read a window that ends an hour before the command started; the import to keep hex ids, derive others with the originals in `langfuse.trace.id` and `langfuse.observation.id`, and place a media file in digest form under `langfuse.observation.input#/<pointer>`; a second run to send identical spans without a second `PUT`; `--langfuse-secret-key` to exit `2`; and a refused Hue key to exit `1` before any Langfuse request.
- **No side effects.** Run commands that write state (`login`, `mcp install`, `eval` without `--help`) only with `--help` here; they need a real key or account.

## Gotchas

- A bare `npx hue` runs an unrelated npm package; the docs check rejects it in code blocks.
- `npx` caches packages; pass the exact version so a cached older release is not used.
