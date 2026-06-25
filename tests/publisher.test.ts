import { describe, it, expect, vi } from "vitest";
import { PublishToolkit } from "../src/publish/publisher.js";

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
});
