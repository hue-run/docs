---
name: verify-contract
description: "Prove hue-run/docs contract checks pass for a change: scripts/check-docs.mjs, its node:test suites, the generated docs-contract.json and the mirrored skill.md, compatibility page and producer pins. Use after editing any page prose the check guards (product terms, MCP tools, SDK versions, skill links), skill.md, sdks/compatibility.mdx, contracts/, docs-contract.json or scripts/."
---

# Verify the docs contract

`bun run check:contract` runs three `node:test` files (60 tests, about 5.5 s) and then `scripts/check-docs.mjs`. Run the narrowest piece that proves your change, then leave the full `bun run check` to CI.

## Launch

Nothing to start. Needs `bun install --frozen-lockfile`, Node.js 24 and `python3` (3.10+) on `PATH`. Run every command from the repo root.

## Doctor

```sh
node scripts/check-docs.mjs
# Documentation contract is current: 25 public pages, 3 key presets, 116 MCP tools.
```

About 0.1 s. A failure lists every broken rule; on a clean `main` it must pass, so a failure here is yours to fix.

## Drive

| Change | Narrowest command | Time |
| --- | --- | --- |
| Page prose, `skill.md`, compatibility, `docs.json` | `node scripts/check-docs.mjs` | 0.1 s |
| One rule in `check-docs.mjs` or its test | `node --test --test-name-pattern="<test name words>" scripts/check-docs.test.mjs` | 0.2 s |
| Copied helpers in `evaluations/eval-ready-agent.mdx` | `node --test scripts/eval-ready-agent.test.mjs` | 0.3 s |
| `scripts/sync-platform-contract.mjs` | `node --test scripts/sync-platform-contract.test.mjs` | 0.2 s |
| `contracts/*.json` or `scripts/docs-contract.mjs` | `bun run docs:contract:check` | under 0.1 s |

Feature recipes, expected failures and gotchas live in [`features/README.md`](features/README.md).

## Evidence

Paste the command and its last lines into the PR: the `Documentation contract is current: …` line, or `ℹ tests N / ℹ pass N / ℹ fail 0`. For a new rule, also paste the failure it reports on a deliberately broken copy (see [`features/check-docs.md`](features/check-docs.md)), so the rule is proven to fire.

## Cleanup

The tests build their own fixtures in the OS temp directory and remove them. Before a deliberate break, save the file: `cp <file> /tmp/<name>.orig`. Restore it with `cp /tmp/<name>.orig <file>`, not `git checkout`, which also discards your own edits to that file. Save the evidence text, restore, then rerun Doctor.
