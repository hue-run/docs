# docs.hue.run site verification map

The maintained source for proving what a reader sees in the local Mintlify preview. Read this index, then use the matching feature file.

## Baseline preconditions

- `bun install --frozen-lockfile` has run, so `node_modules/.bin/mint` and puppeteer's headless Chrome exist.
- The preview runs at `http://localhost:3333`, started by this run (see [`../SKILL.md`](../SKILL.md) Launch) and healthy per Doctor.
- No Hue account, key or network service is needed; the preview serves the working tree.

## Driving conventions

- Drive pages by route: the file path without `.mdx` (`guides/agent-setup.mdx` → `/guides/agent-setup`; `index.mdx` → `/`).
- The preview hot-reloads MDX edits; restart it after editing `docs.json`.
- Run the one recipe that matches your change; leave full-site checks to CI.

## Proof and skip reporting

- Text first: HTTP status, final URL and `<title>` or `h1` from `curl` or `screenshot.mjs`.
- One screenshot only for a visible change. Never a recording.
- Report a route you could not reach with the command and the status you got.

## Feature entry contract

Each feature file has an H1, one paragraph, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with curl and screenshot.mjs`, `Gotchas`.

## Features

- [Page render](./page-render.md) covers a changed page loading with its title, headings and components.
- [Navigation](./navigation.md) covers the sidebar groups from `docs.json` and adding, moving or removing a page.
- [Redirects](./redirects.md) covers `docs.json` redirects for removed or renamed URLs.
