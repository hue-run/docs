import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { buildDocsContract, navigationPages, readJson, renderDocsContract, root } from "./docs-contract.mjs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(resolve(root, path), "utf8");
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function filesBelow(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if ([".git", ".mintlify", "node_modules"].includes(entry)) continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) found.push(...filesBelow(path));
    else found.push(relative(root, path).replaceAll("\\", "/"));
  }
  return found;
}

function bodyAfterFrontmatter(text) {
  const match = text.match(/^---\n[\s\S]*?\n---\n/);
  if (!match) return null;
  return text.slice(match[0].length);
}

function canonicalSkill(publicSkill, contract) {
  const body = bodyAfterFrontmatter(publicSkill);
  if (body === null) return "";
  return [
    "---",
    `name: ${contract.skill.name}`,
    `description: ${contract.skill.description}`,
    "metadata:",
    `  author: ${contract.skill.metadata.author}`,
    `  version: "${contract.skill.metadata.version}"`,
    "---",
    body,
  ].join("\n");
}

function canonicalCompatibility(publicCompatibility) {
  const body = bodyAfterFrontmatter(publicCompatibility);
  if (body === null) return "";
  return `# Compatibility\n\n${body.replace(/^\n/, "")}`
    .replace(
      "[VERSIONING.md](https://github.com/hue-run/hue-sdk/blob/main/VERSIONING.md)",
      "[VERSIONING.md](./VERSIONING.md)",
    )
    .replace("[Hue MCP server](/agents/mcp-server)", "[Hue MCP server](https://docs.hue.run/agents/mcp-server)")
    .replace("[managed runs](/evaluations/managed-runs)", "[managed runs](https://docs.hue.run/evaluations/managed-runs)")
    .replace("[production safety](/guides/production-safety)", "[production safety](https://docs.hue.run/guides/production-safety)");
}

const config = readJson("docs.json");
const platform = readJson("contracts/fern-public-docs.json");
const sdk = readJson("contracts/sdk-docs.json");
const pages = navigationPages(config);
const mdxFiles = filesBelow(root).filter((path) => path.endsWith(".mdx")).sort();
const expectedMdxFiles = pages.map((page) => `${page}.mdx`).sort();

if (new Set(pages).size !== pages.length) fail("docs.json navigation contains duplicate pages");
if (JSON.stringify(mdxFiles) !== JSON.stringify(expectedMdxFiles)) {
  fail(`docs.json must contain every MDX page exactly once; found ${mdxFiles.length} files and ${pages.length} navigation entries`);
}
if (pages.length !== 19 || pages.length + 1 !== 20) {
  fail(`expected 19 navigated MDX pages plus skill.md, found ${pages.length + 1}`);
}

for (const page of expectedMdxFiles) {
  const text = read(page);
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  if (!/^title:\s*.+$/m.test(frontmatter)) fail(`${page} is missing a frontmatter title`);
  if (!/^description:\s*.+$/m.test(frontmatter)) fail(`${page} is missing a frontmatter description`);
}

if (config.colors.dark !== "#96bce8") fail("docs.json colors.dark must be #96bce8");

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

if (contrastRatio(config.colors.primary, config.background.color.light) < 4.5) {
  fail("the light-theme primary color must meet WCAG AA text contrast");
}
if (contrastRatio(config.colors.dark, config.background.color.dark) < 4.5) {
  fail("the dark-theme accent must meet WCAG AA text contrast");
}

const expectedPresetNames = [
  "Tracing only",
  "Tracing and evaluations",
  "Coding agent (read-only)",
  "Coding agent (read + evaluations)",
];
const presetNames = platform.serviceKeyPresets.map(({ name }) => name);
if (JSON.stringify(presetNames) !== JSON.stringify(expectedPresetNames)) {
  fail(`platform contract has unexpected service-key presets: ${presetNames.join(", ")}`);
}

const publicFiles = [...expectedMdxFiles, "skill.md"];
const publicText = Object.fromEntries(publicFiles.map((path) => [path, read(path)]));
const allPublicText = Object.values(publicText).join("\n");
for (const legacy of [
  "**Read-only**",
  "**Read and write**",
  "once that host is live",
  "skill.md?v=0.2.2",
  "experiment comparison come later",
]) {
  if (allPublicText.includes(legacy)) fail(`public content contains retired text: ${legacy}`);
}

const canonicalMcp = "https://mcp.hue.run/mcp";
const aliasMcp = "https://app.hue.run/api/mcp";
const docsMcp = "https://docs.hue.run/mcp";
if (platform.endpoints.productMcp.production.endpoint !== canonicalMcp) fail("platform product MCP endpoint drifted");
if (platform.endpoints.productMcp.production.applicationAlias !== aliasMcp) fail("platform product MCP alias drifted");
if (platform.endpoints.documentation.mcpEndpoint !== docsMcp) fail("platform docs MCP endpoint drifted");
if ((publicText["agents/mcp-server.mdx"].match(new RegExp(canonicalMcp.replaceAll(".", "\\."), "g")) ?? []).length < 8) {
  fail("MCP installation snippets must use the canonical product MCP endpoint");
}
if ((allPublicText.match(new RegExp(aliasMcp.replaceAll(".", "\\."), "g")) ?? []).length !== 1) {
  fail("the application-host MCP alias must appear once, as compatibility information only");
}
if (!publicText["agents/mcp-server.mdx"].includes(docsMcp)) fail("MCP guide must distinguish the documentation MCP endpoint");
if (platform.mcp.tools.length !== 13) fail(`expected 13 product MCP tools, found ${platform.mcp.tools.length}`);
for (const { name } of platform.mcp.tools) {
  if (!publicText["agents/mcp-server.mdx"].includes(name)) fail(`MCP guide is missing tool ${name}`);
}
const compact = (value) => value.replace(/\s+/g, " ").trim();
const compactMcpGuide = compact(publicText["agents/mcp-server.mdx"]);
for (const key of [
  "claudeCodeProjectJson",
  "claudeCodeCli",
  "codexCli",
  "codexToml",
  "cursorJson",
  "windsurfJson",
  "geminiCli",
]) {
  if (!compactMcpGuide.includes(compact(platform.mcp.installSnippets[key]))) {
    fail(`MCP guide does not match the generated ${key} snippet`);
  }
}
for (const [variant, status] of Object.entries({
  product: "released",
  documentation: "released",
  simulation: "released",
  providerFacade: "deployed_inactive",
})) {
  if (platform.mcp.variants[variant]?.status !== status) fail(`unexpected ${variant} MCP status`);
}

const combinedPresetFiles = publicFiles.filter((path) => publicText[path].includes("Coding agent (read + evaluations)"));
if (JSON.stringify(combinedPresetFiles) !== JSON.stringify(["guides/project-keys.mdx"])) {
  fail("Coding agent (read + evaluations) must appear only in the combined-use project-key guide");
}

const requirements = {
  "quickstart.mdx": ["Tracing only"],
  "sdks/typescript.mdx": ["Tracing only", "Tracing and evaluations"],
  "sdks/python.mdx": ["Tracing only", "Tracing and evaluations"],
  "integrations/opentelemetry.mdx": ["Tracing only", "Tracing and evaluations"],
  "integrations/reference-chatbot.mdx": ["Tracing only"],
  "guides/production-safety.mdx": ["Tracing only", "Tracing and evaluations"],
  "guides/agent-setup.mdx": ["Tracing only", "Coding agent (read-only)"],
  "evaluations/first-evaluation.mdx": ["Tracing and evaluations"],
  "evaluations/simulations.mdx": ["Tracing and evaluations"],
  "evaluations/managed-runs.mdx": ["Tracing and evaluations"],
  "reference/typescript.mdx": ["Tracing only", "Tracing and evaluations"],
  "reference/python.mdx": ["Tracing only", "Tracing and evaluations"],
  "agents/overview.mdx": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)"],
  "agents/mcp-server.mdx": ["Coding agent (read-only)"],
  "guides/troubleshooting.mdx": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)"],
  "guides/project-keys.mdx": expectedPresetNames,
  "skill.md": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)"],
};
for (const [path, phrases] of Object.entries(requirements)) {
  for (const phrase of phrases) if (!publicText[path].includes(phrase)) fail(`${path} must name ${phrase}`);
}

if (!publicText["evaluations/simulations.mdx"].includes("provider-facade route is deployed")) {
  fail("simulation guide must state the deployed provider-facade boundary");
}
if (!publicText["evaluations/simulations.mdx"].includes("registrations remain inactive")) {
  fail("simulation guide must state that official provider registrations remain inactive");
}
if (!publicText["reference/typescript.mdx"].includes("official Gmail and Slack registrations remain inactive")) {
  fail("TypeScript reference must state that official provider registrations remain inactive");
}
if (!publicText["reference/typescript.mdx"].includes("has not released hosted Gmail or Slack provider calls")) {
  fail("TypeScript reference must not present hosted provider calls as released");
}

for (const [language, referencePath] of [
  [sdk.packages.typescript, "reference/typescript.mdx"],
  [sdk.packages.python, "reference/python.mdx"],
]) {
  const groups = Object.values(language.entrypoints ?? language.modules);
  const names = [...new Set(groups.flatMap(({ publicExports }) => publicExports))];
  const reference = publicText[referencePath];
  const missing = names.filter((name) => !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`).test(reference));
  if (missing.length) fail(`${referencePath} is missing public exports: ${missing.join(", ")}`);
}

const typescriptVersion = sdk.packages.typescript.version;
const pythonVersion = sdk.packages.python.version;
if (!publicText["installation.mdx"].includes(`npm install @hue-run/sdk@${typescriptVersion}`)) fail("installation.mdx has a stale TypeScript version");
if (!publicText["installation.mdx"].includes(`pip install hue-run==${pythonVersion}`)) fail("installation.mdx has a stale Python version");
for (const match of allPublicText.matchAll(/@hue-run\/sdk@(\d+\.\d+\.\d+)|hue-run==(\d+\.\d+\.\d+)/g)) {
  const version = match[1] ?? match[2];
  const expected = match[1] ? typescriptVersion : pythonVersion;
  if (version !== expected) fail(`public install command uses stale package version ${version}; expected ${expected}`);
}
for (const [path, phrases] of Object.entries({
  "sdks/compatibility.mdx": [`TypeScript \`${typescriptVersion}\``, `Python \`${pythonVersion}\``],
  "reference/typescript.mdx": [`\`@hue-run/sdk\` **${typescriptVersion}**`],
  "reference/python.mdx": [`\`hue-run\` **${pythonVersion}**`],
  "evaluations/managed-runs.mdx": [`@hue-run/sdk@${typescriptVersion}`, `hue-run==${pythonVersion}`],
  "guides/agent-setup.mdx": [`TypeScript SDK ${typescriptVersion}`, `Python ${pythonVersion}`],
})) {
  for (const phrase of phrases) if (!publicText[path].includes(phrase)) fail(`${path} must name current version ${phrase}`);
}
if (platform.packages.typescript.version !== typescriptVersion || platform.packages.python.version !== pythonVersion) {
  fail("platform and SDK package-version contracts disagree");
}

const publicSkill = read("skill.md");
const expectedSkillFrontmatter = [
  "---",
  `name: "${sdk.skill.name}"`,
  'title: "skill.md"',
  `description: "${sdk.skill.description}"`,
  "metadata:",
  `  author: "${sdk.skill.metadata.author}"`,
  `  version: "${sdk.skill.metadata.version}"`,
  "---",
].join("\n");
if (!publicSkill.startsWith(`${expectedSkillFrontmatter}\n`)) {
  fail("skill.md frontmatter differs from the SDK-owned skill metadata");
}
const skillSource = canonicalSkill(publicSkill, sdk);
if (digest(skillSource) !== sdk.skill.sha256) fail("skill.md differs from the SDK-owned skill source");
const compatibilitySource = canonicalCompatibility(read("sdks/compatibility.mdx"));
if (digest(compatibilitySource) !== sdk.compatibility.sha256) fail("sdks/compatibility.mdx differs from the SDK-owned source");
if (!publicText["guides/agent-setup.mdx"].includes(`skill.md?v=${sdk.skill.metadata.version}`)) {
  fail("agent setup must use the current skill cache version");
}

let generated;
try {
  generated = buildDocsContract();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (generated && read("docs-contract.json") !== renderDocsContract()) {
  fail("docs-contract.json is stale; run `bun run docs:contract`");
}

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation contract is current: ${pages.length + 1} public pages, ${presetNames.length} key presets, ${platform.mcp.tools.length} MCP tools.`);
}
