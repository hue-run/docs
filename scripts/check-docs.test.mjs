import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { root } from "./docs-contract.mjs";
import { copyDocsFixture } from "./test-fixture.mjs";

function checkSnapshot(change) {
  const directory = mkdtempSync(join(tmpdir(), "hue-docs-contract-"));
  try {
    copyDocsFixture(root, directory);
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

test("fixture copies exclude private source directories", () => {
  const directory = mkdtempSync(join(tmpdir(), "hue-docs-copy-"));
  try {
    const source = join(directory, "source");
    const destination = join(directory, "destination");
    for (const prefix of ["", "nested"]) {
      mkdirSync(join(source, prefix), { recursive: true });
      writeFileSync(join(source, prefix, "public.mdx"), "# Public page\n");
      for (const name of [".context", ".hue", ".conductor"]) {
        mkdirSync(join(source, prefix, name));
        writeFileSync(join(source, prefix, name, "private.json"), '{"private":true}\n');
      }
    }
    copyDocsFixture(source, destination);
    for (const prefix of ["", "nested"]) {
      assert.equal(readFileSync(join(destination, prefix, "public.mdx"), "utf8"), "# Public page\n");
      for (const name of [".context", ".hue", ".conductor"])
        assert.equal(existsSync(join(destination, prefix, name)), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("private workspace pages stay outside documentation navigation", () => {
  const result = checkSnapshot((directory) => {
    for (const name of [".context", ".hue", ".conductor"]) {
      assert.equal(existsSync(join(directory, name)), false);
      mkdirSync(join(directory, name));
      writeFileSync(join(directory, name, "private.mdx"), "# Private workspace page\n");
    }
  });
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, before, after] of [
  ["wire", "at or below 4 MiB on the wire", "at or below 2 MiB on the wire"],
  ["decompressed", "8 MiB after decompression", "1 MiB after decompression"],
  ["per-value", "An individual OTLP value can contain up to 1 MiB.", "An individual OTLP value can contain up to 256 KiB."],
  ["span index", "10,000 spans and", "2,000 spans and"],
  ["log index", "20,000 correlated logs per trace", "10,000 correlated logs per trace"],
]) {
  test(`the OTLP ${name} limit must match the pinned producer`, () => {
    const result = checkSnapshot((directory) => changePage(directory, "integrations/opentelemetry.mdx", (text) => text.replace(before, after)));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OTLP .*limit.*differ.*pinned platform contract/);
  });
}

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

test("a complete skill override validates its install commands against its source versions", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    const override = ensureOverride(directory, sources);
    const sdk = JSON.parse(readFileSync(resolve(directory, "contracts/sdk-docs.json"), "utf8"));
    override.source.packages ??= structuredClone(sdk.packages);
    override.source.packages.typescript.version = "0.1.0";
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /public install command uses stale package version .*; expected 0\.1\.0/);
});

test("a skill source version does not change the other pages' package contract", () => {
  const sdk = JSON.parse(readFileSync(resolve(root, "contracts/sdk-docs.json"), "utf8"));
  const result = checkSnapshot((directory) => changePage(directory, "quickstart.mdx", (text) =>
    text.replace(`@hue-run/sdk@${sdk.packages.typescript.version}`, "@hue-run/sdk@0.1.0"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /public install command uses stale package version 0\.1\.0; expected/);
});

test("a complete skill override cannot substitute another package", () => {
  const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
    const override = ensureOverride(directory, sources);
    const sdk = JSON.parse(readFileSync(resolve(directory, "contracts/sdk-docs.json"), "utf8"));
    override.source.packages ??= structuredClone(sdk.packages);
    override.source.packages.typescript.name = "unrelated-package";
  }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skill override must name the typescript SDK package and its source version/);
});

for (const language of ["typescript", "python"]) {
  test(`a missing ${language} skill package reports a contract error without crashing`, () => {
    const result = checkSnapshot((directory) => changeSources(directory, (sources) => {
      const override = ensureOverride(directory, sources);
      const sdk = JSON.parse(readFileSync(resolve(directory, "contracts/sdk-docs.json"), "utf8"));
      override.source.packages ??= structuredClone(sdk.packages);
      delete override.source.packages[language];
    }));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`skill override must name the ${language} SDK package and its source version`));
    assert.doesNotMatch(result.stderr, /TypeError/);
  });
}

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
    text
      .replaceAll("codex mcp add hue --url 'https://mcp.hue.run/mcp?toolsets=all'\n", "")
      .replaceAll("`codex mcp add hue --url 'https://mcp.hue.run/mcp?toolsets=all'`", ""),
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
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    `${text}\nHue does not offer an OAuth authorization flow in this release.\n`,
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retired text: does not offer an OAuth authorization flow/);
});

for (const [name, page, phrase] of [
  ["the retired decompression limit", "integrations/opentelemetry.mdx", "The request limit is 1 MiB on the wire and after decompression."],
  ["the retired span cap", "integrations/opentelemetry.mdx", "A trace can contain at most 2,000 distinct spans."],
  ["the retired quickstart Collector claim", "quickstart.mdx", "The same programs run against any OTLP receiver when you set `baseUrl` to a loopback origin."],
]) {
  test(`${name} cannot return`, () => {
    const result = checkSnapshot((directory) => changePage(directory, page, (text) => `${text}\n${phrase}\n`));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /retired text: /);
  });
}

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

test("a public page cannot link the deleted invited-setup page", () => {
  const result = checkSnapshot((directory) => changePage(directory, "quickstart.mdx", (text) =>
    text.replace("(/guides/agent-setup)", "(/guides/invited-setup)"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /quickstart\.mdx links the removed invited-setup page/);
});

test("the invited-setup URL must redirect to agent setup", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "docs.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    const redirect = config.redirects.find((entry) => entry.source === "/guides/invited-setup");
    assert.ok(redirect);
    redirect.destination = "/quickstart";
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /docs\.json must redirect \/guides\/invited-setup to \/guides\/agent-setup/);
});

test("the production-safety URL must redirect to TypeScript production setup", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "docs.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    const redirect = config.redirects.find((entry) => entry.source === "/guides/production-safety");
    assert.ok(redirect);
    redirect.destination = "/quickstart";
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /docs\.json must redirect \/guides\/production-safety to \/sdks\/typescript#production-setup/,
  );
});

test("every skill link names the current skill version, in any link form", () => {
  const sources = JSON.parse(readFileSync(resolve(root, "contracts/sources.json"), "utf8"));
  const sdk = JSON.parse(readFileSync(resolve(root, "contracts/sdk-docs.json"), "utf8"));
  const version = (sources.skillOverride?.source?.skill ?? sdk.skill).metadata.version;
  const skillLink = readFileSync(resolve(root, "agents/overview.mdx"), "utf8")
    .match(/https:\/\/docs\.hue\.run\/skill\.md\?[^\s)]+/)[0];
  assert.equal(new URL(skillLink).searchParams.get("v"), version);
  const relative = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (text) =>
    text.replace(skillLink, "/skill.md"),
  ));
  assert.notEqual(relative.status, 0);
  assert.match(relative.stderr, /agents\/overview\.mdx links \/skill\.md/);
  const stale = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (text) =>
    text.replace(skillLink, "https://docs.hue.run/skill.md?v=0.1.0"),
  ));
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /links https:\/\/docs\.hue\.run\/skill\.md\?v=0\.1\.0/);
  const fragment = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (text) =>
    text.replace(skillLink, "https://docs.hue.run/skill.md#handoff"),
  ));
  assert.notEqual(fragment.status, 0);
  assert.match(fragment.stderr, /links https:\/\/docs\.hue\.run\/skill\.md#handoff/);
  const autolink = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (text) =>
    text.replace(`[Hue skill](${skillLink})`, `Hue skill: <https://docs.hue.run/skill.md?v=${version}#handoff>`),
  ));
  assert.equal(autolink.status, 0, autolink.stderr);
  const elsewhere = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (text) =>
    text.replace(`[Hue skill](${skillLink})`, `[Hue skill](${skillLink}) and [another skill](https://example.com/skill.md)`),
  ));
  assert.equal(elsewhere.status, 0, elsewhere.stderr);
});

test("a skill link cannot contain an ampersand", () => {
  const text = readFileSync(resolve(root, "agents/overview.mdx"), "utf8");
  const skillLink = text.match(/https:\/\/docs\.hue\.run\/skill\.md\?v=[^\s)]+/)[0];
  const result = checkSnapshot((directory) => changePage(directory, "agents/overview.mdx", (source) =>
    source.replace(skillLink, `${skillLink}&release=ee02dc4`),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skill links must not contain an ampersand/);
});

test("the agent setup page keeps the account contact line", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replaceAll("founders@hue.run", "team@example.test"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx must contain founders@hue\.run/);
});

test("the agent setup page keeps the other MCP client option", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replace("**Other MCP client**", "**Choose a listed client**"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx must contain If you ask the user to choose a client/);
});

test("the agent setup page must offer the other MCP client option, not only name it", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replace(
      "If you ask the user to choose a client, always include **Other MCP client**.",
      "**Other MCP client** uses the generic connection settings.",
    ),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /guides\/agent-setup\.mdx must contain If you ask the user to choose a client/);
});

test("the agent setup page cannot be hidden again", () => {
  const result = checkSnapshot((directory) => changePage(directory, "guides/agent-setup.mdx", (text) =>
    text.replace('title: "Agent setup"\n', 'title: "Agent setup"\nhidden: true\n'),
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

test("punctuation in the default listing sentence does not cut its list short", () => {
  const result = checkSnapshot((directory) => changePage(directory, "agents/mcp-server.mdx", (text) =>
    text.replace(
      "lists the `observe` toolset, the production reads: `list_projects`",
      "lists the `observe` toolset, the production reads (e.g. traces and spans): `list_projects`",
    ),
  ));
  assert.equal(result.status, 0, result.stderr);
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


test("released SDK versions can advance independently of platform compatibility pins", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "contracts/fern-public-docs.json");
    const platform = JSON.parse(readFileSync(path, "utf8"));
    platform.packages.typescript.version = "0.1.0";
    platform.packages.python.version = "0.1.0";
    writeFileSync(path, `${JSON.stringify(platform, null, 2)}\n`);
    changeSources(directory, (sources) => {
      sources.sources.platform.sha256 = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
    });
    const generated = spawnSync(process.execPath, ["scripts/generate-docs-contract.mjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
  });
  assert.equal(result.status, 0, result.stderr);
});

test("different platform and SDK package names are rejected", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "contracts/fern-public-docs.json");
    const platform = JSON.parse(readFileSync(path, "utf8"));
    platform.packages.typescript.name = "unrelated-package";
    writeFileSync(path, `${JSON.stringify(platform, null, 2)}\n`);
    changeSources(directory, (sources) => {
      sources.sources.platform.sha256 = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
    });
    const generated = spawnSync(process.execPath, ["scripts/generate-docs-contract.mjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /platform and SDK typescript package names disagree/);
});


test("platform compatibility pins must remain stable versions", () => {
  const result = checkSnapshot((directory) => {
    const path = resolve(directory, "contracts/fern-public-docs.json");
    const platform = JSON.parse(readFileSync(path, "utf8"));
    platform.packages.python.version = "latest";
    writeFileSync(path, `${JSON.stringify(platform, null, 2)}\n`);
    changeSources(directory, (sources) => {
      sources.sources.platform.sha256 = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
    });
    const generated = spawnSync(process.execPath, ["scripts/generate-docs-contract.mjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /platform python compatibility pin must be a stable version/);
});
