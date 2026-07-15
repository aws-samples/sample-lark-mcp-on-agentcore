#!/usr/bin/env bash
set -euo pipefail

if [[ "${BASH_VERSINFO[0]}" -lt 4 ]]; then
  echo "" >&2
  echo "  bash 4+ required (current: ${BASH_VERSION})" >&2
  echo "" >&2
  if command -v brew &>/dev/null; then
    NEW_BASH="$(brew --prefix)/bin/bash"
    if [ -x "$NEW_BASH" ] && [[ "$("$NEW_BASH" -c 'echo ${BASH_VERSINFO[0]}')" -ge 4 ]]; then
      echo "  Found ${NEW_BASH} (bash 4+), restarting..." >&2
      _tmp=$(mktemp); curl -fsSL https://raw.githubusercontent.com/aws-samples/sample-lark-mcp-on-agentcore/main/scripts/install.sh > "$_tmp"
      exec "$NEW_BASH" "$_tmp"
    fi
    printf "  Install bash 4+ via Homebrew and continue? (Y/n) " >&2
    read -r _ans </dev/tty 2>/dev/null || _ans="y"
    if [[ ! "${_ans:-y}" =~ ^[nN] ]]; then
      brew install bash
      echo "  Restarting with ${NEW_BASH}..." >&2
      _tmp=$(mktemp); curl -fsSL https://raw.githubusercontent.com/aws-samples/sample-lark-mcp-on-agentcore/main/scripts/install.sh > "$_tmp"
      exec "$NEW_BASH" "$_tmp"
    fi
  fi
  echo "  Manual upgrade:" >&2
  echo "    macOS:  brew install bash" >&2
  echo "    Linux:  sudo apt-get install -y bash  (or yum install bash)" >&2
  echo "" >&2
  echo "  Then re-run:" >&2
  echo "    /opt/homebrew/bin/bash <(curl -fsSL https://raw.githubusercontent.com/aws-samples/sample-lark-mcp-on-agentcore/main/scripts/install.sh)" >&2
  echo "" >&2
  exit 1
fi

# 一键安装: curl -fsSL <url>/install.sh | bash

REPO="https://github.com/aws-samples/sample-lark-mcp-on-agentcore.git"
DIR="sample-lark-mcp-on-agentcore"

# --yes / -y: non-interactive mode
AUTO_YES=0
for arg in "$@"; do
  case "$arg" in --yes|-y) AUTO_YES=1 ;; esac
done

# Arrow-key picker (same as deploy.sh)
pick() {
  local _var="$1"; shift
  local -a _items=("$@")
  local _count=${#_items[@]}
  local _sel=${PICK_DEFAULT:-1}
  (( _sel < 1 || _sel > _count )) && _sel=1
  if [ "$AUTO_YES" = "1" ] || [ ! -t 0 ] || [ ! -t 1 ]; then
    eval "$_var=\"\${_items[\$((_sel-1))]}\""
    unset PICK_DEFAULT; return
  fi
  while IFS= read -r -t 0.05 _ </dev/tty 2>/dev/null; do :; done
  trap 'printf "\033[?25h" >/dev/tty; exit 130' INT
  printf '\033[?25l' >/dev/tty
  _pick_draw() {
    local i
    for ((i=1; i<=_count; i++)); do
      if ((i == _sel)); then
        printf '\033[36m  ❯ %s\033[0m\n' "${_items[$((i-1))]}" >/dev/tty
      else
        printf '    %s\n' "${_items[$((i-1))]}" >/dev/tty
      fi
    done
  }
  _pick_draw
  while true; do
    local _key
    IFS= read -rsn1 _key </dev/tty
    if [[ "$_key" == $'\x1b' ]]; then
      read -rsn2 -t 0.1 _key </dev/tty
      case "$_key" in
        '[A') (( _sel > 1 )) && (( _sel-- )) ;;
        '[B') (( _sel < _count )) && (( _sel++ )) ;;
      esac
      printf '\033[%dA' "$_count" >/dev/tty
      _pick_draw
    elif [[ -z "$_key" || "$_key" == $'\n' ]]; then
      break
    fi
  done
  printf '\033[?25h' >/dev/tty
  trap - INT
  eval "$_var=\"\${_items[\$((_sel-1))]}\""
  unset PICK_DEFAULT
}

# Language selection (only ask if not already set)
if [ -z "${LARK_LANG:-}" ]; then
  echo ""
  echo "  Select language / 选择语言:"
  echo ""
  pick _LANG_PICK "中文" "English"
  case "$_LANG_PICK" in
    English) export LARK_LANG="en" ;;
    *) export LARK_LANG="zh" ;;
  esac
fi

# --- i18n messages ---
declare -A L
if [ "$LARK_LANG" = "zh" ]; then
  L[title]="Lark MCP on AgentCore - 安装"
  L[checking_deps]="检查依赖..."
  L[missing_install]="缺少 %s，是否自动安装?"
  L[skipped]="跳过。请手动安装 %s 后重试。"
  L[install_failed]="安装失败，请手动安装 %s。"
  L[installing_node]="安装 Node.js 20..."
  L[installing_docker]="安装 Docker..."
  L[installing_aws]="安装 AWS CLI..."
  L[installing_cdk]="安装 AWS CDK..."
  L[start_docker]="请启动 Docker Desktop"
  L[missing_boto3]="缺少 python3 boto3，是否安装?"
  L[all_ready]="所有依赖就绪。"
  L[dir_exists]="目录已存在，更新中..."
  L[cloning]="克隆代码..."
  L[npm_deps]="安装 npm 依赖..."
  L[done]="安装完成。"
  L[start_deploy]="现在开始部署?"
  L[deploy_later]="稍后部署: cd %s && ./scripts/deploy.sh"
  L[yes]="是"
  L[no]="否"
else
  L[title]="Lark MCP on AgentCore - Install"
  L[checking_deps]="Checking dependencies..."
  L[missing_install]="Missing %s, install automatically?"
  L[skipped]="Skipped. Please install %s manually."
  L[install_failed]="Install failed. Please install %s manually."
  L[installing_node]="Installing Node.js 20..."
  L[installing_docker]="Installing Docker..."
  L[installing_aws]="Installing AWS CLI..."
  L[installing_cdk]="Installing AWS CDK..."
  L[start_docker]="Please start Docker Desktop"
  L[missing_boto3]="Missing python3 boto3, install?"
  L[all_ready]="All dependencies ready."
  L[dir_exists]="Directory exists, updating..."
  L[cloning]="Cloning repository..."
  L[npm_deps]="Installing npm dependencies..."
  L[done]="Installation complete."
  L[start_deploy]="Start deployment now?"
  L[deploy_later]="Deploy later: cd %s && ./scripts/deploy.sh"
  L[yes]="Yes"
  L[no]="No"
fi

t() { printf "${L[$1]}" "${@:2}"; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
printf "  ║   %-39s║\n" "${L[title]}"
echo "  ╚══════════════════════════════════════════╝"
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"
PKG=""
if command -v apt-get &>/dev/null; then PKG="apt"
elif command -v yum &>/dev/null; then PKG="yum"
elif command -v brew &>/dev/null; then PKG="brew"
fi

confirm() {
  local _q="$1"
  echo "  $_q"
  pick _YN "${L[yes]}" "${L[no]}"
  [[ "$_YN" == "${L[yes]}" ]]
}

install_pkg() {
  local cmd="$1"
  echo ""
  if ! confirm "$(t missing_install "$cmd")"; then
    echo "  $(t skipped "$cmd")"
    exit 1
  fi

  case "$cmd" in
    git)
      case $PKG in
        apt) sudo apt-get update -qq && sudo apt-get install -y git ;;
        yum) sudo yum install -y git ;;
        brew) brew install git ;;
      esac ;;
    node|npm)
      echo "  ${L[installing_node]}"
      if command -v fnm &>/dev/null; then fnm install 20 && fnm use 20
      elif command -v nvm &>/dev/null; then nvm install 20
      else
        curl -fsSL https://fnm.vercel.app/install | bash
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env)"
        fnm install 20 && fnm use 20
      fi ;;
    docker)
      echo "  ${L[installing_docker]}"
      case $PKG in
        apt) curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER" ;;
        yum) sudo yum install -y docker && sudo systemctl start docker && sudo usermod -aG docker "$USER" ;;
        brew) brew install --cask docker && echo "  ${L[start_docker]}" ;;
      esac ;;
    aws)
      echo "  ${L[installing_aws]}"
      case $OS in
        Linux) curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH}.zip" -o /tmp/awscliv2.zip && unzip -qo /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install ;;
        Darwin) curl -fsSL "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o /tmp/AWSCLIV2.pkg && sudo installer -pkg /tmp/AWSCLIV2.pkg -target / ;;
      esac ;;
    python3)
      case $PKG in
        apt) sudo apt-get update -qq && sudo apt-get install -y python3 ;;
        yum) sudo yum install -y python3 ;;
        brew) brew install python@3 ;;
      esac ;;
    cdk)
      echo "  ${L[installing_cdk]}"
      npm install -g aws-cdk ;;
  esac

  if ! command -v "$cmd" &>/dev/null && [ "$cmd" != "cdk" ]; then
    echo "  $(t install_failed "$cmd")"
    exit 1
  fi
}

echo "  ${L[checking_deps]}"
echo ""
for cmd in git node docker aws python3; do
  if command -v $cmd &>/dev/null; then
    printf "  %-10s ✓\n" "$cmd"
  else
    install_pkg "$cmd"
  fi
done

if ! command -v npm &>/dev/null; then install_pkg "node"; fi

if ! command -v cdk &>/dev/null; then
  if ! npx cdk --version &>/dev/null 2>&1; then
    install_pkg "cdk"
  fi
fi
printf "  %-10s ✓\n" "cdk"

if ! python3 -c "import boto3" &>/dev/null; then
  echo ""
  if confirm "${L[missing_boto3]}"; then
    pip3 install boto3 --quiet
  fi
fi
printf "  %-10s ✓\n" "boto3"

echo ""
echo "  ${L[all_ready]}"

INSTALL_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$INSTALL_SCRIPT_DIR")"

if [ -f "${PROJECT_ROOT}/scripts/deploy.sh" ] && [ -d "${PROJECT_ROOT}/infra" ]; then
  echo ""
  echo "  ${L[dir_exists]}"
  cd "$PROJECT_ROOT"
else
  echo ""
  if [ -d "$DIR" ]; then
    echo "  ${L[dir_exists]}"
    cd "$DIR" && git fetch origin && if ! git diff --quiet HEAD 2>/dev/null; then echo "  ⚠️  Local changes detected — run 'git stash' or 'git reset --hard origin/main' manually." >&2; exit 1; fi && git reset --hard origin/main
  else
    echo "  ${L[cloning]}"
    git clone --depth 1 "$REPO" "$DIR"
    cd "$DIR"
  fi
fi

echo "  ${L[npm_deps]}"
npm install --silent 2>/dev/null
( cd infra && npm install --silent 2>/dev/null )
( cd docker && npm install --omit=dev --silent --no-audit --no-fund 2>/dev/null )

echo ""
echo "  ${L[done]}"
echo ""
if ! confirm "${L[start_deploy]}"; then
  echo ""
  echo "  $(t deploy_later "$(pwd)")"
  exit 0
fi

# Pass through deploy flags if provided. --app/--alias are forwarded so an operator
# can target a specific Feishu app non-interactively; without them, deploy.sh's
# interactive app picker handles selection (same TTY, so it works after exec).
_deploy_args=()
_prev=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) _deploy_args+=("$arg") ;;
    --app|--alias) _deploy_args+=("$arg"); _prev="$arg" ;;
    --app=*|--alias=*) _deploy_args+=("$arg") ;;
    *) if [ "$_prev" = "--app" ] || [ "$_prev" = "--alias" ]; then _deploy_args+=("$arg"); fi; _prev="" ;;
  esac
done
exec ./scripts/deploy.sh "${_deploy_args[@]+"${_deploy_args[@]}"}"
