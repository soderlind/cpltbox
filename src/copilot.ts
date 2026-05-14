export const MAX_TASK_LENGTH = 8000;
export const MAX_PRD_TEXT_LENGTH = 50000;
export const MAX_PRD_PATH_LENGTH = 240;
export const MAX_SKILL_PATHS = 10;
export const MAX_MCP_SERVERS = 10;
export const MAX_MCP_CONFIG_SIZE = 32000;

export const COPILOT_ALLOWED_HOSTS = [
  "github.com",
  "api.github.com",
  "api.githubcopilot.com",
  "copilot-proxy.githubusercontent.com",
  "copilot-telemetry.githubusercontent.com"
];

export interface TaskRequest {
  repo?: unknown;
  task?: unknown;
  model?: unknown;
  prdText?: unknown;
  prdPath?: unknown;
  skillPaths?: unknown;
  mcpConfig?: unknown;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
}

export interface McpServerConfig {
  type: "local" | "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tools?: string[] | "*";
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface RunContext {
  repo: string;
  task: string;
  prdText?: string;
  prdPath?: string;
  skillPaths?: string[];
  mcpConfig?: McpConfig;
  model?: string;
  sandboxId: string;
  targetDir: string;
}

export interface CopilotEnvSource {
  GH_TOKEN: string;
}

export const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

export const commandOutput = (result: CommandResult): string =>
  result.success ? result.stdout : result.stderr || result.stdout;

export function normalizeRepo(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("repo must be a string");
  }

  const repo = input.trim();
  const url = new URL(repo);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("repo must be an https://github.com URL");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error("repo must be a GitHub owner/repo URL");
  }

  const [owner, rawName] = segments;
  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
  if (!isGitHubPathSegment(owner) || !isGitHubPathSegment(name)) {
    throw new Error("repo owner or name contains unsupported characters");
  }

  return `https://github.com/${owner}/${name}.git`;
}

export function normalizeTask(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("task must be a string");
  }

  const task = input.trim();
  if (!task) {
    throw new Error("task must not be empty");
  }
  if (task.length > MAX_TASK_LENGTH) {
    throw new Error(`task must be ${MAX_TASK_LENGTH} characters or fewer`);
  }

  return task;
}

export function normalizeModel(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new Error("model must be a string");
  }

  const model = input.trim();
  if (!model) {
    return undefined;
  }
  if (!/^[a-zA-Z0-9_.:-]+$/.test(model)) {
    throw new Error("model contains unsupported characters");
  }

  return model;
}

export function normalizePrdText(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new Error("prdText must be a string");
  }

  const prdText = input.trim();
  if (!prdText) {
    throw new Error("prdText must not be empty");
  }
  if (prdText.length > MAX_PRD_TEXT_LENGTH) {
    throw new Error(`prdText must be ${MAX_PRD_TEXT_LENGTH} characters or fewer`);
  }

  return prdText;
}

export function normalizePrdPath(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  return normalizeRepoRelativePath(input, "prdPath", MAX_PRD_PATH_LENGTH);
}

export function normalizeSkillPaths(input: unknown): string[] | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    throw new Error("skillPaths must be an array");
  }
  if (input.length === 0) {
    return undefined;
  }
  if (input.length > MAX_SKILL_PATHS) {
    throw new Error(`skillPaths must contain ${MAX_SKILL_PATHS} paths or fewer`);
  }

  return input.map((path) => normalizeRepoRelativePath(path, "skillPaths item", MAX_PRD_PATH_LENGTH));
}

export function normalizeMcpConfig(input: unknown): McpConfig | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("mcpConfig must be an object");
  }

  const config = input as Record<string, unknown>;
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    throw new Error("mcpConfig.mcpServers must be an object");
  }

  const servers = config.mcpServers as Record<string, unknown>;
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    return undefined;
  }
  if (serverNames.length > MAX_MCP_SERVERS) {
    throw new Error(`mcpConfig.mcpServers must contain ${MAX_MCP_SERVERS} servers or fewer`);
  }

  const validatedServers: Record<string, McpServerConfig> = {};
  for (const name of serverNames) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(`mcpConfig server name "${name}" contains unsupported characters`);
    }

    const server = servers[name];
    if (typeof server !== "object" || server === null || Array.isArray(server)) {
      throw new Error(`mcpConfig.mcpServers.${name} must be an object`);
    }

    const serverObj = server as Record<string, unknown>;
    const type = serverObj.type;
    if (!type || !["local", "stdio", "http", "sse"].includes(type as string)) {
      throw new Error(`mcpConfig.mcpServers.${name}.type must be "local", "stdio", "http", or "sse"`);
    }

    const validated: McpServerConfig = { type: type as McpServerConfig["type"] };

    if (type === "local" || type === "stdio") {
      if (typeof serverObj.command !== "string" || !serverObj.command.trim()) {
        throw new Error(`mcpConfig.mcpServers.${name}.command is required for ${type} servers`);
      }
      validated.command = serverObj.command.trim();

      if (serverObj.args !== undefined) {
        if (!Array.isArray(serverObj.args) || !serverObj.args.every((a) => typeof a === "string")) {
          throw new Error(`mcpConfig.mcpServers.${name}.args must be an array of strings`);
        }
        validated.args = serverObj.args;
      }
    } else {
      if (typeof serverObj.url !== "string" || !serverObj.url.trim()) {
        throw new Error(`mcpConfig.mcpServers.${name}.url is required for ${type} servers`);
      }
      try {
        new URL(serverObj.url);
      } catch {
        throw new Error(`mcpConfig.mcpServers.${name}.url must be a valid URL`);
      }
      validated.url = serverObj.url.trim();

      if (serverObj.headers !== undefined) {
        if (typeof serverObj.headers !== "object" || Array.isArray(serverObj.headers)) {
          throw new Error(`mcpConfig.mcpServers.${name}.headers must be an object`);
        }
        validated.headers = serverObj.headers as Record<string, string>;
      }
    }

    if (serverObj.env !== undefined) {
      if (typeof serverObj.env !== "object" || Array.isArray(serverObj.env)) {
        throw new Error(`mcpConfig.mcpServers.${name}.env must be an object`);
      }
      validated.env = serverObj.env as Record<string, string>;
    }

    if (serverObj.tools !== undefined) {
      if (serverObj.tools === "*") {
        validated.tools = "*";
      } else if (Array.isArray(serverObj.tools) && serverObj.tools.every((t) => typeof t === "string")) {
        validated.tools = serverObj.tools;
      } else {
        throw new Error(`mcpConfig.mcpServers.${name}.tools must be "*" or an array of strings`);
      }
    }

    validatedServers[name] = validated;
  }

  const result: McpConfig = { mcpServers: validatedServers };

  // Size check
  const serialized = JSON.stringify(result);
  if (serialized.length > MAX_MCP_CONFIG_SIZE) {
    throw new Error(`mcpConfig must be ${MAX_MCP_CONFIG_SIZE} characters or fewer when serialized`);
  }

  return result;
}

function normalizeRepoRelativePath(input: unknown, fieldName: string, maxLength: number): string {
  if (typeof input !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const prdPath = input.trim();
  if (!prdPath) {
    throw new Error(`${fieldName} must not be empty`);
  }
  if (prdPath.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
  }
  if (prdPath.startsWith("/") || prdPath.startsWith("\\")) {
    throw new Error(`${fieldName} must be repo-relative`);
  }
  if (prdPath.includes("\\")) {
    throw new Error(`${fieldName} must use forward slashes`);
  }

  const segments = prdPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${fieldName} must be a repo-relative file path`);
  }
  if (segments.some((segment) => !/^[a-zA-Z0-9_.-]+$/.test(segment))) {
    throw new Error(`${fieldName} contains unsupported characters`);
  }

  return prdPath;
}

export function buildCopilotPrompt(
  context: Pick<RunContext, "task" | "prdText" | "prdPath" | "skillPaths">
): string {
  if (!context.prdText && !context.prdPath && !context.skillPaths?.length) {
    return context.task;
  }

  const contextSections: string[] = [];
  const prdSections: string[] = [];
  if (context.prdPath) {
    prdSections.push(
      [
        `Repo-relative PRD path: ${context.prdPath}`,
        "Read this file after checkout and use it as product requirements context."
      ].join("\n")
    );
  }
  if (context.prdText) {
    prdSections.push(`Inline PRD:\n${context.prdText}`);
  }
  if (prdSections.length > 0) {
    contextSections.push(`PRD context:\n${prdSections.join("\n\n")}`);
  }

  if (context.skillPaths?.length) {
    contextSections.push(
      [
        "Skill context:",
        "Repo-relative skill paths:",
        ...context.skillPaths.map((path) => `- ${path}`),
        "Read these files after checkout and follow their instructions when relevant to the task."
      ].join("\n")
    );
  }

  return [context.task, ...contextSections].join("\n\n");
}

export async function buildRunContext(request: Request): Promise<RunContext> {
  const body = (await request.json()) as TaskRequest;
  const repo = normalizeRepo(body.repo);
  const task = normalizeTask(body.task);
  const model = normalizeModel(body.model);
  const prdText = normalizePrdText(body.prdText);
  const prdPath = normalizePrdPath(body.prdPath);
  const skillPaths = normalizeSkillPaths(body.skillPaths);
  const mcpConfig = normalizeMcpConfig(body.mcpConfig);
  const targetDir = repo.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
  const sandboxId = await stableSandboxId(repo);

  const context: RunContext = { repo, task, sandboxId, targetDir };
  if (model) {
    context.model = model;
  }
  if (prdText) {
    context.prdText = prdText;
  }
  if (prdPath) {
    context.prdPath = prdPath;
  }
  if (skillPaths) {
    context.skillPaths = skillPaths;
  }
  if (mcpConfig) {
    context.mcpConfig = mcpConfig;
  }

  return context;
}

export async function stableSandboxId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

export function copilotEnv(env: CopilotEnvSource): Record<string, string> {
  if (!env.GH_TOKEN) {
    throw new Error("GH_TOKEN is not configured");
  }

  return {
    CI: "1",
    COPILOT_ALLOW_ALL: "1",
    GH_TOKEN: env.GH_TOKEN,
    GITHUB_TOKEN: env.GH_TOKEN,
    NO_COLOR: "1"
  };
}

export function buildCheckoutCommand(context: RunContext): string {
  // Build authenticated URL: https://github.com/... -> https://x-access-token:$GH_TOKEN@github.com/...
  // The shell expands $GH_TOKEN from the passed environment
  const authUrl = context.repo.replace("https://github.com/", "https://x-access-token:$GH_TOKEN@github.com/");
  return [
    `rm -rf ${shellQuote(context.targetDir)}`,
    "&&",
    "git",
    "clone",
    "--depth=1",
    `"${authUrl}"`,
    shellQuote(context.targetDir)
  ].join(" ");
}

export function buildCopilotCommand(context: RunContext, stream: boolean): string {
  const args = [
    "copilot",
    "-C",
    shellQuote(context.targetDir),
    "-p",
    shellQuote(buildCopilotPrompt(context)),
    "--allow-all",
    "--no-color",
    "--no-remote",
    "--no-auto-update",
    "--secret-env-vars=GH_TOKEN,GITHUB_TOKEN",
    "--stream",
    stream ? "on" : "off"
  ];

  if (!stream) {
    args.push("--silent");
  }
  if (context.model) {
    args.push("--model", shellQuote(context.model));
  }

  return args.join(" ");
}

export function buildMcpConfigCommand(context: RunContext): string | undefined {
  if (!context.mcpConfig) {
    return undefined;
  }

  const configJson = JSON.stringify(context.mcpConfig);
  // Use heredoc to safely write JSON with special characters
  return `mkdir -p ~/.copilot && cat > ~/.copilot/mcp-config.json << 'MCPCONFIG'\n${configJson}\nMCPCONFIG`;
}

function isGitHubPathSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(value) && !value.startsWith(".");
}