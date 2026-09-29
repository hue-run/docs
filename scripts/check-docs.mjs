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
// A new page is a deliberate change: guides/redaction centralizes the cross-language
// redaction recipes linked by the SDK guides and coding-agent skill, and agents/mcp-tools keeps
// the per-tool reference off the connection guide that agents read whole during setup.
if (pages.length !== 24 || pages.length + 1 !== 25) {
  fail(`expected 24 navigated MDX pages plus skill.md, found ${pages.length + 1}`);
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

const expectedPresetNames = ["Read", "Read and write", "Tracing only"];
// Earlier preset names still label existing keys in Settings. Only the key guide's legacy note and
// the MCP guide's troubleshooting may name them.
const legacyPresetNames = [
  "Tracing and evaluations",
  "Source capture only",
  "Source capture (legacy)",
  "Coding agent (read-only)",
  "Coding agent (read + evaluations)",
];
const legacyPresetFiles = ["guides/project-keys.mdx", "agents/mcp-server.mdx"];
const presetNames = platform.serviceKeyPresets.map(({ name }) => name);
if (JSON.stringify(presetNames) !== JSON.stringify(expectedPresetNames)) {
  fail(`platform contract has unexpected service-key presets: ${presetNames.join(", ")}`);
}

const publicFiles = [...expectedMdxFiles, "skill.md"];
const publicText = Object.fromEntries(publicFiles.map((path) => [path, read(path)]));
const allPublicText = Object.values(publicText).join("\n");
for (const legacy of [
  "**Read-only**",
  "once that host is live",
  "skill.md?v=0.2.2",
  "skill.md?v=0.2.3",
  "experiment comparison come later",
  // Sign in with Hue (OAuth) is released; the key-only statements and unverified client limits are retired.
  "does not provide an OAuth authorization flow",
  "does not offer an OAuth authorization flow",
  "Cursor limits the number of tools",
]) {
  if (allPublicText.includes(legacy)) fail(`public content contains retired text: ${legacy}`);
}

const mcpVocabularyText = [
  publicText["agents/mcp-server.mdx"],
  publicText["agents/mcp-tools.mdx"],
  publicText["agents/investigate-production.mdx"],
].join("\n");
for (const legacy of [
  "dataset_id",
  "dataset_version_id",
  "version_id",
  "from_version_id",
  "scorer_id",
  "scorer_version_id",
  "scorer_version_ids",
  "experiment_id",
  "baseline_experiment_id",
  "scenario_id",
  "evaluation_item_id",
  "active_version_id",
]) {
  if (new RegExp(`\\b${legacy}\\b`).test(mcpVocabularyText)) {
    fail(`MCP documentation contains retired field name: ${legacy}`);
  }
}

const canonicalMcp = "https://mcp.hue.run/mcp";
const docsMcp = "https://docs.hue.run/mcp";
if (platform.endpoints.productMcp.production.endpoint !== canonicalMcp) fail("platform product MCP endpoint drifted");
if (platform.endpoints.documentation.mcpEndpoint !== docsMcp) fail("platform docs MCP endpoint drifted");
if ((publicText["agents/mcp-server.mdx"].match(new RegExp(canonicalMcp.replaceAll(".", "\\."), "g")) ?? []).length < 8) {
  fail("MCP installation snippets must use the canonical product MCP endpoint");
}
if (!publicText["agents/mcp-server.mdx"].includes(docsMcp)) fail("MCP guide must distinguish the documentation MCP endpoint");
if (!Array.isArray(platform.mcp.tools) || platform.mcp.tools.length === 0) {
  fail("platform contract has no product MCP tools");
}
for (const { name } of platform.mcp.tools) {
  if (!publicText["agents/mcp-server.mdx"].includes(name)) fail(`MCP guide is missing tool ${name}`);
}
// The catalog tools are listed beside every selection but `all`; the guide names each one.
const catalogTools = platform.mcp.toolsets?.catalogTools ?? [];
const toolsets = platform.mcp.toolsets ?? {};
for (const { name } of catalogTools) {
  if (!publicText["agents/mcp-server.mdx"].includes(name)) fail(`MCP guide is missing catalog tool ${name}`);
}
const compact = (value) => value.replace(/\s+/g, " ").trim();
const compactMcpGuide = compact(publicText["agents/mcp-server.mdx"]);
for (const group of toolsets.groups ?? []) {
  const names = platform.mcp.tools.filter(({ toolset }) => toolset === group).map(({ name }) => `\`${name}\``);
  const row = `| \`${group}\` | ${names.join(", ")}. |`;
  if (!compactMcpGuide.includes(compact(row))) fail(`MCP guide does not list the generated ${group} toolset`);
}
// Every profile the contract defines is documented. A default profile is described in prose: the
// "Without a selection" sentence names exactly its tools and its row states their number. Every
// other profile has its generated row.
const defaultProfiles = new Set(toolsets.default ?? []);
for (const [profile, tools] of Object.entries(toolsets.profiles ?? {})) {
  const names = tools.map((name) => `\`${name}\``);
  if (!defaultProfiles.has(profile)) {
    const row = `| \`${profile}\` | ${names.join(", ")}. |`;
    if (!compactMcpGuide.includes(compact(row))) fail(`MCP guide does not list the generated ${profile} profile`);
    continue;
  }
  const opening = `Without a selection, a connection lists the \`${profile}\` toolset`;
  // The list is the run of code-formatted names right after the sentence's colon, joined by commas
  // or "and", so an abbreviation or other punctuation in the sentence cannot cut it short.
  const start = compactMcpGuide.indexOf(opening);
  const colon = start === -1 ? -1 : compactMcpGuide.indexOf(":", start + opening.length);
  const run =
    colon === -1
      ? ""
      : (/^\s*(`[a-z_]+`(?:(?:,\s*(?:and\s+)?|\s+and\s+)`[a-z_]+`)*)/.exec(compactMcpGuide.slice(colon + 1))?.[1] ?? "");
  const listed = [...run.matchAll(/`([a-z_]+)`/g)].map(([, name]) => name);
  if (JSON.stringify([...listed].sort()) !== JSON.stringify([...tools].sort())) {
    fail(`MCP guide's "Without a selection" sentence must name exactly the default ${profile} profile's tools`);
  }
  if (!compactMcpGuide.includes(`| \`${profile}\` | The ${tools.length} `)) {
    fail(`MCP guide does not list the default ${profile} profile with its ${tools.length} tools`);
  }
}
// The tool reference gives every tool, catalog tools included, one row under its toolset's heading,
// with an access level that matches the contract: Read, Destructive (a write with destructiveHint)
// or Write. Role requirements follow a comma and are not in the contract.
const referenceRows = new Map();
let referenceGroup = null;
for (const line of publicText["agents/mcp-tools.mdx"].split("\n")) {
  const heading = /^### (?:`([a-z_]+)`|(Catalog tools))$/.exec(line);
  if (heading) referenceGroup = heading[1] ?? "catalog";
  const row = /^\| `([a-z_]+)` \| ([^|]+?) \|/.exec(line);
  if (!row) continue;
  if (referenceRows.has(row[1])) fail(`MCP tool reference lists ${row[1]} twice`);
  referenceRows.set(row[1], { group: referenceGroup, access: row[2].split(",")[0].trim() });
}
const referenceTools = [
  ...platform.mcp.tools,
  ...catalogTools.map((tool) => ({ ...tool, toolset: "catalog" })),
];
for (const { name, toolset, access, annotations } of referenceTools) {
  const row = referenceRows.get(name);
  if (!row) {
    fail(`MCP tool reference is missing ${name}`);
    continue;
  }
  if (row.group !== toolset) fail(`MCP tool reference lists ${name} under ${row.group}; the contract puts it in ${toolset}`);
  const expected = access === "read" ? "Read" : annotations?.destructiveHint ? "Destructive" : "Write";
  if (row.access !== expected) fail(`MCP tool reference gives ${name} ${row.access} access; the contract makes it ${expected}`);
}
for (const name of referenceRows.keys()) {
  if (!referenceTools.some((tool) => tool.name === name)) fail(`MCP tool reference lists ${name}, which the contract does not`);
}
// Match the snippets for the clients documented in this guide. The producer snapshot also
// includes other clients; its complete contents and source digest remain checked below.
const guideSnippetKeys = [
  "claudeCodeProjectJson",
  "claudeCodeCli",
  "codexCli",
  "codexToml",
  "cursorJson",
  "oauthClaudeCodeCli",
  "oauthCodexCli",
  "oauthCodexToml",
  "connectPrompt",
  "verifyPrompt",
];
for (const key of guideSnippetKeys) {
  const snippet = platform.mcp.installSnippets[key];
  if (typeof snippet !== "string") {
    fail(`platform contract has no ${key} snippet`);
    continue;
  }
  // A sign-in command is the start of its key form, so it must also appear outside that form.
  let guide = compactMcpGuide;
  for (const other of guideSnippetKeys) {
    const longer = platform.mcp.installSnippets[other];
    if (typeof longer === "string" && longer.length > snippet.length && compact(longer).includes(compact(snippet))) {
      guide = guide.replaceAll(compact(longer), "");
    }
  }
  if (!guide.includes(compact(snippet))) fail(`MCP guide does not match the generated ${key} snippet`);
}
// Tool counts quoted in the guide must match the contract: every tool, the read tools a Read key or
// connection sees, or the default listing (the default toolsets and the catalog tools) with write
// access or with Read access, which has no write executor.
const readToolCount = platform.mcp.tools.filter(({ access }) => access === "read").length;
const defaultListed = platform.mcp.tools.filter(({ name, toolset }) =>
  (toolsets.default ?? []).some((selected) => (toolsets.profiles?.[selected] ?? []).includes(name) || selected === toolset),
);
const defaultCount = defaultListed.length + catalogTools.length;
const defaultReadCount =
  defaultListed.filter(({ access }) => access === "read").length + catalogTools.filter(({ access }) => access === "read").length;
// A count stated for an access level must be that level's count; any other count must be one of them.
const describedCounts = [
  [/\b(\d+) tools with write access\b/g, defaultCount, "the default listing with write access"],
  [/\b(\d+) tools with \*\*Read\*\* access\b/g, defaultReadCount, "the default listing with Read access"],
];
for (const [pattern, expected, description] of describedCounts) {
  for (const [, count] of publicText["agents/mcp-server.mdx"].matchAll(pattern)) {
    if (Number(count) !== expected) fail(`MCP guide names ${count} tools for ${description}; the contract has ${expected}`);
  }
}
const defaultCountSentence = `That is ${defaultCount} tools with write access, or ${defaultReadCount} tools with **Read** access.`;
if (!publicText["agents/mcp-server.mdx"].includes(defaultCountSentence)) {
  fail(`MCP guide must report the default listing as: ${defaultCountSentence}`);
}
const toolCounts = [platform.mcp.tools.length, readToolCount, defaultCount, defaultReadCount];
for (const [, count] of publicText["agents/mcp-server.mdx"].matchAll(/\b(\d+) tools\b/g)) {
  if (!toolCounts.includes(Number(count))) {
    fail(
      `MCP guide names ${count} tools; the contract has ${platform.mcp.tools.length} tools, ${readToolCount} of them read tools, and a default listing of ${defaultCount} (${defaultReadCount} with Read access)`,
    );
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

for (const path of publicFiles) {
  if (legacyPresetFiles.includes(path)) continue;
  for (const name of legacyPresetNames) {
    if (publicText[path].includes(name)) fail(`${path} names the retired key preset ${name}`);
  }
}
for (const path of ["guides/project-keys.mdx"]) {
  for (const name of legacyPresetNames) {
    if (!publicText[path].includes(name)) fail(`${path} must explain the legacy preset ${name}`);
  }
}

const requirements = {
  "quickstart.mdx": ["Tracing only"],
  "sdks/typescript.mdx": ["Tracing only", "Read and write"],
  "sdks/python.mdx": ["Tracing only", "Read and write"],
  "integrations/opentelemetry.mdx": ["Tracing only", "Read and write"],
  "integrations/reference-chatbot.mdx": ["Tracing only"],
  "guides/production-safety.mdx": ["Tracing only", "Read and write"],
  "evaluations/first-evaluation.mdx": ["Read and write"],
  "evaluations/simulations.mdx": ["Read and write"],
  "evaluations/managed-runs.mdx": ["Read and write"],
  "reference/typescript.mdx": ["Tracing only", "Read and write"],
  "reference/python.mdx": ["Tracing only", "Read and write"],
  "agents/overview.mdx": ["Tracing only", "**Read**", "Read and write"],
  "agents/mcp-server.mdx": ["**Read**", "Read and write", "**Settings → Connected apps**"],
  "agents/mcp-tools.mdx": ["**Read**", "Read and write", "Tracing only"],
  "guides/troubleshooting.mdx": ["Tracing only", "**Read**", "Read and write"],
  "guides/project-keys.mdx": expectedPresetNames.map((name) => `**${name}**`),
  "skill.md": ["Tracing only", "Read and write"],
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
})) {
  for (const phrase of phrases) if (!publicText[path].includes(phrase)) fail(`${path} must name current version ${phrase}`);
}
if (platform.packages.typescript.version !== typescriptVersion || platform.packages.python.version !== pythonVersion) {
  fail("platform and SDK package-version contracts disagree");
}

const sourceMetadata = readJson("contracts/sources.json");
const mirroredSkill = sourceMetadata.skillOverride?.source?.skill ?? sdk.skill;
const publicSkill = read("skill.md");
const expectedSkillFrontmatter = [
  "---",
  `name: "${mirroredSkill.name}"`,
  'title: "skill.md"',
  `description: "${mirroredSkill.description}"`,
  "metadata:",
  `  author: "${mirroredSkill.metadata.author}"`,
  `  version: "${mirroredSkill.metadata.version}"`,
  "---",
].join("\n");
if (!publicSkill.startsWith(`${expectedSkillFrontmatter}\n`)) {
  fail("skill.md frontmatter differs from the SDK-owned skill metadata");
}
const skillSource = canonicalSkill(publicSkill, { skill: mirroredSkill });
// A skill override is the one documented exception to mirroring the pinned SDK skill verbatim: the
// released skill with one section, or the complete skill, from a later SDK commit. It is
// bound to the current snapshot, so refreshing contracts/sdk-docs.json forces its removal or renewal.
const skillOverride = sourceMetadata.skillOverride;
if (skillOverride) {
  const { base, section } = skillOverride;
  if (base.commit !== sourceMetadata.sources.sdk.commit) {
    fail("contracts/sources.json skillOverride.base.commit must be the pinned SDK snapshot commit; re-mirror the skill and drop the override");
  }
  if (base.source !== sdk.skill.source || base.sha256 !== sdk.skill.sha256) {
    fail("contracts/sources.json skillOverride.base no longer matches the SDK snapshot's skill; re-mirror the skill and drop the override");
  }
  if (skillOverride.source) {
    const { source } = skillOverride;
    if (!/^[0-9a-f]{40}$/.test(source.commit) || source.repository !== sdk.repository)
      fail("skillOverride.source must identify a full hue-sdk commit");
    if (source.skill.source !== sdk.skill.source || source.skill.sha256 !== skillOverride.sha256)
      fail("skillOverride.source must name the SDK-owned skill and its exact digest");
    if (digest(skillSource) !== source.skill.sha256)
      fail("skill.md differs from the later SDK-owned skill source");
  } else {
    if (!/^[0-9a-f]{40}$/.test(section.commit) || section.repository !== sdk.repository) {
      fail("contracts/sources.json skillOverride.section must name a full hue-sdk commit");
    }
    if (digest(skillSource) !== skillOverride.sha256) fail("skill.md differs from the recorded skill override");
    const body = bodyAfterFrontmatter(publicSkill) ?? "";
    const start = body.indexOf(`\n${section.heading}\n`);
    const end = start === -1 ? -1 : body.indexOf("\n## ", start + section.heading.length + 1);
    if (start === -1 || end === -1) fail(`skill.md is missing the overriding section ${section.heading}`);
    else if (digest(body.slice(start + 1, end + 1)) !== section.sha256) {
      fail(`skill.md section ${section.heading} differs from hue-sdk ${section.commit}`);
    }
    if (body.includes(`\n${section.replaces}\n`)) fail(`skill.md still contains the replaced section ${section.replaces}`);
  }
} else if (digest(skillSource) !== sdk.skill.sha256) {
  fail("skill.md differs from the SDK-owned skill source");
}
// Without a key, the skill sends a first-time setup to the one agent setup page.
if (!publicSkill.includes("## Get a Hue API key") || !publicSkill.includes("https://docs.hue.run/guides/agent-setup")) {
  fail("skill.md must contain the Get a Hue API key section that links to the agent setup page");
}
// Hue Cloud is invite-only: no public page may hand an agent an anonymous setup or claim command.
for (const [path, text] of Object.entries(publicText)) {
  for (const [block] of text.matchAll(/^\s*```[\s\S]*?^\s*```/gm)) {
    for (const command of ["setup --agent", "resume --agent", "hue claim", "hue setup", "@hue-run/sdk@latest setup"]) {
      if (block.includes(command)) fail(`${path} has a code block with an anonymous setup command: ${command}`);
    }
    for (const line of block.replace(/\\\n\s*/g, " ").split("\n")) {
      // A bare `npx hue` or `bunx hue` resolves an unrelated npm package named `hue`.
      if (/(^|[\s;&|])(npx|bunx)( -y| --yes)? hue(\s|$)/.test(line)) {
        fail(`${path} runs the hue CLI without naming @hue-run/sdk: ${line.trim()}`);
      }
      // A double-quoted reference is expanded by the shell, so `mcp add` stores the key itself.
      if (/\bmcp add\b/.test(line) && /"Authorization: Bearer \$/.test(line)) {
        fail(`${path} double-quotes a key reference in an mcp add command: ${line.trim()}`);
      }
    }
  }
}
const compatibilitySource = canonicalCompatibility(read("sdks/compatibility.mdx"));
if (digest(compatibilitySource) !== sdk.compatibility.sha256) fail("sdks/compatibility.mdx differs from the SDK-owned source");
// Everyone follows one public agent setup page: the key step with the account contact line, tracing
// through the skill, then the MCP connection. The invited-setup URL stays alive only as a stub.
const frontmatterOf = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
const agentSetup = publicText["guides/agent-setup.mdx"];
if (/^hidden:\s*true$/m.test(frontmatterOf(agentSetup))) {
  fail("guides/agent-setup.mdx must stay visible in navigation");
}
for (const phrase of [
  "https://calendar.notion.so/meet/akethini/hue",
  "founders@hue.run",
  "hue login",
  "hue mcp install",
  "https://docs.hue.run/skill.md",
]) {
  if (!agentSetup.includes(phrase)) fail(`guides/agent-setup.mdx must contain ${phrase}`);
}
if (agentSetup.includes("skill.md?v=")) fail("guides/agent-setup.mdx must link the unversioned skill.md");
const movedSetup = publicText["guides/invited-setup.mdx"];
if (!/^hidden:\s*true$/m.test(frontmatterOf(movedSetup)) || !movedSetup.includes("https://docs.hue.run/guides/agent-setup.md")) {
  fail("guides/invited-setup.mdx must be a hidden stub that points to https://docs.hue.run/guides/agent-setup.md");
}
for (const [path, text] of Object.entries(publicText)) {
  if (path !== "guides/invited-setup.mdx" && text.includes("guides/invited-setup")) {
    fail(`${path} links the moved invited-setup page; link /guides/agent-setup instead`);
  }
  for (const phrase of ["heightened demand", "Many apologies", "invite-only gate", "request access"]) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) fail(`${path} contains retired access-gate text: ${phrase}`);
  }
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
