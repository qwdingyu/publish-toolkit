/**
 * @usethink/publish-toolkit — 发布引擎
 *
 * 负责 npm 包的完整发布流程：
 *   1. 验证参数与环境
 *   2. git 工作区检查
 *   3. 版本号已发布检查
 *   4. 构建（prepack / build）
 *   5. 临时 .npmrc 认证配置
 *   6. npm publish
 *
 * 对应原 scripts/publish-package.mjs 的核心逻辑。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== 配置接口 =====

export interface PublishOptions {
  /** 包目录（默认: 当前目录） */
  packageDir?: string;
  /** 目标 registry（默认: https://registry.npmjs.org/） */
  registry?: string;
  /** Dry-run 模式，只预览不发布 */
  dryRun?: boolean;
  /** dist-tag（默认: latest） */
  tag?: string;
  /** OTP 二次验证码 */
  otp?: string;
  /** 发布访问级别（public | restricted） */
  access?: string;
  /** 跳过 git 工作区检查 */
  skipGitCheck?: boolean;
  /** 跳过版本号已发布检查 */
  skipVersionCheck?: boolean;
  /** 详细日志 */
  verbose?: boolean;
  /** 发布命令使用的包管理器。默认 npm；auto 只按项目元数据判断，不按全局命令是否存在判断。 */
  packageManager?: PackageManager;
}

export interface PublishResult {
  success: boolean;
  packageName: string;
  version: string;
  dryRun: boolean;
  message: string;
}

// ===== 工具函数 =====

export type PackageManager = "npm" | "pnpm" | "auto";

interface RunOptions {
  verbose?: boolean;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export function isPackageManager(value: string): value is PackageManager {
  return value === "npm" || value === "pnpm" || value === "auto";
}

function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args].join(" ");
}

function run(bin: string, args: string[], cwd: string, opts?: RunOptions): string {
  const options = { cwd, encoding: "utf-8" as const, timeout: 30_000, ...opts };
  if (opts?.verbose) console.log(`  $ ${formatCommand(bin, args)}`);
  try {
    const stdout = execFileSync(bin, args, {
      ...options,
      stdio: "pipe",
      env: { ...process.env, ...opts?.env },
    });
    const out = (stdout || "").toString().trim();
    if (opts?.verbose && out) console.log(`  => ${out}`);
    return out;
  } catch (err) {
    const execErr = err as Error & { status?: number; stderr?: Buffer; stdout?: Buffer };
    const stderr = (execErr.stderr || execErr.stdout || Buffer.from("")).toString("utf-8").trim();
    throw new Error(stderr || `Command failed: ${formatCommand(bin, args)} (exit ${execErr.status ?? 1})`);
  }
}

function tryRun(bin: string, args: string[], cwd: string, opts?: RunOptions): CommandResult {
  try {
    const stdout = run(bin, args, cwd, opts);
    return { success: true, stdout, stderr: "", code: 0 };
  } catch (err) {
    return { success: false, stdout: "", stderr: (err as Error).message, code: 1 };
  }
}

function registryHost(registry: string): string {
  try {
    const u = new URL(registry);
    return `//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "//registry.npmjs.org";
  }
}

function resolvePackageManager(
  pkgDir: string,
  pkg: { packageManager?: string },
  configured: PackageManager
): { bin: "npm" | "pnpm"; reason: string } {
  if (configured === "npm" || configured === "pnpm") {
    return { bin: configured, reason: "显式配置" };
  }

  if (pkg.packageManager?.startsWith("pnpm@")) {
    return { bin: "pnpm", reason: "package.json packageManager" };
  }

  if (existsSync(resolve(pkgDir, "pnpm-lock.yaml")) && !existsSync(resolve(pkgDir, "package-lock.json"))) {
    return { bin: "pnpm", reason: "pnpm-lock.yaml" };
  }

  return { bin: "npm", reason: "auto 默认" };
}

const log = (msg: string) => console.log(`[publish] ${msg}`);
const warn = (msg: string) => console.warn(`[publish ⚠️] ${msg}`);
const error = (msg: string) => console.error(`[publish ❌] ${msg}`);

// ===== .npmrc 安全管理 =====

let _rcDir: string | null = null;

function cleanupNpmrc() {
  if (!_rcDir) return;
  try { rmSync(_rcDir, { recursive: true, force: true }); } catch {}
  _rcDir = null;
}

// ===== 发布引擎 =====

export class PublishToolkit {
  private options: Required<PublishOptions>;

  constructor(options: PublishOptions = {}) {
    const packageManager = options.packageManager ?? "npm";
    if (!isPackageManager(packageManager)) {
      throw new TypeError(`无效 packageManager: ${packageManager}`);
    }

    this.options = {
      packageDir: options.packageDir ?? process.cwd(),
      registry: options.registry ?? "https://registry.npmjs.org/",
      dryRun: options.dryRun ?? false,
      tag: options.tag ?? "latest",
      otp: options.otp ?? "",
      access: options.access ?? "public",
      skipGitCheck: options.skipGitCheck ?? false,
      skipVersionCheck: options.skipVersionCheck ?? false,
      verbose: options.verbose ?? false,
      packageManager,
    };
  }

  async publish(npmToken: string): Promise<PublishResult> {
    const opts = this.options;
    const pkgDir = resolve(opts.packageDir);

    const startedAt = Date.now();
    const stepTimings: { step: string; ms: number }[] = [];

    const startStep = (name: string, extra?: string) => {
      const t = Date.now();
      return { done: (more?: string) => {
        const ms = Date.now() - t;
        stepTimings.push({ step: name, ms });
        const info = more || extra;
        if (info) log(`  ✓ ${name} 完成（${ms}ms） — ${info}`);
        else log(`  ✓ ${name} 完成（${ms}ms）`);
      }};
    };

    console.log("=".repeat(50));
    console.log("  @usethink/publish-toolkit — 发布");
    console.log("=".repeat(50));
    console.log();

    // ---- Step 1: 验证 ----
    log("Step 1: 验证参数");

    if (!opts.dryRun && !npmToken) {
      error("缺少环境变量 NPM_TOKEN");
      return this.fail("", "", "缺少 NPM_TOKEN");
    }
    if (npmToken) {
      log("  ✓ NPM_TOKEN 已设置");
    } else {
      warn("  NPM_TOKEN 未设置（dry-run 模式可继续）");
    }

    if (!existsSync(pkgDir)) {
      error(`包目录不存在: ${pkgDir}`);
      return this.fail("", "", `包目录不存在: ${pkgDir}`);
    }

    const pkgJsonPath = resolve(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      error("未找到 package.json");
      return this.fail("", "", "未找到 package.json");
    }

    let pkg: {
      name: string;
      version: string;
      private?: boolean;
      scripts?: Record<string, string>;
      packageManager?: string;
    };
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    } catch (err) {
      error(`package.json 解析失败: ${(err as Error).message}`);
      return this.fail("", "", "package.json 格式错误");
    }
    if (pkg.private === true) {
      error(`包 "${pkg.name}" 的 "private" 为 true，无法发布`);
      return this.fail("", "", "包为 private，无法发布");
    }

    const pkgName = pkg.name;
    const pkgVersion = pkg.version;
    const packageManager = resolvePackageManager(pkgDir, pkg, opts.packageManager);
    log(`  包名: ${pkgName}`);
    log(`  版本: ${pkgVersion}`);
    log(`  registry: ${opts.registry}`);
    log(`  包管理器: ${packageManager.bin}（${packageManager.reason}）`);
    startStep("验证参数").done();

    // ---- Step 2: git 检查 ----
    if (!opts.skipGitCheck) {
      log("Step 2: 检查 git");
      const gitRootResult = tryRun("git", ["rev-parse", "--show-toplevel"], pkgDir);
      const gitRoot = gitRootResult.success ? gitRootResult.stdout : "";
      if (gitRoot) {
        const statusResult = tryRun("git", ["-C", gitRoot, "status", "--porcelain"], pkgDir);
        if (statusResult.success && statusResult.stdout) {
          error("工作区有未提交的变更:");
          console.error(statusResult.stdout);
          return this.fail(pkgName, pkgVersion, "工作区有未提交的变更");
        }
      }
      startStep("git 检查").done(`git root: ${gitRoot || "(非 git 仓库，已跳过)"}`);
      if (opts.verbose) log(`  git root: ${gitRoot || "(非 git 仓库，已跳过)"}`);
    } else {
      warn("Step 2: 已跳过 git 检查（--no-git-check）");
    }

    // ---- Step 3: 版本检查 ----
    if (!opts.skipVersionCheck) {
      log("Step 3: 检查版本是否已发布");
      // 为网络请求设置更长超时，避免 CI 网络抖动导致误判
      const publishedResult = tryRun(
        "npm",
        ["view", `${pkgName}@${pkgVersion}`, "version", `--registry=${opts.registry}`],
        pkgDir,
        { timeout: 60_000 }
      );
      const publishedVersion = publishedResult.success ? publishedResult.stdout.split("\n").pop()?.trim() : undefined;
      if (publishedVersion === pkgVersion) {
        error(`版本 ${pkgVersion} 已存在！请先 bump 版本号`);
        return this.fail(pkgName, pkgVersion, "版本已存在");
      }
      if (!publishedResult.success && !publishedResult.stderr.includes("E404") && !publishedResult.stderr.includes("404")) {
        error(`版本检查失败: ${publishedResult.stderr || "未知错误"}`);
        return this.fail(pkgName, pkgVersion, "版本检查失败");
      }
      startStep("版本检查", publishedVersion ? `registry 已存在: ${publishedVersion}` : "该版本未发布").done();
      if (opts.verbose) {
        if (!publishedResult.success) {
          log(`  npm view 输出: ${publishedResult.stderr || "(空)"}`);
        } else {
          log(`  npm view 输出: ${publishedResult.stdout || "(空)"}`);
        }
      }
    } else {
      warn("Step 3: 已跳过版本检查（--no-version-check）");
    }

    // ---- Step 4: 构建 ----
    log("Step 4: 构建");
    if (pkg.scripts?.prepack) {
      log("  prepack 脚本已定义（npm publish 自动执行），跳过手动构建");
      startStep("构建", "prepack 已定义").done();
    } else if (pkg.scripts?.build) {
      const npmBin = packageManager.bin;
      if (opts.dryRun) {
        log(`  [dry-run] 将执行构建: ${npmBin} run build`);
        startStep("构建", "dry-run 跳过").done();
      } else {
        if (opts.verbose) log(`  执行构建: ${npmBin} run build`);
        try {
          run(npmBin, ["run", "build"], pkgDir, { verbose: opts.verbose });
          startStep("构建").done();
        } catch (err) {
          // 如果 pnpm 失败，尝试 npm
          if (npmBin === "pnpm") {
            const pnpmErr = (err as Error).message;
            warn(`  pnpm 构建失败: ${pnpmErr}，尝试 npm...`);
            try {
              run("npm", ["run", "build"], pkgDir, { verbose: opts.verbose });
              startStep("构建").done();
            } catch (err2) {
              const npmErr = (err2 as Error).message;
              error(`构建失败: ${npmErr}`);
              return this.fail(pkgName, pkgVersion, `构建失败: ${npmErr}`);
            }
          } else {
            error(`构建失败: ${(err as Error).message}`);
            return this.fail(pkgName, pkgVersion, `构建失败: ${(err as Error).message}`);
          }
        }
      }
    } else {
      warn("  无 build 脚本，跳过构建");
    }

    // ---- Step 5: .npmrc ----
    log("Step 5: 配置认证");
    let publishEnv: NodeJS.ProcessEnv | undefined;
    if (!opts.dryRun) {
      const rcDir = mkdtempSync(join(tmpdir(), "publish-toolkit-"));
      const rcPath = join(rcDir, ".npmrc");
      _rcDir = rcDir;
      writeFileSync(
        rcPath,
        [
          `registry=${opts.registry}`,
          `${registryHost(opts.registry)}/:_authToken=${npmToken}`,
        ].join("\n") + "\n",
        "utf-8"
      );
      publishEnv = { NPM_CONFIG_USERCONFIG: rcPath };
      startStep(".npmrc 配置").done("临时 userconfig");
      if (opts.verbose) log(`  写入临时 userconfig: ${rcPath}`);

      // 注册清理钩子
      process.on("exit", cleanupNpmrc);
      process.on("SIGINT", () => { warn("收到 SIGINT，清理中..."); cleanupNpmrc(); process.exit(130); });
      process.on("SIGTERM", () => { warn("收到 SIGTERM，清理中..."); cleanupNpmrc(); process.exit(143); });
    } else {
      log("  [dry-run] 将写入临时 npm userconfig");
      log(`  [dry-run] registry: ${opts.registry}`);
      log(`  [dry-run] 认证: ${npmToken ? "***（已隐藏）" : "未设置"}`);
      startStep(".npmrc 配置", "dry-run 跳过").done();
    }

    // ---- Step 6: 发布 ----
    log("Step 6: 发布");
    const npmBin = packageManager.bin;
    const pubArgs = [
      "publish",
      `--registry=${opts.registry}`,
      `--access=${opts.access}`,
      `--tag=${opts.tag}`,
    ];
    if (npmBin === "pnpm") pubArgs.push("--no-git-checks");
    if (opts.dryRun) pubArgs.push("--dry-run");
    if (opts.otp) pubArgs.push(`--otp=${opts.otp}`);

    if (opts.dryRun) {
      log(`  [dry-run] 将执行: ${npmBin} ${pubArgs.join(" ")}`);
      log(`  [dry-run] 包名: ${pkgName}`);
      log(`  [dry-run] 版本: ${pkgVersion}`);
      log(`  [dry-run] registry: ${opts.registry}`);
      log(`  [dry-run] tag: ${opts.tag}`);
      log(`  [dry-run] access: ${opts.access}`);
      log(`  [dry-run] cwd: ${pkgDir}`);
      log(`  [dry-run] 注：不会实际发布，也不会写入 .npmrc`);
    } else {
      log(`  执行: ${npmBin} ${pubArgs.join(" ")}`);
    }

    if (!opts.dryRun) {
      try {
        run(npmBin, pubArgs, pkgDir, { verbose: opts.verbose, env: publishEnv });
        log(`  ✓ 发布成功！${pkgName}@${pkgVersion}`);
        console.log(`     https://www.npmjs.com/package/${pkgName}`);
      } catch (err) {
        const msg = (err as Error).message || "";
        error(`发布失败: ${msg}`);
        if (msg.includes("404")) error("  提示: 404 → scoped 包需要 --access public");
        if (msg.includes("403")) error("  提示: 403 → 权限不足，检查 NPM_TOKEN");
        if (msg.includes("401")) error("  提示: 401 → 认证失败，检查 NPM_TOKEN");
        if (msg.includes("EOTP")) error("  提示: 需要 OTP → 使用 --otp <code>");
        return this.fail(pkgName, pkgVersion, `发布失败: ${msg}`);
      }
    }

    // ---- 完成 ----
    console.log();
    console.log("=".repeat(50));
    const totalMs = Date.now() - startedAt;
    if (opts.dryRun) {
      log(`Dry-run 完成（${totalMs}ms）`);
      log(`  即将发布: ${pkgName}@${pkgVersion}`);
      log(`  目标: ${opts.registry}`);
      log(`  tag: ${opts.tag}`);
    } else {
      log(`🎉 发布完成: ${pkgName}@${pkgVersion}（${totalMs}ms）`);
    }
    console.log("=".repeat(50));
    if (opts.verbose) {
      console.log();
      console.log("步骤耗时:");
      stepTimings.forEach((s) => {
        console.log(`  - ${s.step}: ${s.ms}ms`);
      });
    }

    return {
      success: true,
      packageName: pkgName,
      version: pkgVersion,
      dryRun: opts.dryRun,
      message: opts.dryRun ? "Dry-run 成功" : `发布成功: ${pkgName}@${pkgVersion}`,
    };
  }

  private fail(pkgName: string, version: string, message: string): PublishResult {
    return { success: false, packageName: pkgName, version, dryRun: this.options.dryRun, message };
  }
}
