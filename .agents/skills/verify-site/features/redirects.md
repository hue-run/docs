# Redirects

A reader who follows an old link to a removed or renamed page lands on its replacement through a `docs.json` redirect.

## Sub-features

- `redirect-page` sends an old route to a new page.
- `redirect-anchor` sends an old route to a heading anchor on another page.

## How to get to it (user POV)

- Open an old URL, such as `http://localhost:3333/guides/invited-setup`.

## Driving it with curl and screenshot.mjs

Preconditions:

- The redirect is in `docs.json` `redirects`, and the preview was restarted after the edit.

- **Redirect target.** Run `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3333/<old-route>`. Expect `307 http://localhost:3333/<new-route>`; for example `/guides/invited-setup` gives `307 http://localhost:3333/guides/agent-setup`.
- **Target renders.** Run the Page render status check on the destination. Expect `200`.
- **Regression test.** Run `node --test --test-name-pattern="redirect" scripts/check-docs.test.mjs`. Every removed URL needs an assertion there.

## Gotchas

- The local preview answers `307`; production may answer `308`. Assert the destination, not the code.
- Mintlify cannot redirect a heading anchor. Renaming a heading that other repositories link to breaks those links; keep the heading.
- `mint broken-links` does not follow redirects, so a link to a removed page still fails even with a redirect.
