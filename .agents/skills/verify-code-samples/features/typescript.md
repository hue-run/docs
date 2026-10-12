# TypeScript samples

A developer copies a TypeScript or JavaScript sample from Quickstart or the TypeScript SDK page into an ESM project with `@hue-run/sdk` installed, runs it with Node.js, and gets a trace or a clear error.

## Sub-features

- `ts-guard` stops with the sample's own message when `HUE_API_KEY` is unset.
- `ts-reach` calls Hue and fails with `401` for a fake key, proving imports and API calls.
- `ts-media` uploads the **Images, documents and audio** `recordFile` sample's file and recorded message media to a loopback receiver.

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
- **Media (loopback, not end to end).** Prefix the `recordFile` fragment with `createHue({ apiKey, serviceName, captureContent: true, baseUrl: "http://127.0.0.1:<port>", liveSpans: false })`, suffix it with `hue.flush()` and `hue.transport.getReport()`, and run it next to a small `contract.pdf` against a receiver that answers the blob reservation, the presigned `PUT`, the completion and OTLP. Expect one reservation keyed `event:hue.file:<sha256>`, the exact bytes in the `PUT` without `Authorization`, the `hue.file` event and a same-span `hue.blobs` entry with `name`. Without `upload: true`, with `captureContent: false` or with a `hue_setup_` key, expect no reservation. A tab in `name` drops the name, counts one instrumentation failure and keeps the event. For message media, record a `blob` image part, a `text/plain` part over 64 KiB and a `uri` part with `hue.model(...).setInput`: expect the image as `sha256` and `size` keyed at the part, the text as a 16 KiB prefix keyed at `/content`, and the `uri` unchanged. A receiver that answers the reservation with a plain 404 proves the fallback: digests stay, no `hue.blobs`, `uploadFallbacks` counts each file. Media over 64 KiB in a span event becomes its digest and never reserves.

## Gotchas

- The project must be ESM (`npm pkg set type=module`), as Quickstart says, or `import` fails.
- AI SDK samples need the provider and version the page pins (`bun add ai@… @ai-sdk/otel@…`); without a model key, stop at the guard and say so.
