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

/** The repository's skill override, or one that mirrors the SDK snapshot's own skill. */
function ensureOverride(directory, sources) {
  if (sources.skillOverride) return sources.skillOverride;
  const sdk = JSON.parse(readFileSync(resolve(directory, "contracts/sdk-docs.json"), "utf8"));
  const { commit, repository } = sources.sources.sdk;
  sources.skillOverride = {
    base: { commit, source: sdk.skill.source, sha256: sdk.skill.sha256 },
    source: { repository, commit, skill: sdk.skill },
    sha256: sdk.skill.sha256,
  };
  return sources.skillOverride;
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
  assert.match(result.stderr, /differs from the (later )?SDK-owned skill source/);
});

test("a skill override does not survive a changed package snapshot", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    ensureOverride(directory, sources).base.commit = "0".repeat(40);
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be the pinned SDK snapshot commit/);
});

test("a complete skill override must come from the SDK repository", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    ensureOverride(directory, sources).source.repository = "https://example.test/unrelated";
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
  // The key command starts with the sign-in command, so it alone does not satisfy the check.
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replaceAll("codex mcp add hue --url 'https://mcp.hue.run/mcp?toolsets=all'\n", ""),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the generated oauthCodexCli snippet/);
});

test("the MCP guide must keep the Codex sign-in TOML", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace('http_headers = { "X-Hue-MCP-Toolsets" = "all" }', 'url = "https://mcp.hue.run/mcp?toolsets=all"'),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the generated oauthCodexToml snippet/);
});

test("a tool count that disagrees with the contract fails", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace(/\b\d+ tools\b/, "0 tools"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP guide names 0 tools/);
});

test("a tool count stated for write access must be that listing's count", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace(/\b\d+ tools with write access\b/, "19 tools with write access"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP guide names 19 tools for the default listing with write access; the contract has \d+/);
});

test("the default tool counts stay attached to their access context", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace("18 tools with write access", "17 tools with write access"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must report the default listing as/);
});

test("the MCP guide must name every catalog tool", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replaceAll("execute_hue_write_tool", "the write executor"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP guide is missing catalog tool execute_hue_write_tool/);
});

test("the MCP guide must keep each tool in its generated group", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace(
      "| `eval_sets` | `list_eval_sets`, `get_eval_set`, `list_evaluators`",
      "| `eval_sets` | `get_run`, `get_eval_set`, `list_evaluators`",
    ),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not list the generated eval_sets toolset/);
});

test("retired MCP field names cannot return", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    `${text}\nPass the eval set as dataset_id.\n`,
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP documentation contains retired field name: dataset_id/);
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
    text.replace(/npx --yes --package @hue-run\/sdk@\d+\.\d+\.\d+ hue login --gitignore/, "npx hue login --gitignore"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sdks\/cli\.mdx runs the hue CLI without naming @hue-run\/sdk: npx hue login --gitignore/);
});

test("the retired access-gate copy cannot return", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    `${text}\nWe're currently seeing heightened demand so we've turned Hue to invite-only.\n`,
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx contains retired access-gate text: heightened demand/);
});

test("only the moved stub may link the invited-setup page", () => {
  const result = checkSnapshot((directory) => changePage(directory, "quickstart.mdx", (text) =>
    text.replace("(/guides/agent-setup)", "(/guides/invited-setup)"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /quickstart\.mdx links the moved invited-setup page/);
});

test("the agent setup page keeps the account contact line", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replaceAll("founders@hue.run", "team@example.test"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx must contain founders@hue\.run/);
});

test("the agent setup page cannot be hidden again", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replace('sidebarTitle: "Agent setup"\n', 'sidebarTitle: "Agent setup"\nhidden: true\n'),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx must stay visible in navigation/);
});

function changeContract(directory, change) {
  const path = resolve(directory, "contracts/fern-public-docs.json");
  const contract = JSON.parse(readFileSync(path, "utf8"));
  change(contract);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
}

test("a profile the MCP guide does not list fails", () => {
  const result = checkSnapshot((directory) => changeContract(directory, (contract) => {
    contract.mcp.toolsets.profiles.triage = ["list_projects", "search_traces"];
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not list the generated triage profile/);
});

test("the default listing sentence must name every default tool", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace("`get_request_answer`, `search_hue_docs` and `load_hue_guide`. Beside them", "`search_hue_docs` and `load_hue_guide`. Beside them"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must name exactly the default observe profile's tools/);
});

test("the tool reference must list every tool", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-tools.mdx", (text) =>
    text.replace(/^\| `get_case_divergence` \|.*\n/m, ""),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MCP tool reference is missing get_case_divergence/);
});

test("the tool reference access must match the contract", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-tools.mdx", (text) =>
    text.replace("| `delete_eval_set_case` | Destructive |", "| `delete_eval_set_case` | Write |"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /gives delete_eval_set_case Write access; the contract makes it Destructive/);
});

test("the tool reference keeps each tool under its toolset", () => {
  const result = checkSnapshot((directory) => changeContract(directory, (contract) => {
    contract.mcp.tools.find(({ name }) => name === "get_request_answer").toolset = "traces";
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lists get_request_answer under intents; the contract puts it in traces/);
});
