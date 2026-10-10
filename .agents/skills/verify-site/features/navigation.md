# Navigation

The sidebar lists every public page under its group from `docs.json` (Get started, Tracing, Evaluations, Agents, Reference), and choosing an entry opens that page.

## Sub-features

- `nav-entry` shows a new or moved page under the intended group.
- `nav-removed` drops a removed page from the sidebar.
- `nav-active` highlights the current page in the sidebar.

## How to get to it (user POV)

- Open any page and read the left sidebar.

## Driving it with curl and screenshot.mjs

Preconditions:

- `docs.json` is saved and the preview was restarted after the edit.

- **Entry listed.** Run `curl -s http://localhost:3333/quickstart | grep -o 'href="/<route>"' | head -1`. Expect `href="/<route>"`.
- **Entry removed.** Run the same grep for a removed route. Expect no output.
- **Placement.** Run `node .agents/skills/verify-site/screenshot.mjs http://localhost:3333/<route> /tmp/hue-docs-verify/site/nav.png`. The screenshot shows the entry under its group and highlighted.
- **Contract.** Run `node scripts/check-docs.mjs` (about 0.1 s). It fails if a page is missing from or duplicated in `docs.json`, or the page count changed without updating the check.

## Gotchas

- The preview does not reload `docs.json`; restart it (Cleanup, then Launch).
- `check-docs.mjs` pins the number of navigated pages. Adding or removing a page also needs that count and the redirects updated.
