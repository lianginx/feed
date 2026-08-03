#!/usr/bin/env bash
# 根据 git 提交历史生成 GitHub Release notes：
# 收集「上一个版本 tag → 当前 tag」之间的提交，按 Conventional Commits 类型分组，
# 生成中文 Markdown 说明（新功能 / 修复 / 性能 / 重构 / 样式 / 文档 / 杂项）。
#
# 用法: generate-release-notes.sh <tag> <output_file>
set -euo pipefail

TAG="${1:?用法: generate-release-notes.sh <tag> <output_file>}"
OUT="${2:?用法: generate-release-notes.sh <tag> <output_file>}"

# 上一个版本 tag（semver 倒序，排除当前 tag）
PREV_TAG="$(git tag --sort=-version:refname | grep -Fvx "${TAG}" | head -n 1 || true)"

# 本次发布区间内的提交（排除 merge 提交与「版本号提升 / 发版」类提交）
if [ -n "${PREV_TAG}" ]; then
  RANGE="${PREV_TAG}..${TAG}"
else
  RANGE="${TAG}"
fi
COMMITS="$(git log --no-merges --format='%h %s' "${RANGE}" 2>/dev/null | grep -viE "版本号提升|发版 v[0-9]" || true)"

# 按类型输出一个小节；无匹配则整节省略
group() {
  local type="$1" label="$2"
  local body
  body="$(printf '%s\n' "${COMMITS}" | grep -E "^[0-9a-f]{7,} ${type}(\(|:)" | sed -E "s/^[0-9a-f]{7,} ${type}(\([^)]*\))?: //" | sed 's/^/- /' || true)"
  if [ -n "${body}" ]; then
    printf '\n## %s\n%s\n' "${label}" "${body}"
  fi
}

{
  printf '# %s\n\n' "${TAG}"

  if [ -z "${COMMITS}" ]; then
    printf '本次无代码变更。\n'
  fi

  group 'feat'     '✨ 新功能'
  group 'fix'      '🐛 修复'
  group 'perf'     '⚡ 性能优化'
  group 'refactor' '♻️ 重构'
  group 'style'    '🎨 样式'
  group 'docs'     '📝 文档'
  group 'chore'    '🔧 杂项'

  # 兜底：未能按已知类型归类的提交
  others="$(printf '%s\n' "${COMMITS}" | grep -vE "^[0-9a-f]{7,} (feat|fix|perf|refactor|style|docs|chore)(\(|:)" || true)"
  if [ -n "${others}" ]; then
    printf '\n## 其他\n%s\n' "$(printf '%s\n' "${others}" | sed 's/^/- /')"
  fi

  printf '\n---\n自动生成：基于 %s 的提交历史。\n' "${RANGE}"
} > "${OUT}"
