import { beforeEach, describe, expect, it, vi } from "vitest";
import { stableSandboxId } from "./copilot";

const sandboxMocks = vi.hoisted(() => ({
  exec: vi.fn(),
  execStream: vi.fn(),
  getSandbox: vi.fn()
}));

vi.mock("@cloudflare/sandbox", () => ({
  Sandbox: class {},
  getSandbox: sandboxMocks.getSandbox
}));

const { default: worker } = await import("./index");

const env = {
  GH_TOKEN: "test-token",
  Sandbox: {}
} as Parameters<typeof worker.fetch>[1];

const post = (path: string, body: unknown): Request =>
  new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

describe("Worker acceptance", () => {
  beforeEach(() => {
    sandboxMocks.exec.mockReset();
    sandboxMocks.execStream.mockReset();
    sandboxMocks.getSandbox.mockReset();
    sandboxMocks.getSandbox.mockReturnValue({
      exec: sandboxMocks.exec,
      execStream: sandboxMocks.execStream
    });
  });

  it("runs checkout, Copilot, and diff for a batch request", async () => {
    sandboxMocks.exec
      .mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ success: true, stdout: "copilot done", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ success: true, stdout: "diff --git a/README.md b/README.md", stderr: "", exitCode: 0 });

    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README",
        model: "gpt-5.2"
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      exitCode: 0,
      logs: "copilot done",
      stderr: "",
      diff: "diff --git a/README.md b/README.md"
    });
    expect(response.status).toBe(200);
    expect(sandboxMocks.getSandbox).toHaveBeenCalledWith(
      env.Sandbox,
      await stableSandboxId("https://github.com/cloudflare/agents.git")
    );
    expect(sandboxMocks.exec).toHaveBeenCalledTimes(3);
    expect(sandboxMocks.exec.mock.calls[0][0]).toContain("git");
    expect(sandboxMocks.exec.mock.calls[1][0]).toContain("copilot");
    expect(sandboxMocks.exec.mock.calls[2][0]).toBe("git -C 'agents' diff origin/HEAD -- .");
    expect(sandboxMocks.exec.mock.calls[1][1]).toMatchObject({
      env: {
        GH_TOKEN: "test-token",
        GITHUB_TOKEN: "test-token"
      },
      timeout: 300000
    });
  });

  it("passes inline PRD context into a batch Copilot prompt", async () => {
    sandboxMocks.exec
      .mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ success: true, stdout: "copilot done", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ success: true, stdout: "", stderr: "", exitCode: 0 });

    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Implement the onboarding flow",
        prdText: "Users must complete setup in under five minutes."
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(sandboxMocks.exec.mock.calls[1][0]).toContain("PRD context:");
    expect(sandboxMocks.exec.mock.calls[1][0]).toContain("Inline PRD:");
    expect(sandboxMocks.exec.mock.calls[1][0]).toContain(
      "Users must complete setup in under five minutes."
    );
  });

  it("returns checkout failures before invoking Copilot", async () => {
    sandboxMocks.exec.mockResolvedValueOnce({
      success: false,
      stdout: "",
      stderr: "repository not found",
      exitCode: 128
    });

    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README"
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      stage: "checkout",
      exitCode: 128,
      logs: "repository not found"
    });
    expect(response.status).toBe(502);
    expect(sandboxMocks.exec).toHaveBeenCalledTimes(1);
    expect(sandboxMocks.execStream).not.toHaveBeenCalled();
  });

  it("returns timeout responses when batch Copilot execution times out", async () => {
    sandboxMocks.exec
      .mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 })
      .mockRejectedValueOnce(new Error("Failed to execute command 'copilot ...': Command timeout after 300000ms"));

    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README"
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      stage: "copilot",
      error: "Command timeout after 300000ms"
    });
    expect(response.status).toBe(504);
    expect(sandboxMocks.exec).toHaveBeenCalledTimes(2);
  });

  it("streams Copilot output for stream requests", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
        controller.close();
      }
    });
    sandboxMocks.exec.mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 });
    sandboxMocks.execStream.mockResolvedValueOnce(stream);

    const response = await worker.fetch(
      post("/stream", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README"
      }),
      env
    );

    await expect(response.text()).resolves.toBe("data: hello\n\n");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(sandboxMocks.execStream).toHaveBeenCalledTimes(1);
    expect(sandboxMocks.execStream.mock.calls[0][0]).toContain("--stream on");
  });

  it("returns timeout responses when streaming Copilot execution times out before opening", async () => {
    sandboxMocks.exec.mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 });
    sandboxMocks.execStream.mockRejectedValueOnce(
      new Error("Failed to execute command 'copilot ...': Command timeout after 300000ms")
    );

    const response = await worker.fetch(
      post("/stream", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README"
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      stage: "copilot",
      error: "Command timeout after 300000ms"
    });
    expect(response.status).toBe(504);
  });

  it("passes repo PRD paths into streaming Copilot prompts", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: done\n\n"));
        controller.close();
      }
    });
    sandboxMocks.exec.mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 });
    sandboxMocks.execStream.mockResolvedValueOnce(stream);

    const response = await worker.fetch(
      post("/stream", {
        repo: "https://github.com/cloudflare/agents",
        task: "Implement the dashboard",
        prdPath: "docs/prd.md"
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(sandboxMocks.execStream.mock.calls[0][0]).toContain("--stream on");
    expect(sandboxMocks.execStream.mock.calls[0][0]).toContain(
      "Repo-relative PRD path: docs/prd.md"
    );
  });

  it("passes skill paths into streaming Copilot prompts", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: done\n\n"));
        controller.close();
      }
    });
    sandboxMocks.exec.mockResolvedValueOnce({ success: true, stdout: "checked out", stderr: "", exitCode: 0 });
    sandboxMocks.execStream.mockResolvedValueOnce(stream);

    const response = await worker.fetch(
      post("/stream", {
        repo: "https://github.com/cloudflare/agents",
        task: "Implement the endpoint",
        skillPaths: [".cpltbox/skills/wp-rest-api/SKILL.md"]
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(sandboxMocks.execStream.mock.calls[0][0]).toContain("Skill context:");
    expect(sandboxMocks.execStream.mock.calls[0][0]).toContain(
      ".cpltbox/skills/wp-rest-api/SKILL.md"
    );
  });

  it("rejects invalid PRD input before checkout", async () => {
    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README",
        prdPath: "../prd.md"
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "prdPath must be a repo-relative file path"
    });
    expect(response.status).toBe(400);
    expect(sandboxMocks.getSandbox).not.toHaveBeenCalled();
    expect(sandboxMocks.exec).not.toHaveBeenCalled();
  });

  it("rejects invalid skill paths before checkout", async () => {
    const response = await worker.fetch(
      post("/", {
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README",
        skillPaths: ["../skills/tdd/SKILL.md"]
      }),
      env
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "skillPaths item must be a repo-relative file path"
    });
    expect(response.status).toBe(400);
    expect(sandboxMocks.getSandbox).not.toHaveBeenCalled();
    expect(sandboxMocks.exec).not.toHaveBeenCalled();
  });
});