import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256File(path) {
  return sha256(readFileSync(resolve(root, path)));
}

export function navigationPages(config = readJson("docs.json")) {
  const pages = [];
  const visit = (entries) => {
    for (const entry of entries) {
      if (typeof entry === "string") pages.push(entry);
      else if (entry && Array.isArray(entry.pages)) visit(entry.pages);
    }
  };
  visit(config.navigation.pages);
  return pages;
}

export function buildDocsContract() {
  const platform = readJson("contracts/fern-public-docs.json");
  const sdk = readJson("contracts/sdk-docs.json");
  const sourceMetadata = readJson("contracts/sources.json");
  const pages = [...navigationPages(), "skill.md"];

  if (sourceMetadata.schemaVersion !== 1) {
    throw new Error("contracts/sources.json must use schemaVersion 1");
  }
  if (sourceMetadata.sources.platform.repository !== platform.repository) {
    throw new Error("platform source repository does not match its contract");
  }
  if (sourceMetadata.sources.sdk.repository !== sdk.repository) {
    throw new Error("SDK source repository does not match its contract");
  }

  for (const [name, source] of Object.entries(sourceMetadata.sources)) {
    if (!/^[0-9a-f]{40}$/.test(source.commit)) {
      throw new Error(`${name} source commit must be a full Git SHA`);
    }
    const actual = sha256File(source.contractFile);
    if (source.sha256 !== actual) {
      throw new Error(`${name} contract digest is stale: expected ${source.sha256}, found ${actual}`);
    }
  }

  if (platform.schemaVersion !== 1 || sdk.schemaVersion !== 1) {
    throw new Error("Only producer documentation contract schemaVersion 1 is supported");
  }

  return {
    schemaVersion: 1,
    repository: "https://github.com/hue-run/docs",
    sources: sourceMetadata.sources,
    site: {
      origin: platform.endpoints.documentation.origin,
      projectMcpUrl: platform.endpoints.productMcp.production.endpoint,
      projectMcpAlias: platform.endpoints.productMcp.production.applicationAlias,
      docsMcpUrl: platform.endpoints.documentation.mcpEndpoint,
      skillUrl: `${platform.endpoints.documentation.origin}/skill.md`,
      pageCount: pages.length,
    },
    serviceKeyPresets: platform.serviceKeyPresets,
    packages: {
      typescript: {
        name: sdk.packages.typescript.name,
        version: sdk.packages.typescript.version,
        entrypoints: Object.keys(sdk.packages.typescript.entrypoints),
      },
      python: {
        name: sdk.packages.python.name,
        version: sdk.packages.python.version,
        modules: Object.keys(sdk.packages.python.modules),
      },
    },
    skill: {
      version: sdk.skill.metadata.version,
      sha256: sha256File("skill.md"),
      sdkSourceSha256: sdk.skill.sha256,
      ...(sourceMetadata.skillOverride
        ? {
            override: {
              baseCommit: sourceMetadata.skillOverride.base.commit,
              sectionCommit: sourceMetadata.skillOverride.section.commit,
              section: sourceMetadata.skillOverride.section.heading,
              replaces: sourceMetadata.skillOverride.section.replaces,
              sourceSha256: sourceMetadata.skillOverride.sha256,
            },
          }
        : {}),
    },
    mcp: {
      transport: platform.mcp.transport,
      authentication: platform.mcp.authentication,
      tools: platform.mcp.tools.map(({ name }) => name),
      catalogSha256: platform.mcp.catalogSha256,
    },
    pages,
  };
}

export function renderDocsContract() {
  return `${JSON.stringify(buildDocsContract(), null, 2)}\n`;
}
