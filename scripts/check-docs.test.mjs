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
