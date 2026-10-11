# TypeScript samples

A developer copies a TypeScript or JavaScript sample from Quickstart or the TypeScript SDK page into an ESM project with `@hue-run/sdk` installed, runs it with Node.js, and gets a trace or a clear error.

## Sub-features

- `ts-guard` stops with the sample's own message when `HUE_API_KEY` is unset.
- `ts-reach` calls Hue and fails with `401` for a fake key, proving imports and API calls.

## How to get to it (user POV)

- Quickstart, step **4. Record a request**, **TypeScript / JavaScript** tab (`first-trace.mjs`).
- `sdks/typescript.mdx` code blocks.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold, with `@hue-run/sdk` installed in `$VERIFY`.

- **Extract.** Run `node "$R/.agents/skills/verify-code-samples/snippet.mjs" "$R/quickstart.mdx" 5 > first-trace.mjs` (block 5 is the `javascript` block in the listing).
- **Guard.** Run `env -u HUE_API_KEY node first-trace.mjs`. Expect exit 1 and `Error: Set HUE_API_KEY and HUE_CAPTURE_CONTENT=true (recommended) or false`.
- **Fake-key rejection (not end to end).** Run `HUE_API_KEY=hue_verify_invalid node first-trace.mjs`. Expect exit 1 and `status: 401` from `checkConnection()`, about 1 s.
- **Fragments.** For a block that is not a complete program (it uses `hue` without creating it), append it to the page's setup block and run the result the same way.
- **Types.** For `.ts` samples, run `node <file>.ts`; Node.js 24 strips types. `import type` and `type` imports must stay type-only.

## Gotchas

- The project must be ESM (`npm pkg set type=module`), as Quickstart says, or `import` fails.
- AI SDK samples need the provider and version the page pins (`bun add ai@… @ai-sdk/otel@…`); without a model key, stop at the guard and say so.

## Media and explicit file uploads

Install the candidate npm tarball in the isolated ESM project. Run the TypeScript guide's `recordFile` example with a small synthetic PDF and a loopback receiver that implements blob reservation, PUT and completion, plus OTLP acknowledgements. Assert the receiver's exact bytes and digest, the same-span `event:hue.file:<sha256>` entry, and the existing `hue.file` event. Test omitted `upload`, `captureContent: false` and setup credentials: none may reserve or send bytes. A failed upload must keep metadata and report a fallback. Check Unicode names and rejection of control or oversized names; supplied helper data over 25 MiB is omitted and counted. Exercise automatic message uploads using the shared SDK corpus, including remote URL/file ID passthrough and the 64 KiB text boundary. A generic blob 404 stub proves fallback only. Do not call a paid model provider to run these samples.
