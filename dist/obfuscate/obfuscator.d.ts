/**
 * @usethink/publish-toolkit — 混淆引擎
 *
 * 基于 javascript-obfuscator 实现，支持多级混淆策略。
 *
 * 设计目标：
 *   1. 支持多级混淆策略（none / light / medium / aggressive）
 *   2. 零侵入：输入输出均为文件路径，不修改项目源码结构
 *   3. 可配置：支持 source map、排除规则、自定义选项
 */
import type { ObfuscatorOptions } from "javascript-obfuscator";
export type ObfuscateLevel = "none" | "light" | "medium" | "aggressive";
export interface ObfuscateOptions {
    /** 输入目录（包含待混淆的 .js/.mjs 文件） */
    inputDir: string;
    /** 输出目录（混淆后文件写入位置） */
    outputDir: string;
    /** 混淆强度级别 */
    level?: ObfuscateLevel;
    /** 是否保留 source map */
    sourceMap?: boolean;
    /** 排除的文件glob模式（简单实现，仅支持后缀） */
    exclude?: string[];
    /** 覆盖默认混淆器选项 */
    options?: Partial<ObfuscatorOptions>;
}
export interface ObfuscateResult {
    success: boolean;
    processedFiles: number;
    outputDir: string;
    message: string;
    inputSize: number;
    outputSize: number;
}
/**
 * 默认混淆器实现，基于 javascript-obfuscator。
 *
 * 使用场景：
 *   - 对构建产物（dist/）进行混淆，保护代码逻辑
 *   - 支持 CI/CD 流水线集成
 *   - 不修改源码，仅处理输出文件
 */
export declare class Obfuscator {
    private level;
    constructor(level?: ObfuscateLevel);
    /**
     * 执行混淆
     *
     * 处理流程：
     *   1. 验证输入输出目录
     *   2. 递归扫描输入目录中的 .js/.mjs/.ts 文件
     *   3. 根据级别选择混淆策略
     *   4. 写入输出目录，保持相对路径结构
     *   5. 返回处理结果统计
     */
    obfuscate(options: ObfuscateOptions): Promise<ObfuscateResult>;
    /**
     * 复制文件（用于 none 级别）
     */
    private copyFiles;
}
//# sourceMappingURL=obfuscator.d.ts.map