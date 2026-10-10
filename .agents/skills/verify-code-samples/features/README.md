# Code sample verification map

The maintained source for proving that published samples run against the released SDKs. Read this index, then use the matching feature file.

## Baseline preconditions

- The scratch project at `/tmp/hue-docs-verify/samples` has the versions from `contracts/sdk-docs.json` installed (see [`../SKILL.md`](../SKILL.md) Launch).
- `HUE_API_KEY` is unset. Use the fake key `hue_verify_invalid` where a recipe needs one; never a real key.
- Network access to npm, PyPI and `https://app.hue.run` (only for the `401` step).

## Driving conventions

- Extract samples with `snippet.mjs`; never retype them, so the run tests the published text.
- Run each sample twice: without a key (guard) and with the fake key (reaches Hue, gets `401`).
- A sample that needs a model provider or a real project stops at the first step you can prove; say which step.

## Proof and skip reporting

- CLI proof is the command, the decisive output line and the exit code.
- Report a sample you could not run with the reason (needs a real key, a model provider, a Collector).
- Do not report a sample as verified because a similar sample ran.

## Feature entry contract

Each feature file has an H1, one paragraph, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with snippet.mjs`, `Gotchas`.

## Features

- [TypeScript samples](./typescript.md) covers Quickstart and `sdks/typescript.mdx` samples on npm `@hue-run/sdk`.
- [Python samples](./python.md) covers Quickstart and `sdks/python.mdx` samples on PyPI `hue-run`.
- [CLI commands](./cli.md) covers `npx -y @hue-run/sdk@<version> …` commands in `sdks/cli.mdx`, agent setup and evaluation pages.
- [OpenTelemetry samples](./opentelemetry.md) covers the plain OTLP exporter samples in `integrations/opentelemetry.mdx`.
