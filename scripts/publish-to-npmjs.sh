#!/usr/bin/env bash
#
# publish-to-npmjs.sh — 将 @usethink/publish-toolkit 推送到 npmjs
#
# 用法：
#   ./scripts/publish-to-npmjs.sh [--dry-run] [--tag <name>]
#
# 环境变量：
#   NPM_TOKEN   — npm 自动化 access token（非 dry-run 模式必需）
#
# 示例：
#   ./scripts/publish-to-npmjs.sh --dry-run
#   NPM_TOKEN=npm_xxx ./scripts/publish-to-npmjs.sh --tag latest
#   NPM_TOKEN=npm_xxx ./scripts/publish-to-npmjs.sh --tag beta
#

set -euo pipefail

# ========================
# 配置
# ========================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REGISTRY="https://registry.npmjs.org/"
PACKAGE_NAME="@usethink/publish-toolkit"

# ========================
# 参数解析
# ========================
DRY_RUN=false
TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    -h|--help)
      echo "用法: $0 [--dry-run] [--tag <name>]"
      echo ""
      echo "选项:"
      echo "  --dry-run    预览模式，不实际发布"
      echo "  --tag <name> dist-tag（默认: latest）"
      echo "  -h, --help   显示帮助"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: $0 [--dry-run] [--tag <name>]"
      exit 1
      ;;
  esac
done

# ========================
# 前置检查
# ========================
echo "🔍 前置检查..."

# 检查是否在正确的项目目录
if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
  echo "❌ 错误: 未找到 package.json，请确保在项目根目录执行此脚本"
  exit 1
fi

# 读取包信息
PACKAGE_NAME=$(node -p "require('${PROJECT_ROOT}/package.json').name")
PACKAGE_VERSION=$(node -p "require('${PROJECT_ROOT}/package.json').version")

echo "📦 包: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "🏷️  Tag: ${TAG}"

# 检查 NPM_TOKEN（非 dry-run 模式必需）
if [[ "${DRY_RUN}" == "false" ]]; then
  if [[ -z "${NPM_TOKEN:-}" ]]; then
    echo "❌ 错误: 缺少环境变量 NPM_TOKEN"
    echo "   请设置 NPM_TOKEN 后重试："
    echo "   export NPM_TOKEN=npm_xxx"
    exit 1
  fi
  echo "✅ NPM_TOKEN 已设置"
else
  echo "🧪 Dry-run 模式，跳过 NPM_TOKEN 检查"
fi

# 检查构建产物是否存在
if [[ ! -d "${PROJECT_ROOT}/dist" ]]; then
  echo "⚠️  警告: dist/ 目录不存在，请先运行 npm run build"
  exit 1
fi
echo "✅ 构建产物已就绪"

# ========================
# 执行发布
# ========================
echo ""
echo "🚀 开始发布到 npmjs..."
echo "   包: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "    registry: ${REGISTRY}"
echo ""

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "🧪 Dry-run 模式..."
  npm publish --dry-run \
    --registry="${REGISTRY}" \
    --tag="${TAG}" \
    --access=public \
    --verbose
else
  echo "🚀 正式发布..."
  npm publish \
    --registry="${REGISTRY}" \
    --tag="${TAG}" \
    --access=public \
    --verbose
fi

EXIT_CODE=$?

# ========================
# 结果输出
# ========================
echo ""
if [[ ${EXIT_CODE} -eq 0 ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "🧪 Dry-run 成功！"
    echo "   包: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
  else
    echo "✅ ${PACKAGE_NAME}@${PACKAGE_VERSION} 发布成功！"
    echo "   查看: https://www.npmjs.com/package/${PACKAGE_NAME}"
  fi
else
  echo "❌ 发布失败（exit code: ${EXIT_CODE}）"
  echo "   请检查上方日志"
  exit ${EXIT_CODE}
fi
