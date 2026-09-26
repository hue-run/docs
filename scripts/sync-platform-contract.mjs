// Pins contracts/fern-public-docs.json to the Hue platform commit that production serves.
//
// The MCP guide must name every tool in the platform snapshot, so a snapshot taken from the
// platform's main branch would publish tools production does not serve yet. Production reports
// the commit it runs at /api/health; this script reads the platform's generated contract at that
// exact commit through the GitHub CLI, then records the commit and digest in contracts/sources.json
// and regenerates docs-contract.json.
//
//   node scripts/sync-platform-contract.mjs            pin to the commit production serves
//   node scripts/sync-platform-contract.mjs --check    report whether the pin is still current
//   node scripts/sync-platform-contract.mjs --commit <sha> --undeployed
//                                                      pin a commit production does not serve yet,
//                                                      for a pull request held until it deploys
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

/**
 * Runs the command and returns its exit code. The production lookup and the contract read are
 * injectable so tests run without the network or the GitHub CLI.
 */
export async function run(argv, { served = fetchProductionCommit, contractAt = platformContractAt, log = console.log, error = console.error } = {}) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        commit: { type: "string" },
        undeployed: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
      },
    }));
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause));
    return 2;
  }
  if (values.check && (values.commit || values.undeployed)) {
    error("--check compares the pin with production and takes no --commit or --undeployed.");
    return 2;
  }
  if (values.undeployed && !values.commit) {
    error("--undeployed needs --commit <sha>.");
    return 2;
  }
  const sourcesPath = resolve(root, "contracts/sources.json");
  const sources = readJson("contracts/sources.json");
  const pinned = sources.sources.platform.commit;
  let production;
  try {
    production = await served();
  } catch (cause) {
    // An explicit pre-deployment pin needs only the named commit's contract.
    if (!values.undeployed) throw cause;
    error(`Could not read the commit production serves (${cause instanceof Error ? cause.message : String(cause)}); pinning ${values.commit} as undeployed.`);
  }
  if (values.check) {
    if (pinned === production) {
      log(`The platform snapshot is pinned to the commit production serves (${production}).`);
      return 0;
    }
    error(`The platform snapshot is pinned to ${pinned}, but production serves ${production}. Run \`bun run docs:platform\` after production deploys, then reconcile the pages.`);
    return 1;
  }
  const target = values.commit ?? production;
  if (target !== production && !values.undeployed) {
    error(`Production serves ${production}, not ${target}. Pin the served commit, or pass --undeployed for a pull request held until ${target} deploys.`);
    return 1;
  }
  const contractPath = resolve(root, sources.sources.platform.contractFile);
  const outputPath = resolve(root, "docs-contract.json");
  const originals = [contractPath, sourcesPath, outputPath].map((path) => [path, readFileSync(path, "utf8")]);
  try {
    const contractText = contractAt(sources.sources.platform.repository, target);
    const next = pinnedSources(sources, target, contractText);
    writeFileSync(contractPath, contractText);
    writeFileSync(sourcesPath, `${JSON.stringify(next, null, 2)}\n`);
    // Rendering validates the snapshot against every other source before anything is kept.
    writeFileSync(outputPath, renderDocsContract());
  } catch (cause) {
    for (const [path, text] of originals) writeFileSync(path, text);
    error(`Nothing changed: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }
  if (target !== production)
    log(`Pinned the platform snapshot to ${target}, which production does not serve yet${production ? ` (it serves ${production})` : ""}. Hold this change until ${target} deploys.`);
  else if (pinned === target) log(`The platform snapshot was already pinned to ${target}.`);
  else log(`Pinned the platform snapshot to ${target} (was ${pinned}). Run \`bun run check\` and update the pages it names.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (cause) => {
      console.error(cause instanceof Error ? cause.message : String(cause));
      process.exitCode = 1;
    },
  );
}
