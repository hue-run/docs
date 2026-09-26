import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { root } from "./docs-contract.mjs";

function checkSnapshot(change) {
  const directory = mkdtempSync(join(tmpdir(), "hue-docs-contract-"));
  try {
    cpSync(root, directory, {
      recursive: true,
      filter: (path) => ![".git", "node_modules", ".mintlify"].includes(basename(path)),
    });
    change?.(directory);
    return spawnSync(process.execPath, ["scripts/check-docs.mjs"], {
      cwd: directory,
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function changeSources(directory, change) {
  const path = resolve(directory, "contracts/sources.json");
  const sources = JSON.parse(readFileSync(path, "utf8"));
  change(sources);
  writeFileSync(path, `${JSON.stringify(sources, null, 2)}\n`);
}

function changePage(directory, page, change) {
  const path = resolve(directory, page);
  const before = readFileSync(path, "utf8");
  const after = change(before);
  assert.notEqual(after, before, `${page} was not changed`);
  writeFileSync(path, after);
}

test("the exact later skill can coexist with the released package snapshot", () => {
  const result = checkSnapshot();
  assert.equal(result.status, 0, result.stderr);
});

test("a modified skill body cannot reuse the producer digest", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "skill.md");
    writeFileSync(path, `${readFileSync(path, "utf8")}\nUnrecorded skill change.\n`);
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from the later SDK-owned skill source/);
});

test("a skill override does not survive a changed package snapshot", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    sources.skillOverride.base.commit = "0".repeat(40);
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be the pinned SDK snapshot commit/);
});

test("a complete skill override must come from the SDK repository", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    sources.skillOverride.source.repository = "https://example.test/unrelated";
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must identify a full hue-sdk commit/);
});

test("a double-quoted key reference in an mcp add command fails", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace("--header 'Authorization: Bearer ${HUE_MCP_KEY}'", '--header "Authorization: Bearer ${HUE_MCP_KEY}"'),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /double-quotes a key reference in an mcp add command/);
  assert.match(result.stderr, /does not match the generated claudeCodeCli snippet/);
});

test("the MCP guide must keep the sign-in snippets", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace("codex mcp login hue\n", ""),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the generated oauthCodexCli snippet/);
});

test("a tool count that disagrees with the contract fails", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace("lists 87 tools", "lists 71 tools"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP guide names 71 tools/);
});

test("the retired key-only MCP statement cannot return", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/invited-setup.mdx", (text) =>
    `${text}\nHue does not offer an OAuth authorization flow in this release.\n`,
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retired text: does not offer an OAuth authorization flow/);
});

test("a bare npx hue command in a code block fails", () => {
  const result = checkSnapshot((directory) => changePage(directory, "sdks/cli.mdx", (text) =>
    text.replace("npx --yes --package @hue-run/sdk@0.10.0 hue login --gitignore", "npx hue login --gitignore"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sdks\/cli\.mdx runs the hue CLI without naming @hue-run\/sdk: npx hue login --gitignore/);
});
