# OpenTelemetry samples

A developer sends traces to Hue with standard OpenTelemetry packages and no Hue SDK, using the pinned package versions on the OpenTelemetry page.

## Sub-features

- `otel-node` exports a span with `@opentelemetry/exporter-trace-otlp-http`.
- `otel-python` exports a span with `opentelemetry-exporter-otlp-proto-http`.

## How to get to it (user POV)

- `integrations/opentelemetry.mdx`, **Send from any language**, **Node.js** and **Python** tabs.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold, in a separate scratch directory so the Hue SDK's OpenTelemetry versions do not mix in.

- **Install.** Run block 0 (Node.js) or block 2 (Python) from `snippet.mjs "$R/integrations/opentelemetry.mdx"` exactly as printed, in a fresh ESM project or venv.
- **Guard.** Run block 1 as `send.mjs` with `env -u HUE_API_KEY node send.mjs`. Expect exit 1 and `Error: Set HUE_API_KEY in your server environment.`
- **Fake-key rejection (not end to end).** Run `HUE_API_KEY=hue_verify_invalid node send.mjs`. Expect `Trace ID: <32 hex>`, then exit 1 with `OTLPExporterError: Unauthorized` when the export reaches Hue.

## Gotchas

- The Collector tab needs `otelcol-contrib`; report it as not run unless the binary is installed.
- The pinned OpenTelemetry versions are deliberate; do not upgrade them while verifying.
