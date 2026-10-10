# Page render

A reader opens a docs page and sees its title, description, headings, code blocks and Mintlify components (`<Tabs>`, `<Note>`, `<Tip>`) rendered without MDX errors.

## Sub-features

- `page-status` serves the route with HTTP 200 and the page title.
- `page-heading` shows the frontmatter `title` as the page `h1`.
- `page-components` renders tabs, callouts and code blocks visibly.

## How to get to it (user POV)

- Open `http://localhost:3333/<route>` in a browser.
- Choose the page in the sidebar.

## Driving it with curl and screenshot.mjs

Preconditions:

- Doctor passes and the page's `.mdx` file is saved.

- **Status and title.** Run `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/<route>` and `curl -s http://localhost:3333/<route> | grep -o "<title>[^<]*</title>"`. Expect `200` and `<title><frontmatter title> - Hue</title>`.
- **Changed text present.** Run `curl -s http://localhost:3333/<route> | grep -c "<a phrase you added>"`. Expect a count of 1 or more.
- **Visible change.** Run `node .agents/skills/verify-site/screenshot.mjs http://localhost:3333/<route> "$SITE"/<slug>.png` (add `--full` for content below the first 1600 px). Expect `200 … | h1: <title>`, and the PNG shows the change.

## Gotchas

- An MDX syntax error still returns a page; read `dev.log` and the screenshot, not only the status.
- `curl` sees server-rendered HTML; content inside a non-default tab is present in the HTML but hidden in a screenshot until the tab is chosen.
- `/skill.md`, `/llms.txt` and `.md` page exports return 404 in the local preview; they exist only on the deployed site. Prove `skill.md` changes with the `verify-contract` skill instead.
