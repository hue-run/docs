#!/usr/bin/env node
// List the fenced code blocks of an MDX page, or print one block dedented.
// Usage: snippet.mjs <page.mdx>            -> index, language, title, first line
//        snippet.mjs <page.mdx> <index>    -> the block's code on stdout
import { readFileSync } from "node:fs";

const [file, pick] = process.argv.slice(2);
if (!file) {
  console.error("usage: snippet.mjs <page.mdx> [index]");
  process.exit(2);
}
const blocks = [];
const lines = readFileSync(file, "utf8").split("\n");
for (let i = 0; i < lines.length; i++) {
  const open = lines[i].match(/^(\s*)```(\S*)\s*(.*)$/);
  if (!open) continue;
  const indent = open[1].length;
  const body = [];
  for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i].slice(indent));
  blocks.push({ lang: open[2], title: open[3].match(/title="([^"]*)"/)?.[1] ?? open[3], code: body.join("\n") });
}
if (pick === undefined) {
  blocks.forEach((b, n) => console.log(`${n}\t${b.lang}\t${b.title}\t${b.code.split("\n")[0].slice(0, 70)}`));
} else if (blocks[pick]) {
  process.stdout.write(`${blocks[pick].code}\n`);
} else {
  console.error(`no block ${pick} in ${file}; ${blocks.length} blocks`);
  process.exit(1);
}
