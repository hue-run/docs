# Links and anchors

`mint broken-links --check-anchors` resolves every internal link and `#anchor` on the site, so a renamed heading or moved page cannot leave dead links behind.

## Sub-features

- `links-pages` finds links to pages that do not exist.
- `links-anchors` finds links to headings that do not exist.

## How to get to it (user POV)

- Run `npx mint broken-links --check-anchors`.

## Driving it with the mint CLI

Preconditions:

- Baseline preconditions hold.

- **Pass.** Run `npx mint broken-links --check-anchors`. Expect exit 0 and `success no broken links found`, about 2.5 s.
- **Fail.** Point a link at a missing anchor in a scratch edit, for example `[keys](/quickstart#no-such-heading)`, and rerun. Expect exit 1, `found 1 broken links in 1 files`, then the file name and `⎿  /quickstart#no-such-heading`. Restore the copy you saved first (see Cleanup in [`../SKILL.md`](../SKILL.md)).

## Gotchas

- It does not follow `docs.json` redirects; a link to a removed page fails even with a redirect. Link the destination page instead.
- It checks only internal links. External URLs and anchors on other sites are not checked.
- Headings that other repositories link to (`docs.hue.run/...#anchor`) are not seen here; grep those repositories before renaming a heading.
