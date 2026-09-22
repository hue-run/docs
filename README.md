# Hue documentation

This repository publishes the customer documentation at [docs.hue.run](https://docs.hue.run). It mirrors released SDK contracts from [`hue-run/hue-sdk`](https://github.com/hue-run/hue-sdk) and customer-safe platform behavior from the private Hue application repository.

## Local checks

Use Bun 1.3.9 and Node.js 24:

```sh
bun install --frozen-lockfile
bun run check
```

`bun run check` validates the Mintlify build, links and anchors, accessibility, navigation, product terminology, endpoints, SDK versions, and the checked-in producer contracts. Run `bun run dev` for a local preview. Mintlify's media accessibility check runs with its cross-theme contrast heuristic disabled; the deterministic contract check instead enforces WCAG AA contrast against each theme's actual background.

The Mintlify CLI is an exact development dependency. Update it deliberately and commit the resulting `bun.lock`; do not use `mint update` in CI.

## Sources of truth

- `contracts/sdk-docs.json` and `contracts/fern-public-docs.json` snapshot the generated SDK and platform documentation contracts. `contracts/sources.json` records each producer revision and snapshot digest.
- `sdks/compatibility.mdx` mirrors the SDK compatibility contract with site-relative links.
- `skill.md` mirrors the SDK-owned Hue skill with Mintlify frontmatter adaptations only. The one exception is `skillOverride` in `contracts/sources.json`: the pinned snapshot's skill with exactly one section replaced by that section from a later hue-sdk commit, recorded by base digest, section commit and digest, and resulting skill digest. It currently carries the **Invite-only access** section from hue-sdk `95c41fa` (#73) onto the released `b537a0f` skill, because hue-sdk `main` also contains unreleased skill sections. The check rejects the override once the SDK snapshot moves; drop it when refreshing the snapshot to a release that contains the section.
- The Hue platform repository owns service-key presets, MCP endpoints, and release-state boundaries; `contracts/fern-public-docs.json` is its customer-safe projection.

Update source repositories first. Then refresh their snapshots here, reconcile every affected page, and run the checks above. Dated evidence and historical release records remain historical; do not rewrite them as current product behavior.

## Public boundaries

Document only released customer behavior. Never publish secrets, private infrastructure identifiers, internal runbooks, customer data, or unreleased provider capabilities. Clearly distinguish the project-data MCP server at `https://mcp.hue.run/mcp` from the documentation-only MCP endpoint at `https://docs.hue.run/mcp`.

Changes merged to the default branch are deployed by the configured Mintlify integration. Confirm the ordinary, unversioned deployed pages after release; a cache-busted response alone is not acceptance evidence.
