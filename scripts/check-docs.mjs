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
const mintIgnore = new Set(
  read(".mintignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
);
for (const repositoryOnlyPath of [
  "AGENTS.md",
  "contracts/",
  "scripts/",
  "docs-contract.json",
  "package.json",
  "bun.lock",
]) {
  if (!mintIgnore.has(repositoryOnlyPath))
    fail(`.mintignore must exclude repository-only ${repositoryOnlyPath}`);
}
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
if (/\bfree trial\b/i.test(allPublicText)) {
  fail('public content must use "start without an account" or "bounded metadata-only trial", not "free trial"');
}
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
if (!Array.isArray(platform.mcp.tools) || platform.mcp.tools.length === 0) {
  fail("platform contract has no product MCP tools");
}
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
const allowedCombined = [
  "agents/mcp-server.mdx",
  "agents/overview.mdx",
  "guides/project-keys.mdx",
  "guides/troubleshooting.mdx",
];
for (const path of combinedPresetFiles) {
  if (!allowedCombined.includes(path)) fail(`Coding agent (read + evaluations) is not allowed in ${path}`);
}
for (const path of ["agents/mcp-server.mdx", "guides/project-keys.mdx"]) {
  if (!combinedPresetFiles.includes(path)) fail(`${path} must name Coding agent (read + evaluations)`);
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
  "agents/overview.mdx": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)", "Coding agent (read + evaluations)"],
  "agents/mcp-server.mdx": ["Coding agent (read-only)", "Coding agent (read + evaluations)"],
  "guides/troubleshooting.mdx": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)", "Coding agent (read + evaluations)"],
  "guides/project-keys.mdx": expectedPresetNames,
  "skill.md": ["Tracing only", "Tracing and evaluations", "Coding agent (read-only)"],
};
for (const [path, phrases] of Object.entries(requirements)) {
  for (const phrase of phrases) if (!publicText[path].includes(phrase)) fail(`${path} must name ${phrase}`);
}

for (const [path, phrases] of Object.entries({
  "installation.mdx": [
    "action.required",
    "bounded metadata-only trial",
    "actual application request ran exactly once",
  ],
  "guides/agent-setup.mdx": [
    "npx --yes @hue-run/sdk@latest setup --agent",
    "npx --yes @hue-run/sdk@latest setup",
    "npx --yes @hue-run/sdk@latest claim --format human",
    "npx --yes @hue-run/sdk@latest claim --restart --format human",
    "Restart requires both standard input and standard output to be terminals.",
    "Agent mode rejects restart and never opens a browser.",
    "consumed handoff with a still-live browser session is preserved, not reopened",
    "setup log export",
    "/api/v1/setup/traces/{traceId}/receipt",
    "/api/v1/traces/{traceId}/receipt",
    "generic Hue signup remains closed",
    "owner or admin",
    "ordinary member cannot transfer",
    "linked setup-scoped credential",
    "short-lived, single-use browser handoff",
    "pre-claim credential is refused",
    "does not replay the application request",
    "https://mcp.hue.run/mcp",
  ],
  "guides/project-keys.mdx": [
    "bounded metadata-only trial",
    "cannot export logs",
    "generic signup remains closed",
    "owner or admin",
    "Ordinary members cannot transfer",
    "/api/v1/setup/traces/{traceId}/receipt",
    "revokes the anonymous value",
    "revokes the anonymous value on the server. Rerun the local command to reconcile and atomically install the replacement setup-scoped credential.",
  ],
  "guides/troubleshooting.mdx": [
    "action.required",
    "old anonymous credential",
    "does not replay the application request",
  ],
})) {
  for (const phrase of phrases) {
    if (!publicText[path].includes(phrase)) fail(`${path} must document onboarding boundary: ${phrase}`);
  }
}

const installationGuide = publicText["installation.mdx"];
const agentGuide = publicText["guides/agent-setup.mdx"];
if (
  !/<Tab title="Agent">[\s\S]*?```text\s+Run `npx --yes @hue-run\/sdk@latest setup --agent`[^\n]*\n\s*```[\s\S]*?<\/Tab>/.test(
    installationGuide,
  )
)
  fail("installation.mdx must contain the exact standalone Agent prompt block");
if (
  !/<Tab title="Terminal">[\s\S]*?```sh\s+npx --yes @hue-run\/sdk@latest setup\s+```[\s\S]*?<\/Tab>/.test(
    installationGuide,
  )
)
  fail("installation.mdx must contain the exact standalone Terminal command block");

for (const phrase of [
  "Express with npm",
  "Express with Bun",
  "Flask with uv",
  "100 traces",
  "1,000 spans",
  "2 MiB",
  "24-hour ingestion window",
  "following seven-day retention period",
  "valid for 10 minutes",
  "lasts at most 30 minutes",
]) {
  if (!agentGuide.includes(phrase)) fail(`agent setup guide must freeze: ${phrase}`);
}
if (/creates no[^.]*model-provider request/i.test(installationGuide)) {
  fail("installation guide must not deny the one selected application/provider request");
}
for (const [path, text] of Object.entries({
  "installation.mdx": installationGuide,
  "guides/agent-setup.mdx": agentGuide,
  "guides/project-keys.mdx": publicText["guides/project-keys.mdx"],
  "guides/troubleshooting.mdx": publicText["guides/troubleshooting.mdx"],
  "quickstart.mdx": publicText["quickstart.mdx"],
  "agents/overview.mdx": publicText["agents/overview.mdx"],
})) {
  if (/\b(?:terms?|privacy)\b[^.]{0,100}\baccept/i.test(text))
    fail(`${path} must not add a legal-acceptance gate`);
}

for (const [description, pattern] of [
  [
    "dedicated setup receipt acceptance and generic receipt rejection",
    /checks `\/api\/v1\/setup\/traces\/\{traceId\}\/receipt`[\s\S]*generic `\/api\/v1\/traces\/\{traceId\}\/receipt` rejects a setup credential/,
  ],
  [
    "claim-scoped verified adoption and owner/admin-only transfer",
    /Only this private claim flow can admit a new identity; generic Hue signup remains closed\.[\s\S]*must verify their email[\s\S]*explicitly adopt the trial project[\s\S]*explicitly choose an organization where they are an owner or admin; an ordinary member cannot transfer/,
  ],
  [
    "setup trace-only authority and closed privileged surfaces",
    /send setup traces[\s\S]*rejects setup log export[\s\S]*cannot capture prompts or outputs, browse arbitrary traces, use the Hue MCP server, call evaluation APIs, change project settings, invite members, or alter billing/,
  ],
  [
    "global lineage revocation plus bounded endpoint verification",
    /atomically revokes the complete pre-claim credential lineage across Hue[\s\S]*separately confirms that the pre-claim credential is refused by `\/api\/v1\/setup\/traces\/\{traceId\}\/receipt`[\s\S]*endpoint check alone is not proof about every Hue route/,
  ],
  [
    "server claim revocation before local credential reconciliation",
    /Claim revokes the old credential on the server; the next local reconciliation installs its setup-scoped replacement/,
  ],
]) {
  if (!pattern.test(agentGuide)) fail(`agent setup guide must bind ${description}`);
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
