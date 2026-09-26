import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { readJson, root, sha256 } from "./docs-contract.mjs";
import { pinnedSources, productionCommit } from "./sync-platform-contract.mjs";

const commit = "7f3cce7fbcda160e39bcac6c0b72b0f2aa82d163";
const later = "b".repeat(40);

test("production health yields the served commit", () => {
  assert.equal(productionCommit({ status: "ok", commit, environment: "production", branchRef: "x" }), commit);
});

test("a staging, unhealthy or abbreviated health response is refused", () => {
  assert.throws(() => productionCommit({ status: "ok", commit, environment: "staging" }), /not "production"/);
  assert.throws(() => productionCommit({ status: "degraded", commit, environment: "production" }), /not "ok"/);
  assert.throws(() => productionCommit({ status: "ok", commit: "7f3cce7", environment: "production" }), /full commit/);
  assert.throws(() => productionCommit(null), /not a JSON object/);
});

test("pinning records the commit and the snapshot's exact digest, keeping other sources", () => {
  const sources = readJson("contracts/sources.json");
  const text = JSON.stringify({ schemaVersion: 1, repository: sources.sources.platform.repository });
  const next = pinnedSources(sources, "a".repeat(40), text);
  assert.equal(next.sources.platform.commit, "a".repeat(40));
  assert.equal(next.sources.platform.sha256, sha256(text));
  assert.deepEqual(next.sources.sdk, sources.sources.sdk);
  assert.deepEqual(next.skillOverride, sources.skillOverride);
});

test("pinning refuses another repository's contract or an abbreviated commit", () => {
  const sources = readJson("contracts/sources.json");
  const own = JSON.stringify({ schemaVersion: 1, repository: sources.sources.platform.repository });
  assert.throws(() => pinnedSources(sources, "abc1234", own), /full 40-character SHA/);
  assert.throws(
    () => pinnedSources(sources, "a".repeat(40), JSON.stringify({ schemaVersion: 1, repository: "hue-run/other" })),
    /not hue-run\/fern/,
  );
});

/** Runs the command against a copy of the repository, with production and the contract injected. */
async function inCopy(callback) {
  const directory = mkdtempSync(join(tmpdir(), "hue-docs-platform-"));
  try {
    cpSync(root, directory, {
      recursive: true,
      filter: (path) => ![".git", "node_modules", ".mintlify"].includes(basename(path)),
    });
    const module = await import(pathToFileURL(join(directory, "scripts/sync-platform-contract.mjs")).href);
    const files = () =>
      Object.fromEntries(
        ["contracts/fern-public-docs.json", "contracts/sources.json", "docs-contract.json"].map((path) => [
          path,
          readFileSync(resolve(directory, path), "utf8"),
        ]),
      );
    const messages = [];
    const run = (argv, options) =>
      module.run(argv, { log: (line) => messages.push(line), error: (line) => messages.push(line), ...options });
    await callback({ run, files, messages });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const current = readFileSync(resolve(root, "contracts/fern-public-docs.json"), "utf8");
// A later contract: the current one with one more field, so its digest differs.
const laterContract = `${JSON.stringify({ ...JSON.parse(current), laterField: true }, null, 2)}\n`;

test("a sync pins the served commit, its contract and a regenerated docs contract", async () => {
  await inCopy(async ({ run, files }) => {
    const read = [];
    const code = await run([], {
      served: async () => later,
      contractAt: (repository, sha) => (read.push([repository, sha]), laterContract),
    });
    assert.equal(code, 0);
    assert.deepEqual(read, [["hue-run/fern", later]]);
    const after = files();
    assert.equal(after["contracts/fern-public-docs.json"], laterContract);
    const pin = JSON.parse(after["contracts/sources.json"]).sources.platform;
    assert.equal(pin.commit, later);
    assert.equal(pin.sha256, sha256(laterContract));
    assert.equal(JSON.parse(after["docs-contract.json"]).sources.platform.commit, later);
  });
});

test("a named commit production does not serve is refused unless --undeployed", async () => {
  await inCopy(async ({ run, files, messages }) => {
    const before = files();
    const options = { served: async () => commit, contractAt: () => laterContract };
    assert.equal(await run(["--commit", later], options), 1);
    assert.match(messages.at(-1), /Production serves 7f3cce7.*--undeployed/);
    assert.deepEqual(files(), before);
    assert.equal(await run(["--commit", later, "--undeployed"], options), 0);
    assert.match(messages.at(-1), /does not serve yet/);
    assert.equal(JSON.parse(files()["contracts/sources.json"]).sources.platform.commit, later);
  });
});

test("--check reports drift from production and takes no named commit", async () => {
  await inCopy(async ({ run, messages }) => {
    assert.equal(await run(["--check"], { served: async () => commit }), 0);
    assert.equal(await run(["--check"], { served: async () => later }), 1);
    assert.match(messages.at(-1), /but production serves b{40}/);
    assert.equal(await run(["--check", "--commit", commit], { served: async () => commit }), 2);
    assert.equal(await run(["--undeployed"], { served: async () => commit }), 2);
  });
});

test("a contract that cannot be rendered leaves every file unchanged", async () => {
  await inCopy(async ({ run, files, messages }) => {
    const before = files();
    const broken = JSON.stringify({ schemaVersion: 1, repository: "hue-run/fern" });
    assert.equal(await run([], { served: async () => later, contractAt: () => broken }), 1);
    assert.match(messages.at(-1), /^Nothing changed:/);
    assert.deepEqual(files(), before);
  });
});
