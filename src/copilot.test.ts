import { describe, expect, it } from "vitest";
import {
  buildCheckoutCommand,
  buildCopilotCommand,
  buildCopilotPrompt,
  buildRunContext,
  commandOutput,
  copilotEnv,
  MAX_PRD_PATH_LENGTH,
  MAX_PRD_TEXT_LENGTH,
  MAX_SKILL_PATHS,
  MAX_TASK_LENGTH,
  normalizeModel,
  normalizePrdPath,
  normalizePrdText,
  normalizeRepo,
  normalizeSkillPaths,
  normalizeTask,
  shellQuote,
  stableSandboxId,
  type RunContext
} from "./copilot";

const context: RunContext = {
  repo: "https://github.com/cloudflare/agents.git",
  task: "Fix Bob's failing test",
  model: "gpt-5.2",
  sandboxId: "ignored",
  targetDir: "agents"
};

describe("normalizeRepo", () => {
  it("normalizes GitHub repository URLs to clone URLs", () => {
    expect(normalizeRepo(" https://github.com/cloudflare/agents ")).toBe(
      "https://github.com/cloudflare/agents.git"
    );
    expect(normalizeRepo("https://github.com/cloudflare/agents.git")).toBe(
      "https://github.com/cloudflare/agents.git"
    );
  });

  it("rejects non-GitHub or non-repository URLs", () => {
    expect(() => normalizeRepo("http://github.com/cloudflare/agents")).toThrow(
      "https://github.com"
    );
    expect(() => normalizeRepo("https://example.com/cloudflare/agents")).toThrow(
      "https://github.com"
    );
    expect(() => normalizeRepo("https://github.com/cloudflare/agents/issues/1")).toThrow(
      "owner/repo"
    );
  });

  it("rejects unsupported owner or repo path segments", () => {
    expect(() => normalizeRepo("https://github.com/.hidden/agents")).toThrow(
      "unsupported characters"
    );
    expect(() => normalizeRepo("https://github.com/cloudflare/repo%20name")).toThrow(
      "unsupported characters"
    );
  });
});

describe("normalizeTask", () => {
  it("trims task text", () => {
    expect(normalizeTask("  fix the typo  ")).toBe("fix the typo");
  });

  it("rejects empty and oversized tasks", () => {
    expect(() => normalizeTask("   ")).toThrow("must not be empty");
    expect(() => normalizeTask("x".repeat(MAX_TASK_LENGTH + 1))).toThrow("characters or fewer");
  });
});

describe("normalizeModel", () => {
  it("normalizes optional model names", () => {
    expect(normalizeModel(undefined)).toBeUndefined();
    expect(normalizeModel("  ")).toBeUndefined();
    expect(normalizeModel(" gpt-5.2 ")).toBe("gpt-5.2");
  });

  it("rejects unsafe model values", () => {
    expect(() => normalizeModel("gpt 5")).toThrow("unsupported characters");
    expect(() => normalizeModel(["gpt-5"])).toThrow("model must be a string");
  });
});

describe("normalizePrdText", () => {
  it("normalizes optional inline PRD text", () => {
    expect(normalizePrdText(undefined)).toBeUndefined();
    expect(normalizePrdText("  The product must support PRDs.  ")).toBe(
      "The product must support PRDs."
    );
  });

  it("rejects invalid inline PRD text", () => {
    expect(() => normalizePrdText("   ")).toThrow("must not be empty");
    expect(() => normalizePrdText("x".repeat(MAX_PRD_TEXT_LENGTH + 1))).toThrow(
      "characters or fewer"
    );
    expect(() => normalizePrdText({ title: "PRD" })).toThrow("prdText must be a string");
  });
});

describe("normalizePrdPath", () => {
  it("normalizes optional repo-relative PRD paths", () => {
    expect(normalizePrdPath(undefined)).toBeUndefined();
    expect(normalizePrdPath(" docs/prd.md ")).toBe("docs/prd.md");
  });

  it("rejects unsafe PRD paths", () => {
    expect(() => normalizePrdPath("   ")).toThrow("must not be empty");
    expect(() => normalizePrdPath("/docs/prd.md")).toThrow("repo-relative");
    expect(() => normalizePrdPath("docs\\prd.md")).toThrow("forward slashes");
    expect(() => normalizePrdPath("../prd.md")).toThrow("repo-relative file path");
    expect(() => normalizePrdPath("docs/product prd.md")).toThrow("unsupported characters");
    expect(() => normalizePrdPath("x".repeat(MAX_PRD_PATH_LENGTH + 1))).toThrow(
      "characters or fewer"
    );
  });
});

describe("normalizeSkillPaths", () => {
  it("normalizes optional repo-relative skill paths", () => {
    expect(normalizeSkillPaths(undefined)).toBeUndefined();
    expect(normalizeSkillPaths([])).toBeUndefined();
    expect(normalizeSkillPaths([" .cpltbox/skills/wp-rest-api/SKILL.md "])).toEqual([
      ".cpltbox/skills/wp-rest-api/SKILL.md"
    ]);
  });

  it("rejects invalid skill paths", () => {
    expect(() => normalizeSkillPaths("docs/skills/tdd/SKILL.md")).toThrow(
      "skillPaths must be an array"
    );
    expect(() => normalizeSkillPaths(["../skills/tdd/SKILL.md"])).toThrow(
      "skillPaths item must be a repo-relative file path"
    );
    expect(() => normalizeSkillPaths(["docs\\skills\\tdd\\SKILL.md"])).toThrow(
      "skillPaths item must use forward slashes"
    );
    expect(() => normalizeSkillPaths([42])).toThrow("skillPaths item must be a string");
    expect(() => normalizeSkillPaths(Array.from({ length: MAX_SKILL_PATHS + 1 }, () => "docs/skills/tdd/SKILL.md"))).toThrow(
      "skillPaths must contain"
    );
  });
});

describe("command helpers", () => {
  it("shell-quotes single quotes safely", () => {
    expect(shellQuote("Bob's repo")).toBe("'Bob'\\''s repo'");
  });

  it("selects stderr for failed commands when present", () => {
    expect(commandOutput({ success: true, stdout: "ok", stderr: "warn" })).toBe("ok");
    expect(commandOutput({ success: false, stdout: "out", stderr: "err" })).toBe("err");
    expect(commandOutput({ success: false, stdout: "out", stderr: "" })).toBe("out");
  });

  it("builds checkout command with token expansion and quoted dynamic values", () => {
    expect(buildCheckoutCommand(context)).toBe(
      "rm -rf 'agents' && git clone --depth=1 \"https://x-access-token:$GH_TOKEN@github.com/cloudflare/agents.git\" 'agents'"
    );
  });

  it("builds batch Copilot command", () => {
    expect(buildCopilotCommand(context, false)).toBe(
      "copilot -C 'agents' -p 'Fix Bob'\\''s failing test' --allow-all --no-color --no-remote --no-auto-update --secret-env-vars=GH_TOKEN,GITHUB_TOKEN --stream off --silent --model 'gpt-5.2'"
    );
  });

  it("builds streaming Copilot command without silent mode", () => {
    expect(buildCopilotCommand(context, true)).toBe(
      "copilot -C 'agents' -p 'Fix Bob'\\''s failing test' --allow-all --no-color --no-remote --no-auto-update --secret-env-vars=GH_TOKEN,GITHUB_TOKEN --stream on --model 'gpt-5.2'"
    );
  });

  it("builds prompts with inline and repo PRD context", () => {
    expect(buildCopilotPrompt(context)).toBe("Fix Bob's failing test");
    expect(
      buildCopilotPrompt({
        ...context,
        prdPath: "docs/prd.md",
        prdText: "Users need a guided setup flow."
      })
    ).toBe(
      [
        "Fix Bob's failing test",
        "PRD context:\nRepo-relative PRD path: docs/prd.md\nRead this file after checkout and use it as product requirements context.\n\nInline PRD:\nUsers need a guided setup flow."
      ].join("\n\n")
    );
  });

  it("builds prompts with repo skill paths", () => {
    expect(
      buildCopilotPrompt({
        ...context,
        skillPaths: [".cpltbox/skills/wp-rest-api/SKILL.md", "docs/skills/tdd/SKILL.md"]
      })
    ).toBe(
      [
        "Fix Bob's failing test",
        "Skill context:\nRepo-relative skill paths:\n- .cpltbox/skills/wp-rest-api/SKILL.md\n- docs/skills/tdd/SKILL.md\nRead these files after checkout and follow their instructions when relevant to the task."
      ].join("\n\n")
    );
  });

  it("includes PRD context in Copilot commands", () => {
    const command = buildCopilotCommand(
      {
        ...context,
        prdPath: "docs/prd.md",
        prdText: "Ship Bob's guided setup."
      },
      false
    );

    expect(command).toContain("PRD context:");
    expect(command).toContain("Repo-relative PRD path: docs/prd.md");
    expect(command).toContain("Inline PRD:");
    expect(command).toContain("Ship Bob'\\''s guided setup.");
    expect(command).toContain("--stream off --silent");
  });
});

describe("copilotEnv", () => {
  it("passes GitHub token through expected env names", () => {
    expect(copilotEnv({ GH_TOKEN: "token" })).toMatchObject({
      CI: "1",
      COPILOT_ALLOW_ALL: "1",
      GH_TOKEN: "token",
      GITHUB_TOKEN: "token",
      NO_COLOR: "1"
    });
  });

  it("requires GH_TOKEN", () => {
    expect(() => copilotEnv({ GH_TOKEN: "" })).toThrow("GH_TOKEN is not configured");
  });
});

describe("run context", () => {
  it("builds stable request context", async () => {
    const request = new Request("https://worker.test/", {
      method: "POST",
      body: JSON.stringify({
        repo: "https://github.com/cloudflare/agents",
        task: "Fix README",
        model: "gpt-5.2",
        prdText: "  README must explain setup.  ",
        prdPath: " docs/prd.md ",
        skillPaths: [" .cpltbox/skills/tdd/SKILL.md "]
      })
    });

    await expect(buildRunContext(request)).resolves.toEqual({
      repo: "https://github.com/cloudflare/agents.git",
      task: "Fix README",
      prdText: "README must explain setup.",
      prdPath: "docs/prd.md",
      skillPaths: [".cpltbox/skills/tdd/SKILL.md"],
      model: "gpt-5.2",
      sandboxId: await stableSandboxId("https://github.com/cloudflare/agents.git"),
      targetDir: "agents"
    });
  });

  it("generates deterministic 12-character sandbox ids", async () => {
    await expect(stableSandboxId("https://github.com/cloudflare/agents.git")).resolves.toMatch(
      /^[a-f0-9]{12}$/
    );
    await expect(stableSandboxId("same")).resolves.toBe(await stableSandboxId("same"));
  });
});