# Python samples

A developer copies a Python sample from Quickstart or the Python SDK page into a virtual environment with `hue-run` installed, runs it, and gets a trace or a clear error.

## Sub-features

- `py-guard` stops with the sample's own message when `HUE_API_KEY` is unset.
- `py-reach` calls Hue and fails with HTTP 401 for a fake key.

## How to get to it (user POV)

- Quickstart, step **4. Record a request**, **Python** tab (`first_trace.py`).
- `sdks/python.mdx` code blocks.

## Driving it with snippet.mjs

Preconditions:

- Baseline preconditions hold, with `hue-run` installed in `$VERIFY/.venv`.

- **Extract.** Run `node "$R/.agents/skills/verify-code-samples/snippet.mjs" "$R/quickstart.mdx" 6 > first_trace.py`.
- **Guard.** Run `env -u HUE_API_KEY .venv/bin/python first_trace.py`. Expect exit 1 and `ValueError: Set HUE_API_KEY and HUE_CAPTURE_CONTENT=true (recommended) or false`.
- **Reach Hue.** Run `HUE_API_KEY=hue_verify_invalid .venv/bin/python first_trace.py`. Expect exit 1 and `hue_sdk.client.ProjectValidationError: Hue project validation failed (HTTP 401).`, under 1 s.
- **Extras.** For samples that use `builtin_scorers.json_schema`, install `'hue-run[evals]==<version>'`.

## Gotchas

- Use the venv's interpreter (`.venv/bin/python`); a system `python3` may have another `hue-run` or none.
- The import name is `hue_sdk`, the package name is `hue-run`.
