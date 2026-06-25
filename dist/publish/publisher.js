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
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function run(cmd, cwd, opts) {
    const options = { cwd, encoding: "utf-8", timeout: 30_000, ...opts };
    if (opts?.verbose)
        console.log(`  $ ${cmd}`);
    try {
        const stdout = execSync(cmd, { ...options, stdio: "pipe" });
        const out = (stdout || "").toString().trim();
        if (opts?.verbose && out)
            console.log(`  => ${out}`);
        return out;
    }
    catch (err) {
        const execErr = err;
        const stderr = (execErr.stderr || execErr.stdout || Buffer.from("")).toString("utf-8").trim();
        throw new Error(stderr || `Command failed: ${cmd} (exit ${execErr.status ?? 1})`);
    }
}
function tryRun(cmd, cwd, opts) {
    try {
        const stdout = run(cmd, cwd, opts);
        return { success: true, stdout, stderr: "", code: 0 };
    }
    catch (err) {
        const execErr = err;
        const stderr = (execErr.stderr || execErr.stdout || Buffer.from("")).toString("utf-8").trim();
        return { success: false, stdout: "", stderr, code: execErr.status ?? 1 };
    }
}
function registryHost(registry) {
    try {
        const u = new URL(registry);
        return `//${u.host}${u.pathname.replace(/\/+$/, "")}`;
    }
    catch {
        return "//registry.npmjs.org";
    }
}
function detectPnpm(cwd) {
    // 跨平台检测 pnpm：Unix 用 which/command -v，Windows 用 where
    const isWin = process.platform === "win32";
    const cmd = isWin ? "where pnpm" : "command -v pnpm";
    const result = tryRun(cmd, cwd);
    return result.success && result.stdout.trim().length > 0;
}
const log = (msg) => console.log(`[publish] ${msg}`);
const warn = (msg) => console.warn(`[publish ⚠️] ${msg}`);
const error = (msg) => console.error(`[publish ❌] ${msg}`);
// ===== .npmrc 安全管理 =====
let _rcPath = null;
let _rcBackup = null;
function cleanupNpmrc() {
    if (!_rcPath)
        return;
    try {
        unlinkSync(_rcPath);
    }
    catch { }
    if (_rcBackup !== null)
        writeFileSync(_rcPath, _rcBackup, "utf-8");
}
// ===== 发布引擎 =====
export class PublishToolkit {
    options;
    constructor(options = {}) {
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
        };
    }
    async publish(npmToken) {
        const opts = this.options;
        const pkgDir = resolve(opts.packageDir);
        const startedAt = Date.now();
        const stepTimings = [];
        const startStep = (name, extra) => {
            const t = Date.now();
            return { done: (more) => {
                    const ms = Date.now() - t;
                    stepTimings.push({ step: name, ms });
                    const info = more || extra;
                    if (info)
                        log(`  ✓ ${name} 完成（${ms}ms） — ${info}`);
                    else
                        log(`  ✓ ${name} 完成（${ms}ms）`);
                } };
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
        }
        else {
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
        let pkg;
        try {
            pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        }
        catch (err) {
            error(`package.json 解析失败: ${err.message}`);
            return this.fail("", "", "package.json 格式错误");
        }
        if (pkg.private === true) {
            error(`包 "${pkg.name}" 的 "private" 为 true，无法发布`);
            return this.fail("", "", "包为 private，无法发布");
        }
        const pkgName = pkg.name;
        const pkgVersion = pkg.version;
        log(`  包名: ${pkgName}`);
        log(`  版本: ${pkgVersion}`);
        log(`  registry: ${opts.registry}`);
        startStep("验证参数").done();
        // ---- Step 2: git 检查 ----
        if (!opts.skipGitCheck) {
            log("Step 2: 检查 git");
            const gitRootResult = tryRun("git rev-parse --show-toplevel 2>/dev/null", pkgDir);
            const gitRoot = gitRootResult.success ? gitRootResult.stdout : "";
            if (gitRoot) {
                const statusResult = tryRun(`git -C "${gitRoot}" status --porcelain`, pkgDir);
                if (statusResult.success && statusResult.stdout) {
                    error("工作区有未提交的变更:");
                    console.error(statusResult.stdout);
                    return this.fail(pkgName, pkgVersion, "工作区有未提交的变更");
                }
            }
            startStep("git 检查").done(`git root: ${gitRoot || "(非 git 仓库，已跳过)"}`);
            if (opts.verbose)
                log(`  git root: ${gitRoot || "(非 git 仓库，已跳过)"}`);
        }
        else {
            warn("Step 2: 已跳过 git 检查（--no-git-check）");
        }
        // ---- Step 3: 版本检查 ----
        if (!opts.skipVersionCheck) {
            log("Step 3: 检查版本是否已发布");
            // 为网络请求设置更长超时，避免 CI 网络抖动导致误判
            const publishedResult = tryRun(`npm view ${pkgName} version --registry=${opts.registry} 2>/dev/null || true`, pkgDir, { timeout: 60_000 });
            const latestVer = publishedResult.success ? publishedResult.stdout.split("\n").pop()?.trim() : undefined;
            if (latestVer === pkgVersion) {
                error(`版本 ${pkgVersion} 已存在！请先 bump 版本号`);
                return this.fail(pkgName, pkgVersion, "版本已存在");
            }
            startStep("版本检查", latestVer ? `registry 最新: ${latestVer}` : "首次发布").done();
            if (opts.verbose) {
                if (!publishedResult.success) {
                    log(`  npm view 失败: ${publishedResult.stderr || "未知错误"}（当作首次发布处理）`);
                }
                else {
                    log(`  npm view 输出: ${publishedResult.stdout || "(空)"}`);
                }
            }
        }
        else {
            warn("Step 3: 已跳过版本检查（--no-version-check）");
        }
        // ---- Step 4: 构建 ----
        log("Step 4: 构建");
        if (pkg.scripts?.prepack) {
            log("  prepack 脚本已定义（npm publish 自动执行），跳过手动构建");
            startStep("构建", "prepack 已定义").done();
        }
        else if (pkg.scripts?.build) {
            const npmBin = detectPnpm(pkgDir) ? "pnpm" : "npm";
            if (opts.dryRun) {
                log(`  [dry-run] 将执行构建: ${npmBin} run build`);
                startStep("构建", "dry-run 跳过").done();
            }
            else {
                if (opts.verbose)
                    log(`  执行构建: ${npmBin} run build`);
                try {
                    run(`${npmBin} run build`, pkgDir, { verbose: opts.verbose });
                    startStep("构建").done();
                }
                catch (err) {
                    // 如果 pnpm 失败，尝试 npm
                    if (npmBin === "pnpm") {
                        const pnpmErr = err.message;
                        warn(`  pnpm 构建失败: ${pnpmErr}，尝试 npm...`);
                        try {
                            run("npm run build", pkgDir, { verbose: opts.verbose });
                            startStep("构建").done();
                        }
                        catch (err2) {
                            const npmErr = err2.message;
                            error(`构建失败: ${npmErr}`);
                            return this.fail(pkgName, pkgVersion, `构建失败: ${npmErr}`);
                        }
                    }
                    else {
                        error(`构建失败: ${err.message}`);
                        return this.fail(pkgName, pkgVersion, `构建失败: ${err.message}`);
                    }
                }
            }
        }
        else {
            warn("  无 build 脚本，跳过构建");
        }
        // ---- Step 5: .npmrc ----
        log("Step 5: 配置认证");
        if (!opts.dryRun) {
            const rcPath = resolve(pkgDir, ".npmrc");
            _rcPath = rcPath;
            _rcBackup = existsSync(rcPath) ? readFileSync(rcPath, "utf-8") : null;
            writeFileSync(rcPath, [
                `registry=${opts.registry}`,
                `${registryHost(opts.registry)}/:_authToken=${npmToken}`,
            ].join("\n") + "\n", "utf-8");
            startStep(".npmrc 配置").done();
            if (opts.verbose)
                log(`  写入: ${rcPath}`);
            // 注册清理钩子
            process.on("exit", cleanupNpmrc);
            process.on("SIGINT", () => { warn("收到 SIGINT，清理中..."); cleanupNpmrc(); process.exit(130); });
            process.on("SIGTERM", () => { warn("收到 SIGTERM，清理中..."); cleanupNpmrc(); process.exit(143); });
        }
        else {
            log(`  [dry-run] 将写入 .npmrc 到: ${pkgDir}`);
            log(`  [dry-run] registry: ${opts.registry}`);
            log(`  [dry-run] 认证: ${npmToken ? "***（已隐藏）" : "未设置"}`);
            startStep(".npmrc 配置", "dry-run 跳过").done();
        }
        // ---- Step 6: 发布 ----
        log("Step 6: 发布");
        const npmBin = detectPnpm(pkgDir) ? "pnpm" : "npm";
        const pubArgs = [
            "publish",
            `--registry=${opts.registry}`,
            `--access=${opts.access}`,
            `--tag=${opts.tag}`,
        ];
        if (npmBin === "pnpm")
            pubArgs.push("--no-git-checks");
        if (opts.dryRun)
            pubArgs.push("--dry-run");
        if (opts.otp)
            pubArgs.push(`--otp=${opts.otp}`);
        if (opts.dryRun) {
            log(`  [dry-run] 将执行: ${npmBin} ${pubArgs.join(" ")}`);
            log(`  [dry-run] 包名: ${pkgName}`);
            log(`  [dry-run] 版本: ${pkgVersion}`);
            log(`  [dry-run] registry: ${opts.registry}`);
            log(`  [dry-run] tag: ${opts.tag}`);
            log(`  [dry-run] access: ${opts.access}`);
            log(`  [dry-run] cwd: ${pkgDir}`);
            log(`  [dry-run] 注：不会实际发布，也不会写入 .npmrc`);
        }
        else {
            log(`  执行: ${npmBin} ${pubArgs.join(" ")}`);
        }
        if (!opts.dryRun) {
            try {
                run(`${npmBin} ${pubArgs.join(" ")}`, pkgDir, { verbose: opts.verbose });
                log(`  ✓ 发布成功！${pkgName}@${pkgVersion}`);
                console.log(`     https://www.npmjs.com/package/${pkgName}`);
            }
            catch (err) {
                const msg = err.message || "";
                error(`发布失败: ${msg}`);
                if (msg.includes("404"))
                    error("  提示: 404 → scoped 包需要 --access public");
                if (msg.includes("403"))
                    error("  提示: 403 → 权限不足，检查 NPM_TOKEN");
                if (msg.includes("401"))
                    error("  提示: 401 → 认证失败，检查 NPM_TOKEN");
                if (msg.includes("EOTP"))
                    error("  提示: 需要 OTP → 使用 --otp <code>");
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
        }
        else {
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
    fail(pkgName, version, message) {
        return { success: false, packageName: pkgName, version, dryRun: this.options.dryRun, message };
    }
}
//# sourceMappingURL=publisher.js.map