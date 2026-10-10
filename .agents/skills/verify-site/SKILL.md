---
name: verify-site
description: "Run the docs.hue.run Mintlify site locally and prove a changed page renders, navigates and redirects. Use after editing any .mdx page, docs.json navigation or redirects, style.css, images or logo files in hue-run/docs."
---

# Verify the local docs site

Drives the Mintlify preview (`mint dev`) the way a reader does: open the changed page, follow its sidebar entry, and hit any redirect you touched. Run the narrowest step that proves your change; `bun run check` in CI covers the rest.

## Launch

From the repo root, after `bun install --frozen-lockfile`:

```sh
mkdir -p /tmp/hue-docs-verify/site
bun run dev --port 3333 > /tmp/hue-docs-verify/site/dev.log 2>&1 & echo $! > /tmp/hue-docs-verify/site/dev.pid
```

Ready when `dev.log` prints `local   → http://localhost:3333` (about 5 s). Pick another port if 3333 is taken; never reuse a preview you did not start.

## Doctor

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/quickstart   # 200
curl -s http://localhost:3333/quickstart | grep -o "<title>[^<]*</title>"   # <title>Quickstart - Hue</title>
```

Anything else: read `dev.log`, stop the preview (Cleanup) and relaunch.

## Drive

Pick the feature file for what you changed from [`features/README.md`](features/README.md). Text proof is a `curl` status, final URL and `<title>`. For a visible UI change, take one screenshot with the helper (about 10 s, first run longer):

```sh
node .agents/skills/verify-site/screenshot.mjs http://localhost:3333/<page> /tmp/hue-docs-verify/site/<page-slug>.png
# 200 http://localhost:3333/<page> | <Title> - Hue | h1: <Title> | /tmp/hue-docs-verify/site/<page-slug>.png
```

## Evidence

Paste the `curl` or helper output line into the PR. Attach one screenshot only when the change is visible (layout, component, style, image). Proof comes from the running preview, not from reading the MDX.

## Cleanup

```sh
kill "$(cat /tmp/hue-docs-verify/site/dev.pid)"; rm /tmp/hue-docs-verify/site/dev.pid
```

Kill only the PID you saved. Screenshots and `dev.log` stay in `/tmp/hue-docs-verify/site/`.
