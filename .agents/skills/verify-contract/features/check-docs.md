# Docs check

`scripts/check-docs.mjs` enforces the repository contract on every public page: navigation, product vocabulary, access-preset names, MCP URLs and tool listings, SDK versions and exports, `skill.md` and compatibility mirrors, versioned skill links, redirects, `.mintignore` and theme contrast. `scripts/check-docs.test.mjs` proves each rule fires on a broken fixture copy.

## Sub-features

- `check-pass` reports the contract as current for the working tree.
- `check-fail` lists each violated rule and exits 1.
- `check-tests` proves individual rules with `node:test`.

## How to get to it (user POV)

- Run `node scripts/check-docs.mjs`.
- Run `bun run check:contract` (all three test files, then the check).

## Driving it with node

Preconditions:

- Baseline preconditions hold.

- **Current tree.** Run `node scripts/check-docs.mjs`. Expect exit 0 and `Documentation contract is current: 25 public pages, 3 key presets, 116 MCP tools.` (counts change with the contract).
- **Rule fires.** Break one rule in a scratch edit, for example change line 25 of `sdks/cli.mdx` from `npx -y @hue-run/sdk@<version> login --gitignore` to `npx hue login --gitignore`, and rerun. Expect exit 1 and one `- <rule message>` line per violation on stderr, here naming `sdks/cli.mdx`. Revert with `git checkout -- sdks/cli.mdx`.
- **One test.** Run `node --test --test-name-pattern="ampersand" scripts/check-docs.test.mjs`. Expect `ℹ tests 1`, `ℹ pass 1`, about 0.2 s. Match words from the test title in `check-docs.test.mjs`.
- **Whole file.** Run `node --test scripts/check-docs.test.mjs` only after changing shared helpers. Expect 49 tests in about 5.5 s.

## Gotchas

- `--test-name-pattern` is a regular expression over test titles; quote it.
- The check pins the navigated-page count. Adding a page means updating the count, the navigation and usually a test.
- Tests copy the repository into a temp fixture (`scripts/test-fixture.mjs`); a stray large file in the checkout slows every test.
