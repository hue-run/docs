# OpenTelemetry samples

A developer sends traces to Hue with standard OpenTelemetry packages and no Hue SDK, using the pinned package versions on the OpenTelemetry page.

## Sub-features

- `otel-node` exports a span with `@opentelemetry/exporter-trace-otlp-http`.
- `otel-python` exports a span with `opentelemetry-exporter-otlp-proto-http`.
- `otel-file-upload` uploads a file through the three upload calls, then exports a span with its `hue.file` event and `hue.blobs` entry.

## How to get to it (user POV)

- `integrations/opentelemetry.mdx`, **Send from any language**, **Node.js** and **Python** tabs.
- `integrations/opentelemetry.mdx`, **Attach files without the SDK**, the `attach.py` block.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold, in a separate scratch directory so the Hue SDK's OpenTelemetry versions do not mix in.

- **Install.** Run block 0 (Node.js) or block 2 (Python) from `snippet.mjs "$R/integrations/opentelemetry.mdx"` exactly as printed, in a fresh ESM project or venv.
- **Guard.** Run block 1 as `send.mjs` with `env -u HUE_API_KEY node send.mjs`. Expect exit 1 and `Error: Set HUE_API_KEY in your server environment.`
- **Fake-key rejection (not end to end).** Run `HUE_API_KEY=hue_verify_invalid node send.mjs`. Expect `Trace ID: <32 hex>`, then exit 1 with `OTLPExporterError: Unauthorized` when the export reaches Hue.
- **File upload.** In the Python venv, write the `attach.py` block (its index is the `python` block whose first line is `import hashlib`) and a small `chart.png` next to it. `env -u HUE_API_KEY python attach.py` exits 1 with `KeyError: 'HUE_API_KEY'`. `HUE_API_KEY=hue_verify_invalid python attach.py` exits 1 with `urllib.error.HTTPError: HTTP Error 401: Unauthorized` from the reservation; it is a rejection test, and the `PUT` and the completion did not run. The span still ends and its export fails with `401` at exit.
- **File upload against a local receiver (not end to end).** To prove the later calls, copy the sample with `HUE` set to a loopback receiver that answers the reservation with a `PUT` URL on itself and the headers Hue returns (`Content-Length`, `Content-Type`, `x-amz-checksum-sha256`, `If-None-Match: *`), checks the `PUT` body against the checksum, answers the completion and decodes the OTLP export. Expect one reservation, one `PUT` without `Authorization`, one completion and a span with the `hue.file` event and a one-entry `hue.blobs`; a second run whose reservation answers `exists` skips the `PUT` and the completion. Write the receiver outside the repository and run it with `python -I`.

## Gotchas

- The Collector tab needs `otelcol-contrib`; report it as not run unless the binary is installed.
- The pinned OpenTelemetry versions are deliberate; do not upgrade them while verifying.
