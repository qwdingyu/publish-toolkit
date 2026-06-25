# @usethink/publish-toolkit

统一 npm 包发布工具链 — 混淆构建、包准备、一键发布。

## 安装

```bash
npm install -D @usethink/publish-toolkit
```

> 推荐使用方式：`pnpm exec publish-toolkit ...`。在 pnpm 工作区中，优先使用 `pnpm exec`，避免 `npx` 被某些环境解析为 `npm run`。仅在非 pnpm 环境退回到 `npx publish-toolkit ...`。

## 快速使用

### 发布包

```bash
NPM_TOKEN=npm_xxx pnpm exec publish-toolkit publish --dry-run
```

或

```bash
NPM_TOKEN=npm_xxx npx publish-toolkit publish --dry-run
```

### 混淆构建产物

```bash
pnpm exec publish-toolkit obfuscate run --input ./dist --output ./dist-obf --level light
```

或

```bash
npx publish-toolkit obfuscate run --input ./dist --output ./dist-obf --level light
```

## GitHub Actions 集成

```yaml
- run: pnpm exec publish-toolkit publish
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

> 本仓库自身的 CI 目前直接使用 `npm publish`，不走 toolkit CLI。对外消费项目推荐使用上述方式集成，并优先使用 `pnpm exec` 避免 `npx` 被某些环境解析为 `npm run`。

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
| `--no-git-check` | 跳过 git 检查 | false |
| `--no-version-check` | 跳过版本号检查 | false |
| `--verbose, -v` | 详细日志 | false |

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
