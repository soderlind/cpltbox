import { Sandbox as BaseSandbox, getSandbox } from "@cloudflare/sandbox";
import {
  buildCheckoutCommand,
  buildCopilotCommand,
  buildRunContext,
  commandOutput,
  COPILOT_ALLOWED_HOSTS,
  copilotEnv,
  shellQuote,
  type CommandResult,
  type RunContext
} from "./copilot";

interface Env {
  GH_TOKEN: string;
  SANDBOX_ENABLE_INTERNET?: string;
  Sandbox: DurableObjectNamespace<Sandbox>;
}

export class Sandbox extends BaseSandbox<Env> {
  interceptHttps = true;
  allowedHosts = COPILOT_ALLOWED_HOSTS;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx as DurableObjectState<Record<string, never>>, env);
    // Enable internet for local dev (DNS resolution), restrict in production
    this.enableInternet = env.SANDBOX_ENABLE_INTERNET === "true";
  }
}

const json = (body: unknown, init?: ResponseInit): Response =>
  Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers
    }
  });

const text = (body: string, init?: ResponseInit): Response =>
  new Response(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...init?.headers
    }
  });

function commandExceptionResponse(stage: string, error: unknown): Response {
  const message = error instanceof Error ? error.message : "command failed";
  const timeout = message.match(/Command timeout after (\d+)ms/);
  if (timeout) {
    return json(
      {
        success: false,
        stage,
        error: `Command timeout after ${timeout[1]}ms`
      },
      { status: 504 }
    );
  }

  return json(
    {
      success: false,
      stage,
      error: error instanceof Error ? error.name : "CommandError"
    },
    { status: 502 }
  );
}

async function checkoutRepo(
  sandbox: Sandbox,
  context: RunContext,
  env: Env
): Promise<CommandResult> {
  return sandbox.exec(buildCheckoutCommand(context), { env: copilotEnv(env), timeout: 120000 });
}

async function runBatch(request: Request, env: Env): Promise<Response> {
  const context = await buildRunContext(request);
  const sandbox = getSandbox(env.Sandbox, context.sandboxId);
  let checkout: CommandResult;
  try {
    checkout = await checkoutRepo(sandbox, context, env);
  } catch (error) {
    return commandExceptionResponse("checkout", error);
  }
  if (!checkout.success) {
    return json(
      {
        success: false,
        stage: "checkout",
        exitCode: checkout.exitCode,
        logs: commandOutput(checkout)
      },
      { status: 502 }
    );
  }

  let copilot: CommandResult;
  try {
    copilot = await sandbox.exec(buildCopilotCommand(context, false), {
      env: copilotEnv(env),
      timeout: 300000
    });
  } catch (error) {
    return commandExceptionResponse("copilot", error);
  }

  let diff: CommandResult;
  try {
    diff = await sandbox.exec(`git -C ${shellQuote(context.targetDir)} diff -- .`, {
      env: copilotEnv(env),
      timeout: 30000
    });
  } catch (error) {
    return commandExceptionResponse("diff", error);
  }

  return json(
    {
      success: copilot.success,
      exitCode: copilot.exitCode,
      logs: commandOutput(copilot),
      stderr: copilot.stderr,
      diff: commandOutput(diff)
    },
    { status: copilot.success ? 200 : 502 }
  );
}

async function runStream(request: Request, env: Env): Promise<Response> {
  const context = await buildRunContext(request);
  const sandbox = getSandbox(env.Sandbox, context.sandboxId);
  let checkout: CommandResult;
  try {
    checkout = await checkoutRepo(sandbox, context, env);
  } catch (error) {
    return commandExceptionResponse("checkout", error);
  }
  if (!checkout.success) {
    return json(
      {
        success: false,
        stage: "checkout",
        exitCode: checkout.exitCode,
        logs: commandOutput(checkout)
      },
      { status: 502 }
    );
  }

  let stream: ReadableStream;
  try {
    stream = await sandbox.execStream(buildCopilotCommand(context, true), {
      env: copilotEnv(env),
      timeout: 300000
    });
  } catch (error) {
    return commandExceptionResponse("copilot", error);
  }

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Content-Type": "text/event-stream"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return text("method not allowed", { status: 405 });
    }

    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/") {
        return await runBatch(request, env);
      }
      if (pathname === "/stream") {
        return await runStream(request, env);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid request";
      return json({ success: false, error: message }, { status: 400 });
    }

    return text("not found", { status: 404 });
  }
};