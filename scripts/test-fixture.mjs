import { cpSync } from "node:fs";
import { basename } from "node:path";

const excluded = new Set([".git", "node_modules", ".mintlify", ".context", ".hue", ".conductor"]);

export function copyDocsFixture(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => !excluded.has(basename(path)),
  });
}
