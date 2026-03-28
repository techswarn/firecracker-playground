#!/usr/bin/env bash
# setup.sh — Bootstrap Firecracker Playground on a DigitalOcean Droplet
# Tested on: Ubuntu 22.04 (Premium Intel/AMD with KVM nested-virt enabled)
#
# REQUIREMENTS:
#   - Droplet type: Premium Intel or Premium AMD (KVM required)
#   - Enable nested virtualization in DO console or via API
#   - At least 2 GB RAM recommended

set -euo pipefail
BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; RESET='\033[0m'
log() { echo -e "${CYAN}▶ $*${RESET}"; }
ok()  { echo -e "${GREEN}✓ $*${RESET}"; }

# Resolve project root (one level up from scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="/opt/firecracker-playground"

# ─── Config ──────────────────────────────────────────────────────────────────
FC_VERSION="v1.7.0"
KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin"
ROOTFS_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/rootfs/bionic.rootfs.ext4"
INSTALL_DIR="/opt/fc"
DATA_DIR="$INSTALL_DIR/data"
BACKEND_PORT=8080
FRONTEND_PORT=80

# ─── KVM check ───────────────────────────────────────────────────────────────
log "Checking KVM support..."
if [ ! -e /dev/kvm ]; then
  echo "ERROR: /dev/kvm not found."
  echo "Enable nested virtualization for this Droplet and re-run."
  exit 1
fi
ok "KVM available"
# Ensure kvm is accessible by the service (root already has access, but be explicit)
chmod o+rw /dev/kvm

# ─── System packages ─────────────────────────────────────────────────────────
log "Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl wget nginx golang-go nodejs npm
ok "Packages installed"

# ─── Firecracker binary ──────────────────────────────────────────────────────
log "Installing Firecracker $FC_VERSION..."
FC_ARCH=$(uname -m)
wget -q -O /tmp/firecracker.tgz \
  "https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${FC_ARCH}.tgz"
tar -xz -C /tmp -f /tmp/firecracker.tgz
cp /tmp/release-${FC_VERSION}-${FC_ARCH}/firecracker-${FC_VERSION}-${FC_ARCH} /usr/local/bin/firecracker
chmod +x /usr/local/bin/firecracker
ok "Firecracker installed: $(firecracker --version)"

# ─── VM assets ───────────────────────────────────────────────────────────────
log "Creating directories and downloading VM assets..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR"

wget -q --show-progress -O "$INSTALL_DIR/vmlinux" "$KERNEL_URL"
wget -q --show-progress -O "$INSTALL_DIR/rootfs.ext4" "$ROOTFS_URL"

# Verify kernel is a valid ELF
file "$INSTALL_DIR/vmlinux" | grep -q ELF || { echo "ERROR: kernel is not a valid ELF file"; exit 1; }

chown -R root:root "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR" "$DATA_DIR"
ok "VM assets ready"

# ─── Copy project to /opt ─────────────────────────────────────────────────────
log "Copying project files to $DEPLOY_DIR..."
if [ "$PROJECT_ROOT" != "$DEPLOY_DIR" ]; then
  apt-get install -y -qq rsync
  rsync -a --delete "$PROJECT_ROOT/" "$DEPLOY_DIR/"
fi
ok "Project at $DEPLOY_DIR"

# ─── Backend ─────────────────────────────────────────────────────────────────
log "Building Go backend..."
cd "$DEPLOY_DIR/backend"
go mod tidy
go build -o /usr/local/bin/fc-playground .
ok "Backend built"

# systemd service
cat > /etc/systemd/system/fc-playground.service <<EOF
[Unit]
Description=Firecracker Playground API
After=network.target

[Service]
ExecStart=/usr/local/bin/fc-playground
Restart=always
Environment=KERNEL_PATH=$INSTALL_DIR/vmlinux
Environment=ROOTFS_PATH=$INSTALL_DIR/rootfs.ext4
Environment=DATA_DIR=$DATA_DIR
Environment=LISTEN_ADDR=:$BACKEND_PORT

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fc-playground
systemctl restart fc-playground
ok "Backend service running"

# ─── Frontend ────────────────────────────────────────────────────────────────
log "Building React frontend..."
cd "$DEPLOY_DIR/frontend"
npm install --silent
npm run build --silent

# Point Nginx to the built frontend and proxy /api to backend
cat > /etc/nginx/sites-available/fc-playground <<EOF
server {
    listen $FRONTEND_PORT default_server;
    server_name _;

    root $DEPLOY_DIR/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy → Go backend (with WebSocket support for console)
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }
}
EOF

ln -sf /etc/nginx/sites-available/fc-playground /etc/nginx/sites-enabled/fc-playground
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
ok "Frontend served on port $FRONTEND_PORT"

# ─── Done ────────────────────────────────────────────────────────────────────
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || echo "<your-droplet-ip>")
echo ""
echo -e "${BOLD}🔥 Firecracker Playground is live!${RESET}"
echo -e "   UI  →  http://$DROPLET_IP"
echo -e "   API →  http://$DROPLET_IP/api/vms"
echo ""
echo "Logs: journalctl -u fc-playground -f"
