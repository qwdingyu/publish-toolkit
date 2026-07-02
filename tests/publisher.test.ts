import { describe, it, expect, vi } from "vitest";
import { PublishToolkit } from "../src/publish/publisher.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTempPackage(packageJson: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "publish-toolkit-pkg-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(packageJson, null, 2));
  return dir;
}

async function collectLogs(fn: () => Promise<void>) {
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    logs.push(String(msg ?? ""));
  });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg?: unknown) => {
    logs.push(String(msg ?? ""));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
    logs.push(String(msg ?? ""));
  });

  try {
    await fn();
  } finally {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return logs.join("\n");
}

describe("PublishToolkit", () => {
  it("应该正确初始化默认选项", () => {
    const toolkit = new PublishToolkit();
    expect(toolkit).toBeDefined();
  });

  it("应该接受自定义选项", () => {
    const toolkit = new PublishToolkit({
      packageDir: "/tmp/test-pkg",
      registry: "https://registry.npmjs.org/",
      dryRun: true,
      tag: "beta",
      verbose: true,
    });
    expect(toolkit).toBeDefined();
  });

  it("应该拒绝无效 packageManager", () => {
    expect(() => new PublishToolkit({
      packageManager: "yarn" as never,
    })).toThrow("无效 packageManager");
  });

  it("dry-run 模式下缺少 NPM_TOKEN 应该继续并返回成功", async () => {
    const toolkit = new PublishToolkit({
      packageDir: process.cwd(),
      dryRun: true,
      skipGitCheck: true,
      skipVersionCheck: true,
    });

    const result = await toolkit.publish("");
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain("Dry-run 成功");
  });

  it("dry-run 模式下提供 NPM_TOKEN 且跳过检查应该返回成功", async () => {
    const toolkit = new PublishToolkit({
      packageDir: process.cwd(),
      dryRun: true,
      skipGitCheck: true,
      skipVersionCheck: true,
      verbose: false,
    });

    const result = await toolkit.publish("npm_test_token_xxx");
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain("Dry-run 成功");
  });

  it("默认使用 npm，不能因为环境中存在 pnpm 就切换发布命令", async () => {
    const packageDir = createTempPackage({
      name: "@usethink/test-default-npm",
      version: "0.0.0",
      scripts: { build: "echo build" },
    });

    try {
      const toolkit = new PublishToolkit({
        packageDir,
        dryRun: true,
        skipGitCheck: true,
        skipVersionCheck: true,
      });

      const output = await collectLogs(async () => {
        const result = await toolkit.publish("");
        expect(result.success).toBe(true);
      });

      expect(output).toContain("[dry-run] 将执行构建: npm run build");
      expect(output).toContain("[dry-run] 将执行: npm publish");
      expect(output).not.toContain("[dry-run] 将执行: pnpm publish");
    } finally {
      rmSync(packageDir, { recursive: true, force: true });
    }
  });

  it("显式指定 pnpm 时才使用 pnpm publish", async () => {
    const packageDir = createTempPackage({
      name: "@usethink/test-explicit-pnpm",
      version: "0.0.0",
      scripts: { build: "echo build" },
    });

    try {
      const toolkit = new PublishToolkit({
        packageDir,
        dryRun: true,
        skipGitCheck: true,
        skipVersionCheck: true,
        packageManager: "pnpm",
      });

      const output = await collectLogs(async () => {
        const result = await toolkit.publish("");
        expect(result.success).toBe(true);
      });

      expect(output).toContain("[dry-run] 将执行构建: pnpm run build");
      expect(output).toContain("[dry-run] 将执行: pnpm publish");
      expect(output).toContain("--no-git-checks");
    } finally {
      rmSync(packageDir, { recursive: true, force: true });
    }
  });

  it("auto 模式只根据项目元数据选择 pnpm", async () => {
    const packageDir = createTempPackage({
      name: "@usethink/test-auto-pnpm",
      version: "0.0.0",
      packageManager: "pnpm@11.9.0",
      scripts: { build: "echo build" },
    });

    try {
      const toolkit = new PublishToolkit({
        packageDir,
        dryRun: true,
        skipGitCheck: true,
        skipVersionCheck: true,
        packageManager: "auto",
      });

      const output = await collectLogs(async () => {
        const result = await toolkit.publish("");
        expect(result.success).toBe(true);
      });

      expect(output).toContain("包管理器: pnpm（package.json packageManager）");
      expect(output).toContain("[dry-run] 将执行: pnpm publish");
    } finally {
      rmSync(packageDir, { recursive: true, force: true });
    }
  });
});
