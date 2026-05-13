export const MAX_TASK_LENGTH = 8000;
export const MAX_PRD_TEXT_LENGTH = 50000;
export const MAX_PRD_PATH_LENGTH = 240;

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
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
}

export interface RunContext {
  repo: string;
  task: string;
  prdText?: string;
  prdPath?: string;
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
  if (typeof input !== "string") {
    throw new Error("prdPath must be a string");
  }

  const prdPath = input.trim();
  if (!prdPath) {
    throw new Error("prdPath must not be empty");
  }
  if (prdPath.length > MAX_PRD_PATH_LENGTH) {
    throw new Error(`prdPath must be ${MAX_PRD_PATH_LENGTH} characters or fewer`);
  }
  if (prdPath.startsWith("/") || prdPath.startsWith("\\")) {
    throw new Error("prdPath must be repo-relative");
  }
  if (prdPath.includes("\\")) {
    throw new Error("prdPath must use forward slashes");
  }

  const segments = prdPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("prdPath must be a repo-relative file path");
  }
  if (segments.some((segment) => !/^[a-zA-Z0-9_.-]+$/.test(segment))) {
    throw new Error("prdPath contains unsupported characters");
  }

  return prdPath;
}

export function buildCopilotPrompt(context: Pick<RunContext, "task" | "prdText" | "prdPath">): string {
  if (!context.prdText && !context.prdPath) {
    return context.task;
  }

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

  return [context.task, `PRD context:\n${prdSections.join("\n\n")}`].join("\n\n");
}

export async function buildRunContext(request: Request): Promise<RunContext> {
  const body = (await request.json()) as TaskRequest;
  const repo = normalizeRepo(body.repo);
  const task = normalizeTask(body.task);
  const model = normalizeModel(body.model);
  const prdText = normalizePrdText(body.prdText);
  const prdPath = normalizePrdPath(body.prdPath);
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

function isGitHubPathSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(value) && !value.startsWith(".");
}