// Pins contracts/fern-public-docs.json to the Hue platform commit that production serves.
//
// The MCP guide must name every tool in the platform snapshot, so a snapshot taken from the
// platform's main branch would publish tools production does not serve yet. Production reports
// the commit it runs at /api/health; this script reads the platform's generated contract at that
// exact commit through the GitHub CLI, then records the commit and digest in contracts/sources.json
// and regenerates docs-contract.json.
//
//   node scripts/sync-platform-contract.mjs                 pin to the commit production serves
//   node scripts/sync-platform-contract.mjs --commit <sha>  pin to a named, deployed commit
//   node scripts/sync-platform-contract.mjs --check         report whether the pin is current
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readJson, renderDocsContract, root, sha256 } from "./docs-contract.mjs";

export const PRODUCTION_HEALTH_URL = "https://app.hue.run/api/health";
export const PLATFORM_CONTRACT_PATH = "docs/public-docs-contract.json";
const FULL_SHA = /^[0-9a-f]{40}$/;

/** The commit a production health response reports, or an error naming what is wrong. */
export function productionCommit(health) {
  if (!health || typeof health !== "object") throw new Error("health response is not a JSON object");
  if (health.status !== "ok") throw new Error(`production health is ${JSON.stringify(health.status)}, not "ok"`);
  if (health.environment !== "production")
    throw new Error(`health reports environment ${JSON.stringify(health.environment)}, not "production"`);
  if (typeof health.commit !== "string" || !FULL_SHA.test(health.commit))
    throw new Error("health does not report a full commit SHA");
  return health.commit;
}

/** New sources.json content pinning the platform snapshot to `commit` with the snapshot's digest. */
export function pinnedSources(sources, commit, contractText) {
  if (!FULL_SHA.test(commit)) throw new Error("the platform commit must be a full 40-character SHA");
  const contract = JSON.parse(contractText);
  if (contract.schemaVersion !== 1) throw new Error("the platform contract must use schemaVersion 1");
  if (contract.repository !== sources.sources.platform.repository)
    throw new Error(`the contract names ${contract.repository}, not ${sources.sources.platform.repository}`);
  return {
    ...sources,
    sources: {
      ...sources.sources,
      platform: { ...sources.sources.platform, commit, sha256: sha256(contractText) },
    },
  };
}

async function fetchProductionCommit() {
  const response = await fetch(PRODUCTION_HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${PRODUCTION_HEALTH_URL} answered HTTP ${response.status}`);
  return productionCommit(await response.json());
}

function platformContractAt(repository, commit) {
  // The platform repository is private; the GitHub CLI uses the maintainer's own authorization.
  return execFileSync(
    "gh",
    ["api", "-H", "Accept: application/vnd.github.raw+json", `repos/${repository}/contents/${PLATFORM_CONTRACT_PATH}?ref=${commit}`],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

async function main() {
  const { values } = parseArgs({ options: { commit: { type: "string" }, check: { type: "boolean", default: false } } });
  const sourcesPath = resolve(root, "contracts/sources.json");
  const sources = readJson("contracts/sources.json");
  const pinned = sources.sources.platform.commit;
  const target = values.commit ?? (await fetchProductionCommit());
  if (values.check) {
    if (pinned === target) {
      console.log(`The platform snapshot is pinned to the commit production serves (${target}).`);
      return;
    }
    const source = values.commit ? `the named commit is ${target}` : `production serves ${target}`;
    console.error(`The platform snapshot is pinned to ${pinned}, but ${source}. Run \`bun run docs:platform\`, then reconcile the pages.`);
    process.exitCode = 1;
    return;
  }
  const repository = sources.sources.platform.repository;
  const contractText = platformContractAt(repository, target);
  const next = pinnedSources(sources, target, contractText);
  const contractPath = resolve(root, sources.sources.platform.contractFile);
  const changed = readFileSync(contractPath, "utf8") !== contractText || pinned !== target;
  writeFileSync(contractPath, contractText);
  writeFileSync(sourcesPath, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(resolve(root, "docs-contract.json"), renderDocsContract());
  console.log(
    changed
      ? `Pinned the platform snapshot to ${target} (was ${pinned}). Run \`bun run check\` and update the pages it names.`
      : `The platform snapshot was already pinned to ${target}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
