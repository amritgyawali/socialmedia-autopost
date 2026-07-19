#!/usr/bin/env bash
# One-time preparation of an Oracle Cloud Ubuntu 24.04 (ARM64) instance.
# Idempotent: safe to re-run. Run as the "ubuntu" user, not as root.
#
#   bash bootstrap-vps.sh
#
# What it does NOT do: install secrets, start the stack, or open port 22 wider
# than Oracle's VCN security list already allows.
set -Eeuo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run this as the 'ubuntu' user (it uses sudo where needed)." >&2
  exit 1
fi

echo "==> Updating base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> Installing prerequisites"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg iptables-persistent

echo "==> Installing Docker Engine + Compose plugin (arm64)"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  # --batch/--yes keep gpg from trying to open /dev/tty, which does not exist
  # when this runs over a non-interactive SSH session.
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "    Docker already present; skipping install."
fi

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# ---------------------------------------------------------------------------
# Oracle Cloud's Ubuntu images ship with a host firewall that REJECTs inbound
# traffic. Opening the VCN security list alone is NOT enough - packets reach
# the instance and are dropped here. This is the single most common reason an
# Oracle VM appears unreachable on 80/443.
# ---------------------------------------------------------------------------
echo "==> Opening ports 80/443 in the host firewall"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
    echo "    opened tcp/$port"
  else
    echo "    tcp/$port already allowed"
  fi
done
sudo netfilter-persistent save

echo "==> Preparing the application directory"
mkdir -p "$HOME/postpilot/infra"

echo
echo "Bootstrap complete."
echo
echo "  Docker:  $(docker --version 2>/dev/null || echo 'log out and back in')"
echo "  Compose: $(docker compose version --short 2>/dev/null || echo 'log out and back in')"
echo "  Memory:  $(free -h | awk '/^Mem:/ {print $2 " total, " $7 " available"}')"
echo "  Arch:    $(uname -m)"
echo
echo "IMPORTANT: log out and back in so your shell picks up the 'docker' group,"
echo "otherwise every docker command will need sudo."
