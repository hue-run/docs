#!/usr/bin/env node
// Screenshot one page of the local preview with the puppeteer that the mint CLI already installs.
// Usage: screenshot.mjs <url> <out.png> [--full]
import puppeteer from "puppeteer";

const [url, out, mode] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: screenshot.mjs <url> <out.png> [--full]");
  process.exit(2);
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1600 });
  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  const h1 = await page.$eval("h1", (node) => node.textContent.trim()).catch(() => "(no h1)");
  await page.screenshot({ path: out, fullPage: mode === "--full" });
  console.log(`${response.status()} ${page.url()} | ${await page.title()} | h1: ${h1} | ${out}`);
} finally {
  await browser.close();
}
