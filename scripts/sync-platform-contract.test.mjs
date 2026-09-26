import assert from "node:assert/strict";
import test from "node:test";
import { readJson, sha256 } from "./docs-contract.mjs";
import { pinnedSources, productionCommit } from "./sync-platform-contract.mjs";

const commit = "7f3cce7fbcda160e39bcac6c0b72b0f2aa82d163";

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
