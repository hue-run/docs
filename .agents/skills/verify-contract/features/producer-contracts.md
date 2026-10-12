# Producer contracts

`docs-contract.json` is generated from `contracts/sdk-docs.json` and `contracts/fern-public-docs.json`; `contracts/sources.json` records each producer revision and digest. The platform pin must match the commit production serves.

## Sub-features

- `contract-generated` keeps `docs-contract.json` in sync with the snapshots.
- `platform-pin` compares the pinned platform commit with production.
- `platform-sync-tests` proves the sync script's refusal rules offline.
- `sdk-refresh` mirrors a released SDK producer: its `docs-contract.json`, compatibility body and Hue skill.

## How to get to it (user POV)

- Run `bun run docs:contract:check`, `bun run docs:platform:check` or `node --test scripts/sync-platform-contract.test.mjs`.

## Driving it with node

Preconditions:

- Baseline preconditions hold. `docs:platform:check` also needs network access to `https://app.hue.run/api/health`.

- **Generated file current.** Run `bun run docs:contract:check`. Expect exit 0 and no output. After editing a snapshot, run `bun run docs:contract` and commit the regenerated `docs-contract.json`.
- **Sync rules offline.** Run `node --test scripts/sync-platform-contract.test.mjs`. Expect `ℹ tests 9`, `ℹ pass 9`, about 0.2 s.
- **SDK refresh.** Copy the released hue-sdk commit's `docs-contract.json` to `contracts/sdk-docs.json` byte for byte, set that commit and the file's `sha256:` digest in `contracts/sources.json`, mirror `COMPATIBILITY.md` into `sdks/compatibility.mdx` and the skill body and version into `skill.md` (and every `skill.md?v=` link), then run `bun run docs:contract` and `node scripts/check-docs.mjs`. Expect `Documentation contract is current`.
- **Pin versus production.** Run `bun run docs:platform:check` only when the change touches the platform pin. It fails while the pin trails production; the daily **Platform pin** workflow reports that, and it never gates a pull request.

## Gotchas

- `bun run docs:platform` rewrites `contracts/` from production through the GitHub CLI. Run it only when the task is a platform refresh.
- Never pin the platform snapshot to the platform's main branch.
- Pin the SDK snapshot only to a commit whose packages npm and PyPI already serve; pages must not describe an unreleased SDK.
