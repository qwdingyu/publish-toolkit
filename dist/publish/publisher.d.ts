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
export type PackageManager = "npm" | "pnpm" | "auto";
export declare function isPackageManager(value: string): value is PackageManager;
export declare class PublishToolkit {
    private options;
    constructor(options?: PublishOptions);
    publish(npmToken: string): Promise<PublishResult>;
    private fail;
}
//# sourceMappingURL=publisher.d.ts.map