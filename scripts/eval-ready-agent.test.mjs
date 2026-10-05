import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { root } from "./docs-contract.mjs";

const page = readFileSync(join(root, "evaluations/eval-ready-agent.mdx"), "utf8");
function snippet(title) {
  const marker = 'title="' + title + '"';
  const titleStart = page.indexOf(marker);
  assert.notEqual(titleStart, -1, "missing helper " + title);
  const start = page.indexOf("\n", titleStart) + 1;
  const end = page.indexOf("```", start);
  assert.notEqual(end, -1, "missing end of helper " + title);
  return page.slice(start, end);
}

// Execute the published TypeScript directly under Node's type stripping. Assertions stay
// separate from the snippet, so changing the documentation changes the implementation tested.
async function verifyTypescript() {
  const { default: assert } = await import("node:assert/strict");
  const { existsSync, readFileSync, statSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { inHueEval, appInWorld, appEndpoint, mcpServersFile } = await import(pathToFileURL(process.argv[1]).href);
  const mirror = "HUE_SIM_GOOGLE_GMAIL_MCP_URL";
  const plain = { HUE_EXECUTION_ID: "synthetic-execution" };
  const world = { ...plain, HUE_WORLD_TOKEN: "synthetic-world-token", [mirror]: "https://mirror.invalid/mcp" };
  let productionReads = 0;
  const production = () => {
    productionReads++;
    return { url: "https://app.invalid/mcp", token: "synthetic-production-token" };
  };

  assert.equal(inHueEval({}), false);
  assert.equal(inHueEval(plain), true);
  assert.equal(inHueEval({ HUE_WORLD_TOKEN: world.HUE_WORLD_TOKEN }), true);
  assert.equal(appInWorld(mirror, {}), true);
  assert.equal(appInWorld(mirror, plain), false);
  assert.equal(appInWorld(mirror, { ...plain, [mirror]: world[mirror] }), false);
  assert.equal(appInWorld(mirror, world), true);
  assert.equal(appInWorld("HUE_SIM_SLACK_MCP_URL", world), false);
  assert.deepEqual(appEndpoint(mirror, production, {}), { url: "https://app.invalid/mcp", token: "synthetic-production-token" });
  assert.equal(productionReads, 1);
  productionReads = 0;
  for (const env of [plain, { ...plain, [mirror]: world[mirror] }]) {
    assert.throws(() => appEndpoint(mirror, production, env), /no world handoff/);
  }
  assert.throws(() => appEndpoint("HUE_SIM_SLACK_MCP_URL", production, world), /is not set/);
  assert.deepEqual(appEndpoint(mirror, production, world), { url: world[mirror], token: world.HUE_WORLD_TOKEN });
  assert.equal(productionReads, 0, "evaluation must not read production credentials");

  const missingConfig = join(process.argv[2], "missing.json");
  assert.equal(mcpServersFile(missingConfig, {}, {}).path, missingConfig);
  assert.throws(() => mcpServersFile(missingConfig, {}, plain), /no world handoff/);
  const config = join(process.argv[2], "mcp.json");
  const original = JSON.stringify({ mcpServers: { gmail: { type: "http", url: "https://app.invalid/mcp", headers: { Authorization: "Bearer synthetic-production-token" } } } });
  writeFileSync(config, original);
  const copied = mcpServersFile(config, { gmail: mirror }, world);
  assert.deepEqual(JSON.parse(readFileSync(copied.path, "utf8")), { mcpServers: { gmail: { type: "http", url: world[mirror], headers: { Authorization: "Bearer " + world.HUE_WORLD_TOKEN } } } });
  assert.equal(statSync(copied.path).mode & 0o777, 0o600);
  assert.equal(readFileSync(config, "utf8"), original);
  copied.dispose();
  assert.equal(existsSync(copied.path), false);
  assert.throws(() => mcpServersFile(config, {}, world), /has no mirror variable/);
  assert.throws(() => mcpServersFile(config, { gmail: "HUE_SIM_SLACK_MCP_URL" }, world), /is not set/);
  writeFileSync(config, JSON.stringify({ mcpServers: { gmail: { command: "unused" } } }));
  assert.throws(() => mcpServersFile(config, { gmail: mirror }, world), /stdio server/);
  writeFileSync(config, JSON.stringify({ mcpServers: { gmail: { serverUrl: "https://app.invalid/mcp" } } }));
  assert.throws(() => mcpServersFile(config, { gmail: mirror }, world), /rewrite that field/);
}

test("copied TypeScript helper admits plain evals and protects app connections", () => {
  const directory = mkdtempSync(join(tmpdir(), "hue-docs-ts-helper-"));
  try {
    const source = join(directory, "hue-eval.ts");
    writeFileSync(source, snippet("hue-eval.ts"));
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", "(" + verifyTypescript.toString() + ")()", source, directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || String(result.error));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const pythonChecks = String.raw`
import json
import os
import stat
import sys
import tempfile

namespace = {}
exec(json.loads(sys.stdin.read()), namespace)
in_eval = namespace["in_hue_eval"]
app_in_world = namespace["app_in_world"]
endpoint = namespace["app_endpoint"]
mcp_file = namespace["mcp_servers_file"]
mirror = "HUE_SIM_GOOGLE_GMAIL_MCP_URL"
plain = {"HUE_EXECUTION_ID": "synthetic-execution"}
world = {**plain, "HUE_WORLD_TOKEN": "synthetic-world-token", mirror: "https://mirror.invalid/mcp"}
production_reads = 0

def production():
    global production_reads
    production_reads += 1
    return "https://app.invalid/mcp", "synthetic-production-token"

def refuses(action, message):
    try:
        action()
    except RuntimeError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError("connection was not refused")

assert not in_eval({})
assert in_eval(plain)
assert in_eval({"HUE_WORLD_TOKEN": world["HUE_WORLD_TOKEN"]})
assert app_in_world(mirror, {})
assert not app_in_world(mirror, plain)
assert not app_in_world(mirror, {**plain, mirror: world[mirror]})
assert app_in_world(mirror, world)
assert not app_in_world("HUE_SIM_SLACK_MCP_URL", world)
assert endpoint(mirror, production, {}) == ("https://app.invalid/mcp", "synthetic-production-token")
assert production_reads == 1
production_reads = 0
for env in (plain, {**plain, mirror: world[mirror]}):
    refuses(lambda: endpoint(mirror, production, env), "no world handoff")
refuses(lambda: endpoint("HUE_SIM_SLACK_MCP_URL", production, world), "is not set")
assert endpoint(mirror, production, world) == (world[mirror], world["HUE_WORLD_TOKEN"])
assert production_reads == 0, "evaluation must not read production credentials"

with tempfile.TemporaryDirectory(prefix="hue-docs-python-helper-") as directory:
    missing = os.path.join(directory, "missing.json")
    with mcp_file(missing, {}, {}) as path:
        assert path == missing
    refuses(lambda: mcp_file(missing, {}, plain).__enter__(), "no world handoff")
    config = os.path.join(directory, "mcp.json")
    original = json.dumps({"mcpServers": {"gmail": {"type": "http", "url": "https://app.invalid/mcp", "headers": {"Authorization": "Bearer synthetic-production-token"}}}})
    with open(config, "w", encoding="utf-8") as file:
        file.write(original)
    with mcp_file(config, {"gmail": mirror}, world) as path:
        with open(path, encoding="utf-8") as file:
            assert json.load(file) == {"mcpServers": {"gmail": {"type": "http", "url": world[mirror], "headers": {"Authorization": "Bearer " + world["HUE_WORLD_TOKEN"]}}}}
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
        with open(config, encoding="utf-8") as file:
            assert file.read() == original
    assert not os.path.exists(path)
    refuses(lambda: mcp_file(config, {}, world).__enter__(), "has no mirror variable")
    refuses(lambda: mcp_file(config, {"gmail": "HUE_SIM_SLACK_MCP_URL"}, world).__enter__(), "is not set")
    with open(config, "w", encoding="utf-8") as file:
        json.dump({"mcpServers": {"gmail": {"command": "unused"}}}, file)
    refuses(lambda: mcp_file(config, {"gmail": mirror}, world).__enter__(), "stdio server")
    with open(config, "w", encoding="utf-8") as file:
        json.dump({"mcpServers": {"gmail": {"serverUrl": "https://app.invalid/mcp"}}}, file)
    refuses(lambda: mcp_file(config, {"gmail": mirror}, world).__enter__(), "rewrite that field")
`;

test("copied Python helper admits plain evals and protects app connections", () => {
  const result = spawnSync("python3", ["-c", pythonChecks], { input: JSON.stringify(snippet("hue_eval.py")), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
