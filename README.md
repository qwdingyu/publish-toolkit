# @usethink/publish-toolkit

统一 npm 包发布工具链 — 混淆构建、包准备、一键发布。

## 安装

```bash
npm install -D @usethink/publish-toolkit
```

> 发布命令默认使用 `npm publish`。在 pnpm 工作区里可以用 `pnpm exec publish-toolkit ...` 启动 CLI，但 CLI 内部仍默认执行 npm；只有显式传入 `--package-manager pnpm` 或 `--package-manager auto` 且项目元数据声明 pnpm 时，才会执行 `pnpm publish`。

## 快速使用

### 发布包

```bash
NPM_TOKEN=npm_xxx npx publish-toolkit publish --dry-run
```

或

```bash
NPM_TOKEN=npm_xxx pnpm exec publish-toolkit publish --dry-run
```

### 混淆构建产物

```bash
pnpm exec publish-toolkit obfuscate run --input ./dist --output ./dist-obf --level light
```

或

```bash
npx publish-toolkit obfuscate run --input ./dist --output ./dist-obf --level light
```

## 本地发布脚本

项目内置 `scripts/publish-to-npmjs.sh`，用于本地或 CI 中将 `@usethink/publish-toolkit` 本身发布到 npmjs。

```bash
# 预览模式（不实际发布）
bash ./scripts/publish-to-npmjs.sh --dry-run

# 正式发布到 latest
NPM_TOKEN=npm_xxx bash ./scripts/publish-to-npmjs.sh --tag latest

# 发布到 beta tag
NPM_TOKEN=npm_xxx bash ./scripts/publish-to-npmjs.sh --tag beta
```

脚本会自动检查：
- 项目根目录和包信息
- `dist/` 构建产物是否存在
- `NPM_TOKEN` 环境变量（非 dry-run 模式必需）

## GitHub Actions 集成

```yaml
- run: npx publish-toolkit publish
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

pnpm 项目也可以用 `pnpm exec` 启动 CLI，但不要混淆“CLI 启动方式”和“发布命令包管理器”。默认发布命令仍是 npm。

> 本仓库自身的 CI 目前直接使用 `npm publish`，不走 toolkit CLI。

## 命令

### publish

构建并发布 npm 包。

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--package <path>` | 包目录 | 当前目录 |
| `--registry <url>` | 目标 registry | https://registry.npmjs.org/ |
| `--dry-run` | 预览模式，不实际发布 | false |
| `--tag <name>` | dist-tag | latest |
| `--otp <code>` | OTP 二次验证码 | - |
| `--access <level>` | 发布访问级别 | public |
| `--package-manager <name>` | 发布命令包管理器：npm / pnpm / auto | npm |
| `--no-git-check` | 跳过 git 检查 | false |
| `--no-version-check` | 跳过版本号检查 | false |
| `--verbose, -v` | 详细日志 | false |

`--package-manager auto` 只读取项目元数据：`package.json` 的 `packageManager: "pnpm@..."` 或仅存在 `pnpm-lock.yaml` 时选择 pnpm；不会因为 runner 全局安装了 pnpm 就自动切换。

### obfuscate

对构建产物进行混淆。

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--input <dir>` | 输入目录 | - |
| `--output <dir>` | 输出目录 | - |
| `--level <name>` | 混淆级别：none / light / medium / aggressive | light |
| `--source-map` | 保留 source map | false |
| `-e, --exclude <pattern>` | 排除文件 glob（可多次指定） | - |
| `--config <path>` | 混淆器自定义配置 JSON 文件路径 | - |
| `--report` | 生成混淆报告（obfuscate-report.json） | false |

#### 子命令

- `run` — 执行混淆（默认）
- `list-levels` — 列出所有可用级别
- `info` — 显示混淆器配置信息

## License

MIT
