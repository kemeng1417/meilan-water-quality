#!/bin/bash
# ==============================================================
# 水质管理系统 - Ubuntu 服务器一键部署脚本
# 用法: ./deploy.sh <服务器IP> <用户名> [端口]
# 示例: ./deploy.sh 47.120.66.1 root
#
# 前置条件：本机已安装 sshpass（apt install sshpass）
# ==============================================================
set -e

# --- 配置 --------------------------------------------------
SERVER_IP="${1:?请提供服务器IP}"
SERVER_USER="${2:-root}"
SSH_PORT="${3:-22}"
APP_DIR="/opt/water-quality"
VENV_DIR="$APP_DIR/venv"
BACKEND_PORT=8000
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo "=============================================="
echo "  水质管理系统 - 服务器部署"
echo "  目标: $SERVER_USER@$SERVER_IP:$SSH_PORT"
echo "=============================================="
echo ""

# --- SSH 命令封装 -------------------------------------------
SSH_CMD="ssh -o StrictHostKeyChecking=no -p $SSH_PORT"
SCP_CMD="scp -o StrictHostKeyChecking=no -P $SSH_PORT"

# 尝试使用 sshpass 密码认证
if [ -n "$SSHPASS" ]; then
    SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -p $SSH_PORT"
    SCP_CMD="sshpass -e scp -o StrictHostKeyChecking=no -o PreferredAuthentications=password -P $SSH_PORT"
fi

REMOTE="$SSH_CMD $SERVER_USER@$SERVER_IP"

# --- Step 1: 检查连接 ---------------------------------------
info "Step 1/7: 检查服务器连接..."
if ! $REMOTE "echo OK" > /dev/null 2>&1; then
    error "无法连接到服务器，请检查 IP、用户名和密码"
fi
info "连接成功"

# --- Step 2: 安装系统依赖 -----------------------------------
info "Step 2/7: 安装系统依赖..."
$REMOTE "bash -s" << 'EOF'
set -e
# 检查 Python 版本
if ! command -v python3 &>/dev/null; then
    apt-get update && apt-get install -y python3 python3-venv python3-pip
fi
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python 版本: $PY_VER"

# 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "安装 Node.js 20.x..."
    apt-get update && apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js 版本: $(node -v)"

# 确保必要工具
apt-get install -y nginx 2>/dev/null || true
EOF

# --- Step 3: 创建目录和虚拟环境 ------------------------------
info "Step 3/7: 创建应用目录和 Python 虚拟环境..."
$REMOTE "bash -s" << EOF
set -e
mkdir -p $APP_DIR/data/photos
mkdir -p $APP_DIR/data/ocr_uploads
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv $VENV_DIR
fi
EOF

# --- Step 4: 上传代码并安装 Python 依赖 ----------------------
info "Step 4/7: 上传后端代码并安装依赖..."
# 上传后端代码
$SCP_CMD -r "$PROJECT_DIR/backend/app" "$SERVER_USER@$SERVER_IP:$APP_DIR/backend/"
$SCP_CMD -r "$PROJECT_DIR/backend/seed_data.py" "$SERVER_USER@$SERVER_IP:$APP_DIR/backend/"
$SCP_CMD "$PROJECT_DIR/backend/requirements.txt" "$SERVER_USER@$SERVER_IP:$APP_DIR/backend/"

# 上传 .env 文件（如果本地有的话）
if [ -f "$PROJECT_DIR/.env" ]; then
    $SCP_CMD "$PROJECT_DIR/.env" "$SERVER_USER@$SERVER_IP:$APP_DIR/.env"
else
    warn "本地没有 .env 文件，将使用 .env.example 模板（需要手动修改 SECRET_KEY）"
    $SCP_CMD "$PROJECT_DIR/.env.example" "$SERVER_USER@$SERVER_IP:$APP_DIR/.env"
fi

# 安装 Python 依赖
$REMOTE "$VENV_DIR/bin/pip install -r $APP_DIR/backend/requirements.txt"

# --- Step 5: 构建前端 ----------------------------------------
info "Step 5/7: 构建前端..."
# 在本地构建前端
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    info "安装前端依赖..."
    npm install
fi
info "构建生产版本..."
npm run build

# 上传构建产物
$SCP_CMD -r "$PROJECT_DIR/frontend/dist" "$SERVER_USER@$SERVER_IP:$APP_DIR/frontend/"

# --- Step 6: 配置 systemd 服务 -------------------------------
info "Step 6/7: 配置 systemd 服务..."
# 上传 service 文件
$SCP_CMD "$SCRIPT_DIR/water-quality.service" "$SERVER_USER@$SERVER_IP:/tmp/water-quality.service"
$REMOTE "bash -s" << EOF
set -e
cp /tmp/water-quality.service /etc/systemd/system/water-quality.service

# 修正 service 文件中的用户（如果不存在 www-data 则用当前用户）
if ! id www-data &>/dev/null; then
    CURRENT_USER=\$(whoami)
    sed -i "s/User=www-data/User=\$CURRENT_USER/g" /etc/systemd/system/water-quality.service
    sed -i "s/Group=www-data/Group=\$CURRENT_USER/g" /etc/systemd/system/water-quality.service
fi

systemctl daemon-reload
systemctl enable water-quality.service
systemctl restart water-quality.service
sleep 2
systemctl status water-quality.service --no-pager || true
EOF

# --- Step 7: 验证部署 ----------------------------------------
info "Step 7/7: 验证部署..."
sleep 2
if $REMOTE "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$BACKEND_PORT" 2>/dev/null | grep -q "200\|401\|302\|307"; then
    info "✓ 后端服务启动成功！"
else
    warn "后端可能还在启动中，请稍后检查: curl http://127.0.0.1:$BACKEND_PORT"
fi

echo ""
echo "=============================================="
echo "  部署完成！"
echo "  访问地址: http://$SERVER_IP:$BACKEND_PORT"
echo ""
echo "  后续步骤:"
echo "  1. 开放防火墙端口: sudo ufw allow $BACKEND_PORT"
echo "  2. 修改 .env 中的 SECRET_KEY: ssh $SERVER_USER@$SERVER_IP 'nano $APP_DIR/.env'"
echo "  3. 查看日志: ssh $SERVER_USER@$SERVER_IP 'journalctl -u water-quality -f'"
echo "  4. 配置 Nginx（可选）: 参考 deploy/nginx-water.conf"
echo "=============================================="
