import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderDocsContract, root } from "./docs-contract.mjs";

const output = resolve(root, "docs-contract.json");
const rendered = renderDocsContract();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(output, "utf8");
  } catch {
    // The mismatch below reports the single remediation command.
  }
  if (current !== rendered) {
    throw new Error("docs-contract.json is stale; run `bun run docs:contract` and commit it");
  }
  console.log("docs-contract.json matches its source snapshots.");
} else {
  writeFileSync(output, rendered);
  console.log("Wrote docs-contract.json.");
}
