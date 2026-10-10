---
name: verify-code-samples
description: "Run hue-run/docs code samples against the published SDK releases (npm @hue-run/sdk, PyPI hue-run) in a scratch directory, with no real Hue key. Use after adding or editing a TypeScript, Python, shell or CLI sample in any .mdx page or skill.md, or after changing a documented SDK version."
---

# Verify code samples

Extract the changed sample from its page, install the pinned release in a scratch directory and run it. Without a real key the strongest offline proof is the sample's own guard; with a syntactically fake key, a sample that calls Hue proves its imports, API calls and error path by getting a `401`. Run only the samples you changed.

## Launch

Read the pinned versions, then make a scratch project (about 2 s for npm, 5 s for pip):

```sh
jq -c '.packages | map_values(.version)' contracts/sdk-docs.json   # {"python":"0.9.1","typescript":"0.16.0"}
export VERIFY=/tmp/hue-docs-verify/samples && mkdir -p "$VERIFY" && R="$PWD"
cd "$VERIFY" && npm init -y >/dev/null && npm pkg set type=module && npm install -s @hue-run/sdk@<typescript version>
python3 -m venv .venv && .venv/bin/pip install -q hue-run==<python version>
```

Install only the language you need. Use the exact version the page shows; the docs check fails if pages disagree with `contracts/sdk-docs.json`.

## Doctor

```sh
npm ls @hue-run/sdk                         # @hue-run/sdk@<typescript version>
.venv/bin/python -m pip show hue-run | head -2   # Version: <python version>
```

## Drive

List a page's code blocks, then write one to a file:

```sh
node "$R/.agents/skills/verify-code-samples/snippet.mjs" "$R/quickstart.mdx"          # index, language, title, first line
node "$R/.agents/skills/verify-code-samples/snippet.mjs" "$R/quickstart.mdx" 5 > first-trace.mjs
```

Run it per the matching file in [`features/README.md`](features/README.md). Never export a real `HUE_API_KEY` here; unset it with `env -u HUE_API_KEY`.

## Evidence

Paste the command, the decisive output line and the exit code into the PR, for example `HUE_API_KEY=hue_verify_invalid node first-trace.mjs` → `status: 401`, exit 1.

## Cleanup

```sh
cd "$R" && rm -rf "$VERIFY"/node_modules "$VERIFY"/.venv
```

Keep the extracted sample files in `$VERIFY` as evidence; delete only the installs.
