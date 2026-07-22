# Postiz on Oracle Cloud — Complete A-to-Z Deployment Guide

**Target deployment**

- **Application:** Postiz self-hosted
- **Primary repository:** `https://github.com/gitroomhq/postiz-app`
- **Production Compose repository:** `https://github.com/gitroomhq/postiz-docker-compose`
- **Oracle VPS operating system assumed:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- **Production URL:** `https://pachey.duckdns.org`
- **Existing Vercel URL:** `https://postpilot-iota-rosy.vercel.app`
- **Reverse proxy:** Caddy
- **Container platform:** Docker Engine with Docker Compose
- **Deployment model:** Frontend, backend and orchestrator together in the official Postiz container
- **Database:** PostgreSQL
- **Cache/session service:** Redis
- **Workflow engine:** Temporal
- **Temporal visibility store:** Elasticsearch
- **Default media storage:** Local Docker volume
- **Guide verified:** 20 July 2026

---

## Table of contents

1. [The correct architecture](#1-the-correct-architecture)
2. [What “same UI/UX as Postiz” means](#2-what-same-uiux-as-postiz-means)
3. [Why the Postiz frontend should not be separated onto Vercel](#3-why-the-postiz-frontend-should-not-be-separated-onto-vercel)
4. [System requirements](#4-system-requirements)
5. [Information to collect before starting](#5-information-to-collect-before-starting)
6. [Oracle Cloud network configuration](#6-oracle-cloud-network-configuration)
7. [Connect to the VPS](#7-connect-to-the-vps)
8. [Prepare Ubuntu](#8-prepare-ubuntu)
9. [Add swap on a small VPS](#9-add-swap-on-a-small-vps)
10. [Configure DuckDNS](#10-configure-duckdns)
11. [Install Docker Engine and Docker Compose](#11-install-docker-engine-and-docker-compose)
12. [Remove or isolate an old failed Postiz deployment](#12-remove-or-isolate-an-old-failed-postiz-deployment)
13. [Clone the official production Compose repository](#13-clone-the-official-production-compose-repository)
14. [Create a repeatable production configuration](#14-create-a-repeatable-production-configuration)
15. [Validate and start Postiz](#15-validate-and-start-postiz)
16. [Install and configure Caddy](#16-install-and-configure-caddy)
17. [Configure the Ubuntu firewall](#17-configure-the-ubuntu-firewall)
18. [Test the complete deployment](#18-test-the-complete-deployment)
19. [Create the first account and close registration](#19-create-the-first-account-and-close-registration)
20. [Use the Vercel URL correctly](#20-use-the-vercel-url-correctly)
21. [Configure social media providers](#21-configure-social-media-providers)
22. [Configure optional AI features](#22-configure-optional-ai-features)
23. [Configure optional email delivery](#23-configure-optional-email-delivery)
24. [Choose local storage or Cloudflare R2](#24-choose-local-storage-or-cloudflare-r2)
25. [Back up Postiz](#25-back-up-postiz)
26. [Restore Postiz](#26-restore-postiz)
27. [Update Postiz safely](#27-update-postiz-safely)
28. [Monitoring and maintenance](#28-monitoring-and-maintenance)
29. [Troubleshooting](#29-troubleshooting)
30. [Optional source-code development and customisation](#30-optional-source-code-development-and-customisation)
31. [Security hardening checklist](#31-security-hardening-checklist)
32. [Final verification checklist](#32-final-verification-checklist)
33. [Command reference](#33-command-reference)
34. [Official sources](#34-official-sources)

---

# 1. The correct architecture

Use one public origin:

```text
User's browser
      |
      | HTTPS
      v
https://pachey.duckdns.org
      |
      v
Caddy on Oracle VPS
Ports 80 and 443
      |
      | reverse_proxy
      v
127.0.0.1:4007
      |
      v
Official Postiz container
      |
      +-- Next.js frontend
      +-- NestJS backend
      +-- Postiz orchestrator
      |
      +-- PostgreSQL
      +-- Redis
      +-- Temporal
      +-- Temporal PostgreSQL
      +-- Elasticsearch
```

The official Postiz image already contains the application frontend, backend and orchestrator. The official Docker Compose repository adds the required PostgreSQL, Redis and Temporal stack.

The browser should use only:

```text
https://pachey.duckdns.org
```

Do not expose the database, Redis, Temporal, Elasticsearch or Postiz port `4007` directly to the internet.

Publicly exposed ports:

```text
22    SSH
80    HTTP, used by Caddy and certificate validation
443   HTTPS
```

Private/local-only ports:

```text
4007  Postiz host port
5000  Postiz container entrypoint
5432  PostgreSQL
6379  Redis
7233  Temporal
8080  Temporal UI
9200  Elasticsearch
```

---

# 2. What “same UI/UX as Postiz” means

The `gitroomhq/postiz-app` repository contains the open-source Postiz application. Its README states that, at the time of writing, there is no difference between the hosted and self-hosted application editions.

Therefore, the easiest method for obtaining the same Postiz dashboard UI is:

```text
Use the official ghcr.io/gitroomhq/postiz-app image.
```

You do **not** need to copy the UI manually, redesign it, or build a separate frontend.

Important distinction:

- `postiz.com` includes the public Postiz marketing website.
- The self-hosted application provides the Postiz product/dashboard interface.
- The open-source application is intended to match the hosted Postiz application experience.
- A public marketing homepage may not be identical to the authenticated product dashboard and is not required to use Postiz.

The official image is built from the public repository and is the lowest-risk route to the same product UI.

## Licensing note

The repository is licensed under **AGPL-3.0**.

Practical implications:

- You may run the unmodified open-source application on your server.
- You may modify it.
- When users interact with a modified version over a network, AGPL obligations can require you to make the corresponding modified source available to those users.
- Keep copyright and licence notices.
- The software licence does not automatically grant every possible trademark right.
- Do not claim that your deployment is the official Postiz cloud service.
- For a public or commercial white-labelled service, review the AGPL and any applicable branding/trademark rules carefully.

This guide is technical guidance, not legal advice.

---

# 3. Why the Postiz frontend should not be separated onto Vercel

Your existing Vercel deployment is:

```text
https://postpilot-iota-rosy.vercel.app
```

The recommended design is **not**:

```text
Vercel frontend
      |
      v
Oracle VPS backend
```

The recommended design is:

```text
Vercel URL -> permanent redirect -> https://pachey.duckdns.org
```

## Problems created by splitting the frontend and backend

Postiz uses:

- secure authentication cookies;
- server-side frontend requests;
- browser-side API requests;
- OAuth callbacks;
- uploaded media routes;
- provider callback routes;
- scheduled background workflows;
- a bundled production entrypoint;
- a required single public URL configuration.

A separate Vercel origin can create:

- cookies being scoped to the wrong domain;
- cross-origin request problems;
- CORS problems;
- OAuth callback mismatch errors;
- login loops;
- media upload and download failures;
- server-side rendering requests pointing at an inaccessible backend;
- different environment variables at build time and runtime;
- Vercel deployment failures caused by the monorepo;
- confusion between public and internal backend URLs;
- more components to maintain without adding meaningful value.

## Important frontend environment behaviour

`NEXT_PUBLIC_BACKEND_URL` is embedded into browser-facing code. It must be reachable from the user’s browser.

`FRONTEND_URL` is used for:

- secure cookie domain behaviour;
- login redirects;
- OAuth callback construction;
- links generated by the application.

Using one HTTPS origin avoids most of these problems:

```text
MAIN_URL=https://pachey.duckdns.org
FRONTEND_URL=https://pachey.duckdns.org
NEXT_PUBLIC_BACKEND_URL=https://pachey.duckdns.org/api
BACKEND_INTERNAL_URL=http://localhost:3000
```

Do not add a trailing slash to these URL values.

Correct:

```text
https://pachey.duckdns.org
```

Incorrect:

```text
https://pachey.duckdns.org/
```

---

# 4. System requirements

Official supported floor for light use:

| Resource | Minimum |
|---|---:|
| CPU | 2 vCPU |
| RAM | 2 GB |
| Disk | 20 GB |
| Operating system | Ubuntu 22.04/24.04 recommended |
| Architecture | AMD64 or ARM64 |

Recommended starting point:

| Resource | Recommended |
|---|---:|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Disk | 50 GB or more |

## Oracle Cloud recommendation

A practical Oracle Always Free configuration is usually:

```text
Oracle Ampere A1
4 OCPU
24 GB RAM
Ubuntu 24.04 ARM64
50–100 GB boot volume
```

The exact Always Free allowance and availability depend on your Oracle tenancy and region.

A smaller server may work for personal use, but the stack includes:

- Postiz;
- PostgreSQL;
- Redis;
- Temporal;
- a second PostgreSQL for Temporal;
- Elasticsearch.

## Check the VPS

After connecting through SSH, run:

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
```

Expected architecture:

```text
aarch64
```

for Oracle Ampere ARM, or:

```text
x86_64
```

for AMD/Intel.

Avoid building Postiz from source on a 2 GB server. The build process is more memory-intensive than running the official image.

---

# 5. Information to collect before starting

Record:

```text
Oracle public IPv4:
Oracle SSH username:
SSH private key path:
DuckDNS subdomain: pachey
DuckDNS hostname: pachey.duckdns.org
DuckDNS token:
Vercel URL: postpilot-iota-rosy.vercel.app
```

Common Oracle usernames:

```text
ubuntu    Ubuntu images
opc       Oracle Linux images
```

This guide assumes:

```text
ubuntu
```

## Find the Oracle public IP

Oracle Console:

```text
Compute
-> Instances
-> select the instance
-> Instance access
-> Public IPv4 address
```

You can also run on the VPS later:

```bash
curl -4 https://icanhazip.com
```

---

# 6. Oracle Cloud network configuration

Oracle Cloud has a network firewall in addition to Ubuntu’s firewall.

Depending on your setup, the instance is controlled by:

- a Security List;
- a Network Security Group;
- or both.

## 6.1 Open the relevant network

In Oracle Cloud Console:

```text
Compute
-> Instances
-> select your instance
-> Attached VNICs
-> select Primary VNIC
-> select Subnet
```

Then inspect:

- **Security Lists**, and
- **Network Security Groups** attached to the VNIC.

## 6.2 Add HTTP ingress

Create a stateful ingress rule:

```text
Source type: CIDR
Source CIDR: 0.0.0.0/0
IP protocol: TCP
Source port range: All
Destination port range: 80
Description: HTTP for Caddy
```

## 6.3 Add HTTPS ingress

Create another stateful ingress rule:

```text
Source type: CIDR
Source CIDR: 0.0.0.0/0
IP protocol: TCP
Source port range: All
Destination port range: 443
Description: HTTPS for Caddy
```

## 6.4 Keep SSH available

Ensure TCP port 22 is permitted.

For improved security, restrict SSH to your current public IP:

```text
YOUR_PUBLIC_IP/32
```

Do not remove the existing working SSH rule until a restricted replacement has been tested.

## 6.5 Do not create Oracle ingress rules for internal services

Do not open:

```text
4007
5000
5432
6379
7233
8080
9200
```

---

# 7. Connect to the VPS

## Windows PowerShell

```powershell
ssh -i "C:\path\to\oracle-private-key.key" ubuntu@YOUR_ORACLE_PUBLIC_IP
```

Example:

```powershell
ssh -i "C:\Users\YourName\Downloads\ssh-key-2026.key" ubuntu@129.146.100.50
```

## macOS or Linux

Protect the key:

```bash
chmod 600 ~/Downloads/oracle-private-key.key
```

Connect:

```bash
ssh -i ~/Downloads/oracle-private-key.key ubuntu@YOUR_ORACLE_PUBLIC_IP
```

## Confirm administrator access

```bash
sudo whoami
```

Expected:

```text
root
```

---

# 8. Prepare Ubuntu

## 8.1 Update packages

```bash
sudo apt update
sudo apt upgrade -y
```

## 8.2 Install utilities

```bash
sudo apt install -y \
  git \
  curl \
  ca-certificates \
  gnupg \
  openssl \
  nano \
  dnsutils \
  unzip \
  jq \
  rsync
```

## 8.3 Set the timezone

For Nepal:

```bash
sudo timedatectl set-timezone Asia/Kathmandu
timedatectl
```

The application stores many timestamps internally in UTC, but a correct server timezone helps with logs and administration.

## 8.4 Set the hostname

Optional:

```bash
sudo hostnamectl set-hostname postiz-oracle
```

Add it to `/etc/hosts`:

```bash
echo "127.0.1.1 postiz-oracle" | sudo tee -a /etc/hosts
```

## 8.5 Check for services already using ports 80 or 443

```bash
sudo ss -ltnp | grep -E ':(80|443)\b' || true
```

If Nginx or Apache is shown and you do not need it:

```bash
sudo systemctl disable --now nginx 2>/dev/null || true
sudo systemctl disable --now apache2 2>/dev/null || true
```

Do not stop an existing server if it hosts another required website.

---

# 9. Add swap on a small VPS

Swap is recommended when the VPS has 2–4 GB RAM.

Check current swap:

```bash
sudo swapon --show
free -h
```

If no swap exists, create 4 GB:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Make it permanent:

```bash
grep -q '^/swapfile ' /etc/fstab || \
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Use swap conservatively:

```bash
echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/99-postiz-swap.conf
sudo sysctl --system
```

Verify:

```bash
free -h
sudo swapon --show
sysctl vm.swappiness
```

Swap reduces sudden out-of-memory failures but is not a substitute for adequate RAM.

---

# 10. Configure DuckDNS

Your hostname is:

```text
pachey.duckdns.org
```

## 10.1 Point DuckDNS to Oracle

Sign in to DuckDNS.

For the `pachey` record, set the current Oracle public IPv4 address.

The expected mapping is:

```text
pachey.duckdns.org -> YOUR_ORACLE_PUBLIC_IP
```

## 10.2 Verify DNS

On the VPS:

```bash
dig +short pachey.duckdns.org
```

Expected output:

```text
YOUR_ORACLE_PUBLIC_IP
```

Also test:

```bash
getent ahostsv4 pachey.duckdns.org
```

Do not configure Caddy until DuckDNS resolves to the correct VPS.

## 10.3 Create an automatic DuckDNS updater

Oracle public IPs can change if an instance uses an ephemeral public address.

Create a protected directory:

```bash
sudo install -d -m 700 /opt/duckdns
```

Create a secret file:

```bash
sudo nano /opt/duckdns/duckdns.env
```

Enter:

```bash
DUCKDNS_DOMAIN=pachey
DUCKDNS_TOKEN=REPLACE_WITH_YOUR_DUCKDNS_TOKEN
```

Protect it:

```bash
sudo chmod 600 /opt/duckdns/duckdns.env
sudo chown root:root /opt/duckdns/duckdns.env
```

Create the updater:

```bash
sudo nano /opt/duckdns/update.sh
```

Enter:

```bash
#!/usr/bin/env bash
set -euo pipefail

source /opt/duckdns/duckdns.env

response="$(
  curl -fsS \
    "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip="
)"

if [ "$response" != "OK" ]; then
  echo "DuckDNS update failed: $response" >&2
  exit 1
fi

echo "$(date --iso-8601=seconds) DuckDNS update OK"
```

Make it executable:

```bash
sudo chmod 700 /opt/duckdns/update.sh
```

Test it:

```bash
sudo /opt/duckdns/update.sh
```

Expected:

```text
DuckDNS update OK
```

## 10.4 Create a systemd service

```bash
sudo nano /etc/systemd/system/duckdns-update.service
```

Enter:

```ini
[Unit]
Description=Update DuckDNS record
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/duckdns/update.sh
User=root
```

Create a timer:

```bash
sudo nano /etc/systemd/system/duckdns-update.timer
```

Enter:

```ini
[Unit]
Description=Update DuckDNS every five minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns-update.timer
```

Check:

```bash
systemctl list-timers --all | grep duckdns
sudo journalctl -u duckdns-update.service --no-pager -n 20
```

---

# 11. Install Docker Engine and Docker Compose

Use Docker’s official Ubuntu repository.

## 11.1 Remove conflicting packages

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt remove -y "$pkg" 2>/dev/null || true
done
```

## 11.2 Add Docker’s signing key

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
```

```bash
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
```

```bash
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

## 11.3 Add Docker’s repository

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Update:

```bash
sudo apt update
```

## 11.4 Install Docker

```bash
sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

Enable Docker:

```bash
sudo systemctl enable --now docker
```

Verify:

```bash
sudo systemctl status docker --no-pager
sudo docker run --rm hello-world
sudo docker compose version
```

## 11.5 Optional: use Docker without sudo

```bash
sudo usermod -aG docker "$USER"
```

Log out and reconnect before using Docker without `sudo`.

Security note: membership of the `docker` group is effectively root-level access.

This guide continues to use `sudo docker` explicitly.

---

# 12. Remove or isolate an old failed Postiz deployment

Do not mix a previous failed deployment with the new official stack.

## 12.1 List containers

```bash
sudo docker ps -a \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

## 12.2 Find likely Postiz directories

```bash
find "$HOME" /opt -maxdepth 3 -type d -iname '*postiz*' 2>/dev/null
```

## 12.3 Preserve old files

Example:

```bash
sudo mv /opt/postiz /opt/postiz-old-$(date +%F-%H%M) 2>/dev/null || true
```

## 12.4 Stop old containers

Only from the old Compose directory:

```bash
sudo docker compose down
```

Do **not** add `-v` unless you deliberately want to delete all old data.

Destructive command:

```bash
sudo docker compose down -v
```

`-v` removes associated volumes and can delete:

- database data;
- uploaded media;
- Redis data;
- Temporal data.

---

# 13. Clone the official production Compose repository

Create the application directory:

```bash
sudo mkdir -p /opt/postiz
sudo chown "$USER":"$USER" /opt/postiz
```

Clone into it:

```bash
git clone https://github.com/gitroomhq/postiz-docker-compose.git /opt/postiz
```

Enter the directory:

```bash
cd /opt/postiz
```

Inspect files:

```bash
ls -la
```

Expected files include:

```text
docker-compose.yaml
dynamicconfig/
README.md
```

Record the current commit:

```bash
git rev-parse HEAD
git log -1 --oneline
```

The production stack uses:

```text
ghcr.io/gitroomhq/postiz-app:latest
```

This image contains the Postiz application UI and backend services.

---

# 14. Create a repeatable production configuration

The official Compose file contains placeholder passwords and localhost URLs. Rather than repeatedly editing the upstream file, create:

```text
/opt/postiz/.postiz-production-secrets
/opt/postiz/render-production-compose.sh
/opt/postiz/docker-compose.production.yaml
```

The renderer:

- keeps the official upstream file untouched;
- creates strong secrets;
- inserts `pachey.duckdns.org`;
- changes database passwords;
- restricts Postiz port 4007 to localhost;
- can be rerun after updates;
- fails if expected upstream text has changed.

## 14.1 Create the secrets file

From `/opt/postiz`:

```bash
cd /opt/postiz
umask 077
```

Generate secrets:

```bash
JWT_SECRET="$(openssl rand -hex 64)"
POSTIZ_DB_PASSWORD="$(openssl rand -hex 32)"
TEMPORAL_DB_PASSWORD="$(openssl rand -hex 32)"
```

Create the file:

```bash
cat > .postiz-production-secrets <<EOF
POSTIZ_DOMAIN=pachey.duckdns.org
JWT_SECRET=${JWT_SECRET}
POSTIZ_DB_PASSWORD=${POSTIZ_DB_PASSWORD}
TEMPORAL_DB_PASSWORD=${TEMPORAL_DB_PASSWORD}
EOF
```

Protect it:

```bash
chmod 600 .postiz-production-secrets
```

Inspect variable names without displaying secret values:

```bash
cut -d= -f1 .postiz-production-secrets
```

Expected:

```text
POSTIZ_DOMAIN
JWT_SECRET
POSTIZ_DB_PASSWORD
TEMPORAL_DB_PASSWORD
```

Do not paste this file into chat, email, GitHub, Vercel or a public issue.

## 14.2 Create the renderer

```bash
nano render-production-compose.sh
```

Enter:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SOURCE_FILE="docker-compose.yaml"
TARGET_FILE="docker-compose.production.yaml"
SECRETS_FILE=".postiz-production-secrets"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Missing $SOURCE_FILE" >&2
  exit 1
fi

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Missing $SECRETS_FILE" >&2
  exit 1
fi

set -a
source "$SECRETS_FILE"
set +a

export SOURCE_FILE TARGET_FILE

python3 <<'PY'
import os
from pathlib import Path

source_path = Path(os.environ["SOURCE_FILE"])
target_path = Path(os.environ["TARGET_FILE"])

domain = os.environ["POSTIZ_DOMAIN"]
jwt_secret = os.environ["JWT_SECRET"]
postiz_db_password = os.environ["POSTIZ_DB_PASSWORD"]
temporal_db_password = os.environ["TEMPORAL_DB_PASSWORD"]

text = source_path.read_text(encoding="utf-8")

replacements = [
    (
        "MAIN_URL: 'http://localhost:4007'",
        f"MAIN_URL: 'https://{domain}'",
    ),
    (
        "FRONTEND_URL: 'http://localhost:4007'",
        f"FRONTEND_URL: 'https://{domain}'",
    ),
    (
        "NEXT_PUBLIC_BACKEND_URL: 'http://localhost:4007/api'",
        f"NEXT_PUBLIC_BACKEND_URL: 'https://{domain}/api'",
    ),
    (
        "JWT_SECRET: 'random string that is unique to every install - just type random characters here!'",
        f"JWT_SECRET: '{jwt_secret}'",
    ),
    (
        "DATABASE_URL: 'postgresql://postiz-user:postiz-password@postiz-postgres:5432/postiz-db-local'",
        f"DATABASE_URL: 'postgresql://postiz-user:{postiz_db_password}@postiz-postgres:5432/postiz-db-local'",
    ),
    (
        "POSTGRES_PASSWORD: postiz-password",
        f"POSTGRES_PASSWORD: {postiz_db_password}",
    ),
    (
        "POSTGRES_PASSWORD: temporal",
        f"POSTGRES_PASSWORD: {temporal_db_password}",
    ),
    (
        "- POSTGRES_PWD=temporal",
        f"- POSTGRES_PWD={temporal_db_password}",
    ),
    (
        '- "4007:5000"',
        '- "127.0.0.1:4007:5000"',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"Expected exactly one occurrence of {old!r}, found {count}. "
            "The upstream Compose file may have changed; review it manually."
        )
    text = text.replace(old, new, 1)

# Keep registration open for the first account.
# It will be closed after the first successful login.
target_path.write_text(text, encoding="utf-8")
PY

chmod 600 "$TARGET_FILE"

echo "Rendered $TARGET_FILE"
echo "Public URL: https://${POSTIZ_DOMAIN}"
echo "Postiz binds only to 127.0.0.1:4007"
```

Make it executable:

```bash
chmod 700 render-production-compose.sh
```

Run it:

```bash
./render-production-compose.sh
```

Expected:

```text
Rendered docker-compose.production.yaml
Public URL: https://pachey.duckdns.org
Postiz binds only to 127.0.0.1:4007
```

## 14.3 Confirm the important configuration

Do not print the full Compose file because it contains secrets.

Check URLs:

```bash
grep -E "MAIN_URL|FRONTEND_URL|NEXT_PUBLIC_BACKEND_URL|BACKEND_INTERNAL_URL" \
  docker-compose.production.yaml
```

Expected:

```text
MAIN_URL: 'https://pachey.duckdns.org'
FRONTEND_URL: 'https://pachey.duckdns.org'
NEXT_PUBLIC_BACKEND_URL: 'https://pachey.duckdns.org/api'
BACKEND_INTERNAL_URL: 'http://localhost:3000'
```

Check port binding:

```bash
grep -n '4007:5000' docker-compose.production.yaml
```

Expected:

```text
127.0.0.1:4007:5000
```

Check registration status:

```bash
grep -n 'DISABLE_REGISTRATION' docker-compose.production.yaml
```

Expected initially:

```text
DISABLE_REGISTRATION: 'false'
```

## 14.4 Why these URL values are different

```text
MAIN_URL
```

The main public application URL.

```text
FRONTEND_URL
```

The public browser-facing frontend URL. It is used for cookies, login redirects and OAuth callbacks.

```text
NEXT_PUBLIC_BACKEND_URL
```

The browser-facing backend route. Caddy sends `/api` requests to the same Postiz container.

```text
BACKEND_INTERNAL_URL
```

The Next.js server-side process uses this internal URL to reach the backend inside the bundled container.

Do not replace `BACKEND_INTERNAL_URL` with the public DuckDNS URL.

---

# 15. Validate and start Postiz

## 15.1 Validate Compose syntax

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  config \
  >/tmp/postiz-compose-validated.yaml
```

Check the result:

```bash
echo $?
```

Expected:

```text
0
```

List services:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  config --services
```

Expected services include:

```text
postiz
postiz-postgres
postiz-redis
temporal-elasticsearch
temporal-postgresql
temporal
temporal-admin-tools
temporal-ui
```

## 15.2 Set Elasticsearch kernel requirement

```bash
echo 'vm.max_map_count=262144' | \
  sudo tee /etc/sysctl.d/99-postiz-elasticsearch.conf
```

Apply:

```bash
sudo sysctl --system
```

Verify:

```bash
sysctl vm.max_map_count
```

## 15.3 Pull images

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  pull
```

## 15.4 Start the stack

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

## 15.5 Check container status

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

The first start can take several minutes because:

- PostgreSQL initialises;
- Elasticsearch initialises;
- Temporal creates databases;
- Postiz starts and performs database setup;
- health checks have start periods.

Watch status:

```bash
watch -n 5 \
  'sudo docker compose -f /opt/postiz/docker-compose.production.yaml ps'
```

Exit with:

```text
Ctrl+C
```

## 15.6 View logs

All services:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200
```

Postiz only:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 postiz
```

Follow Postiz live:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs -f postiz
```

Exit:

```text
Ctrl+C
```

Temporal:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 temporal
```

Elasticsearch:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 temporal-elasticsearch
```

## 15.7 Test Postiz locally

```bash
curl -I http://127.0.0.1:4007
```

A working response may be:

```text
HTTP/1.1 200 OK
```

or a redirect such as:

```text
HTTP/1.1 307 Temporary Redirect
```

Check the listening address:

```bash
sudo ss -ltnp | grep 4007
```

Correct:

```text
127.0.0.1:4007
```

Incorrect:

```text
0.0.0.0:4007
```

If it shows `0.0.0.0`, check that you are using:

```text
docker-compose.production.yaml
```

and not the unmodified upstream file.

---

# 16. Install and configure Caddy

Caddy will:

- listen on ports 80 and 443;
- obtain a trusted HTTPS certificate;
- renew the certificate automatically;
- redirect HTTP to HTTPS;
- proxy all requests to Postiz;
- support WebSocket upgrades automatically.

## 16.1 Install Caddy repository requirements

```bash
sudo apt install -y \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https \
  curl
```

## 16.2 Add the Caddy key

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor \
  -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

## 16.3 Add the repository

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

Set permissions:

```bash
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
```

Install:

```bash
sudo apt update
sudo apt install -y caddy
```

Verify:

```bash
caddy version
sudo systemctl status caddy --no-pager
```

## 16.4 Configure Caddy

Back up the default file:

```bash
sudo cp /etc/caddy/Caddyfile \
  /etc/caddy/Caddyfile.original
```

Edit:

```bash
sudo nano /etc/caddy/Caddyfile
```

Use:

```caddy
pachey.duckdns.org {
    encode zstd gzip

    log {
        output file /var/log/caddy/postiz-access.log {
            roll_size 20MiB
            roll_keep 10
            roll_keep_for 720h
        }
    }

    reverse_proxy 127.0.0.1:4007
}
```

Create the log directory:

```bash
sudo install -d -o caddy -g caddy -m 750 /var/log/caddy
```

Format:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
```

Validate:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

Reload:

```bash
sudo systemctl reload caddy
```

Check:

```bash
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy --no-pager -n 100
```

## 16.5 Certificate requirements

Caddy can obtain the certificate only when:

```text
pachey.duckdns.org resolves to the Oracle public IP
Oracle permits inbound TCP 80
Oracle permits inbound TCP 443
Ubuntu permits inbound TCP 80
Ubuntu permits inbound TCP 443
No other service occupies ports 80 or 443
```

---

# 17. Configure the Ubuntu firewall

Check UFW:

```bash
sudo ufw status verbose
```

Allow SSH before enabling it:

```bash
sudo ufw allow OpenSSH
```

Allow Caddy:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Enable:

```bash
sudo ufw --force enable
```

Check:

```bash
sudo ufw status numbered
```

Expected public ports:

```text
22/tcp
80/tcp
443/tcp
```

Do not allow port 4007.

Docker-published ports can interact with firewall rules differently from ordinary processes. Binding Postiz to `127.0.0.1` is the important protection.

---

# 18. Test the complete deployment

## 18.1 Verify DNS

```bash
dig +short pachey.duckdns.org
```

It must return the Oracle public IP.

## 18.2 Test HTTP

```bash
curl -I http://pachey.duckdns.org
```

Expected:

```text
HTTP/1.1 308 Permanent Redirect
```

or another HTTPS redirect.

## 18.3 Test HTTPS

```bash
curl -I https://pachey.duckdns.org
```

Expected:

```text
HTTP/2 200
```

or a valid Postiz redirect.

## 18.4 Inspect the certificate

```bash
echo | openssl s_client \
  -connect pachey.duckdns.org:443 \
  -servername pachey.duckdns.org \
  2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

## 18.5 Open in a browser

Use:

```text
https://pachey.duckdns.org
```

Do not normally use:

```text
http://YOUR_IP:4007
http://pachey.duckdns.org:4007
https://postpilot-iota-rosy.vercel.app
```

The Vercel URL will be configured as a redirect later.

---

# 19. Create the first account and close registration

## 19.1 Create the first account

Open:

```text
https://pachey.duckdns.org
```

Register the administrative account.

Confirm that you can:

- sign in;
- open the dashboard;
- refresh the page without being logged out;
- open the channel/integration page;
- open the settings page.

## 19.2 Disable public registration

Edit the rendered production file:

```bash
cd /opt/postiz
nano docker-compose.production.yaml
```

Change:

```yaml
DISABLE_REGISTRATION: 'false'
```

to:

```yaml
DISABLE_REGISTRATION: 'true'
```

Recreate containers:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  down
```

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

Check:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

Test the registration page in a private/incognito browser window.

## 19.3 Preserve the registration change after future renders

The current renderer copies `DISABLE_REGISTRATION: 'false'` from upstream.

After your first account is created, add this replacement to the Python `replacements` list in `render-production-compose.sh`:

```python
(
    "DISABLE_REGISTRATION: 'false'",
    "DISABLE_REGISTRATION: 'true'",
),
```

Then rerun:

```bash
./render-production-compose.sh
```

Validate:

```bash
grep -n DISABLE_REGISTRATION docker-compose.production.yaml
```

Recreate:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

---

# 20. Use the Vercel URL correctly

Existing Vercel URL:

```text
https://postpilot-iota-rosy.vercel.app
```

Recommended purpose:

```text
Permanent redirect to https://pachey.duckdns.org
```

This gives old links a useful destination without maintaining two application origins.

## 20.1 Add `vercel.json`

In the root of the Git repository currently connected to your Vercel project, create:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "redirects": [
    {
      "source": "/:path*",
      "destination": "https://pachey.duckdns.org/:path*",
      "permanent": true
    }
  ]
}
```

Commit and push:

```bash
git add vercel.json
git commit -m "Redirect Vercel deployment to self-hosted Postiz"
git push
```

Vercel will redeploy.

## 20.2 Verify the redirect

```bash
curl -I https://postpilot-iota-rosy.vercel.app
```

Expected:

```text
308 Permanent Redirect
location: https://pachey.duckdns.org/
```

Test a nested route:

```bash
curl -I \
  https://postpilot-iota-rosy.vercel.app/auth/login
```

Expected destination:

```text
https://pachey.duckdns.org/auth/login
```

## 20.3 Alternative: remove the Vercel project

If the Vercel deployment is not required, deleting or pausing it is simpler.

Do not configure both domains as active Postiz frontend origins.

---

# 21. Configure social media providers

A fresh self-hosted Postiz installation has no provider credentials configured.

The dashboard can work before provider setup, but channels such as Facebook, Instagram, LinkedIn, X and TikTok require developer applications.

## 21.1 Provider configuration workflow

For each provider:

1. Create an application in the provider’s developer console.
2. Enter the exact callback URL.
3. Request the required products/scopes.
4. Copy the client ID and secret.
5. Add variables to the Postiz service environment.
6. Recreate the Postiz container.
7. Connect the channel from the Postiz interface.
8. Test an immediate post.
9. Test a scheduled post.
10. Confirm the Temporal workflow completes.

## 21.2 Callback URL table

| Provider | Production callback |
|---|---|
| Facebook | `https://pachey.duckdns.org/integrations/social/facebook` |
| Instagram via Facebook | `https://pachey.duckdns.org/integrations/social/instagram` |
| Instagram standalone | `https://pachey.duckdns.org/integrations/social/instagram-standalone` |
| LinkedIn profile | `https://pachey.duckdns.org/integrations/social/linkedin` |
| LinkedIn page | `https://pachey.duckdns.org/integrations/social/linkedin-page` |
| X | `https://pachey.duckdns.org/integrations/social/x` |
| TikTok | `https://pachey.duckdns.org/integrations/social/tiktok` |
| Google My Business | `https://pachey.duckdns.org/integrations/social/gmb` |

Always use HTTPS.

Do not use:

```text
localhost
Oracle IP address
port 4007
Vercel URL
```

in provider callback settings.

## 21.3 Add provider secrets

Edit:

```bash
cd /opt/postiz
nano docker-compose.production.yaml
```

Find the `postiz.environment` section.

### Facebook and Instagram

```yaml
FACEBOOK_APP_ID: 'YOUR_META_APP_ID'
FACEBOOK_APP_SECRET: 'YOUR_META_APP_SECRET'
```

For Instagram standalone, the current source configuration may also require:

```yaml
INSTAGRAM_APP_ID: 'YOUR_INSTAGRAM_APP_ID'
INSTAGRAM_APP_SECRET: 'YOUR_INSTAGRAM_APP_SECRET'
```

If these variables are absent from the Compose template, add them under the Postiz environment section.

### LinkedIn

```yaml
LINKEDIN_CLIENT_ID: 'YOUR_LINKEDIN_CLIENT_ID'
LINKEDIN_CLIENT_SECRET: 'YOUR_LINKEDIN_CLIENT_SECRET'
```

### X

```yaml
X_API_KEY: 'YOUR_X_API_KEY'
X_API_SECRET: 'YOUR_X_API_SECRET'
```

### TikTok

```yaml
TIKTOK_CLIENT_ID: 'YOUR_TIKTOK_CLIENT_ID'
TIKTOK_CLIENT_SECRET: 'YOUR_TIKTOK_CLIENT_SECRET'
```

### YouTube / Google My Business

```yaml
YOUTUBE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID'
YOUTUBE_CLIENT_SECRET: 'YOUR_GOOGLE_CLIENT_SECRET'
```

Refer to current Postiz documentation for the exact Google variable names and redirect URIs before creating the Google application.

## 21.4 Recreate after environment changes

Do not use only `docker compose restart`.

Environment changes require recreation:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  down
```

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

Check:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 postiz
```

## 21.5 Meta notes

Facebook and Instagram can use the same Meta application.

For public use, Meta may require:

- business verification;
- app review;
- advanced permission approval;
- privacy policy;
- terms of service;
- data deletion instructions.

For personal testing, development roles may work without full public approval.

## 21.6 TikTok notes

TikTok requires:

- HTTPS;
- a public site;
- a verified website/domain;
- publicly accessible media URLs;
- Login Kit;
- Content Posting API;
- relevant scopes;
- possible audit/approval for fully public direct posting.

Local `/uploads` URLs can work only if they are publicly reachable through:

```text
https://pachey.duckdns.org/uploads/...
```

For reliable TikTok and video workflows, Cloudflare R2 is preferable.

## 21.7 Test scheduling logic

After connecting a provider:

1. Create a simple text or image post.
2. Publish it immediately.
3. Confirm success in Postiz.
4. Create a second post scheduled 10–15 minutes ahead.
5. Check Temporal UI through an SSH tunnel if necessary.
6. Confirm publication.
7. Review Postiz logs for provider or token errors.

---

# 22. Configure optional AI features

Postiz includes optional AI functionality.

To enable OpenAI-supported features, add:

```yaml
OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY'
```

to the Postiz service environment.

Then recreate:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  down
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

Security:

- never commit the key;
- never place it in frontend code;
- restrict project budgets and usage;
- rotate it if exposed.

AI API usage is not included in Oracle Cloud free hosting and may create separate provider charges.

---

# 23. Configure optional email delivery

Email is optional for a basic single-user deployment.

Postiz supports:

- Resend;
- SMTP through Nodemailer.

Adding an email provider can also change user activation behaviour.

## 23.1 SMTP example

Add under the Postiz environment section:

```yaml
EMAIL_PROVIDER: 'nodemailer'
EMAIL_FROM_NAME: 'Pachey Postiz'
EMAIL_FROM_ADDRESS: 'postiz@your-domain.example'
EMAIL_HOST: 'smtp.example.com'
EMAIL_PORT: '465'
EMAIL_SECURE: 'true'
EMAIL_USER: 'postiz@your-domain.example'
EMAIL_PASS: 'YOUR_SMTP_PASSWORD'
```

## 23.2 Resend example

```yaml
EMAIL_PROVIDER: 'resend'
EMAIL_FROM_NAME: 'Pachey Postiz'
EMAIL_FROM_ADDRESS: 'postiz@your-verified-domain.example'
RESEND_API_KEY: 'YOUR_RESEND_API_KEY'
```

Recreate the containers after changes.

Do not use an unverified sender address.

---

# 24. Choose local storage or Cloudflare R2

## Option A: local Docker volume

The default production configuration uses:

```yaml
STORAGE_PROVIDER: 'local'
UPLOAD_DIRECTORY: '/uploads'
NEXT_PUBLIC_UPLOAD_DIRECTORY: '/uploads'
```

The official Compose file mounts a persistent Docker volume.

Advantages:

- no additional setup;
- no separate account;
- suitable for testing and light use;
- no object-storage bill.

Disadvantages:

- media uses VPS disk;
- backups are essential;
- large videos fill the boot volume;
- uploads disappear if the volume is deleted;
- scaling to multiple hosts is difficult.

## Option B: Cloudflare R2

R2 is usually better for:

- TikTok;
- large videos;
- public media delivery;
- reduced VPS disk use;
- easier media durability;
- future scaling.

Typical variables:

```yaml
STORAGE_PROVIDER: 'cloudflare'
CLOUDFLARE_ACCOUNT_ID: 'YOUR_ACCOUNT_ID'
CLOUDFLARE_ACCESS_KEY: 'YOUR_ACCESS_KEY'
CLOUDFLARE_SECRET_ACCESS_KEY: 'YOUR_SECRET_ACCESS_KEY'
CLOUDFLARE_BUCKETNAME: 'YOUR_BUCKET'
CLOUDFLARE_BUCKET_URL: 'https://YOUR_PUBLIC_BUCKET_DOMAIN'
CLOUDFLARE_REGION: 'auto'
```

Configure bucket CORS to permit:

```text
https://pachey.duckdns.org
```

Do not include the Vercel origin unless it remains an active application frontend, which is not recommended.

Recreate Postiz after changing storage settings.

Before switching an existing installation, plan how existing media will be migrated. Changing the provider does not automatically copy old files.

---

# 25. Back up Postiz

Important data:

```text
Postiz PostgreSQL database
Postiz uploads
Postiz Compose configuration
Postiz secret file
Caddy configuration
Temporal PostgreSQL
Temporal Elasticsearch data
```

The minimum practical backup is:

- Postiz database;
- uploads;
- configuration and secrets.

## 25.1 Create a backup directory

```bash
sudo install -d -m 700 -o "$USER" -g "$USER" /opt/postiz/backups
```

## 25.2 Create a backup script

```bash
nano /opt/postiz/backup-postiz.sh
```

Enter:

```bash
#!/usr/bin/env bash
set -euo pipefail

POSTIZ_DIR="/opt/postiz"
COMPOSE_FILE="${POSTIZ_DIR}/docker-compose.production.yaml"
BACKUP_ROOT="${POSTIZ_DIR}/backups"
STAMP="$(date +%F-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "Backing up database..."

sudo docker exec postiz-postgres \
  pg_dump \
  -U postiz-user \
  -d postiz-db-local \
  -Fc \
  > "${BACKUP_DIR}/postiz-database.dump"

echo "Finding uploads volume..."

UPLOAD_VOLUME="$(
  sudo docker inspect postiz \
    --format '{{range .Mounts}}{{if eq .Destination "/uploads"}}{{.Name}}{{end}}{{end}}'
)"

if [ -z "$UPLOAD_VOLUME" ]; then
  echo "Could not find /uploads volume" >&2
  exit 1
fi

echo "Backing up uploads volume: ${UPLOAD_VOLUME}"

sudo docker run --rm \
  -v "${UPLOAD_VOLUME}:/source:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.20 \
  sh -c 'tar czf /backup/postiz-uploads.tar.gz -C /source .'

echo "Backing up configuration..."

cp "${COMPOSE_FILE}" \
  "${BACKUP_DIR}/docker-compose.production.yaml"

cp "${POSTIZ_DIR}/.postiz-production-secrets" \
  "${BACKUP_DIR}/.postiz-production-secrets"

cp "${POSTIZ_DIR}/render-production-compose.sh" \
  "${BACKUP_DIR}/render-production-compose.sh"

sudo cp /etc/caddy/Caddyfile \
  "${BACKUP_DIR}/Caddyfile"

sudo chown -R "$USER":"$USER" "$BACKUP_DIR"
chmod -R go-rwx "$BACKUP_DIR"

sha256sum "${BACKUP_DIR}"/* \
  > "${BACKUP_DIR}/SHA256SUMS"

echo "Backup complete:"
echo "$BACKUP_DIR"
du -sh "$BACKUP_DIR"
```

Make it executable:

```bash
chmod 700 /opt/postiz/backup-postiz.sh
```

Run:

```bash
/opt/postiz/backup-postiz.sh
```

Inspect:

```bash
find /opt/postiz/backups -maxdepth 2 -type f -printf '%p %k KB\n'
```

## 25.3 Copy backups off the VPS

A backup stored only on the same VPS is not sufficient.

From your computer:

```bash
scp -i /path/to/oracle-private-key \
  -r ubuntu@YOUR_ORACLE_PUBLIC_IP:/opt/postiz/backups/YYYY-MM-DD-HHMMSS \
  .
```

Alternative destinations:

- encrypted local disk;
- private cloud storage;
- another VPS;
- encrypted object storage.

## 25.4 Automate daily backups

Create a systemd service:

```bash
sudo nano /etc/systemd/system/postiz-backup.service
```

Enter:

```ini
[Unit]
Description=Back up Postiz
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=ubuntu
ExecStart=/opt/postiz/backup-postiz.sh
```

Create a timer:

```bash
sudo nano /etc/systemd/system/postiz-backup.timer
```

Enter:

```ini
[Unit]
Description=Run Postiz backup daily

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now postiz-backup.timer
```

Check:

```bash
systemctl list-timers --all | grep postiz-backup
```

Note: the service uses `sudo docker` from a non-interactive systemd service. Depending on your sudo policy, use `User=root` and adjust file ownership, or add the user to the Docker group and remove `sudo` inside the script.

For the simplest reliable setup, set:

```ini
User=root
```

and change the script backup ownership accordingly.

---

# 26. Restore Postiz

Test restoration before relying on backups.

## 26.1 Restore the database

Stop the application container to prevent writes:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  stop postiz
```

Restore:

```bash
sudo docker exec -i postiz-postgres \
  pg_restore \
  -U postiz-user \
  -d postiz-db-local \
  --clean \
  --if-exists \
  < /opt/postiz/backups/BACKUP_DIRECTORY/postiz-database.dump
```

Start Postiz:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  start postiz
```

Check logs:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 postiz
```

## 26.2 Restore uploads

Stop Postiz:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  stop postiz
```

Find the upload volume:

```bash
UPLOAD_VOLUME="$(
  sudo docker inspect postiz \
    --format '{{range .Mounts}}{{if eq .Destination "/uploads"}}{{.Name}}{{end}}{{end}}'
)"
```

Clear and restore:

```bash
sudo docker run --rm \
  -v "${UPLOAD_VOLUME}:/target" \
  -v /opt/postiz/backups/BACKUP_DIRECTORY:/backup:ro \
  alpine:3.20 \
  sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* 2>/dev/null || true; tar xzf /backup/postiz-uploads.tar.gz -C /target'
```

Start:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  start postiz
```

## 26.3 Restore configuration

```bash
cp \
  /opt/postiz/backups/BACKUP_DIRECTORY/docker-compose.production.yaml \
  /opt/postiz/docker-compose.production.yaml
```

```bash
cp \
  /opt/postiz/backups/BACKUP_DIRECTORY/.postiz-production-secrets \
  /opt/postiz/.postiz-production-secrets
```

```bash
sudo cp \
  /opt/postiz/backups/BACKUP_DIRECTORY/Caddyfile \
  /etc/caddy/Caddyfile
```

Protect secrets:

```bash
chmod 600 /opt/postiz/.postiz-production-secrets
chmod 600 /opt/postiz/docker-compose.production.yaml
```

Validate and reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

# 27. Update Postiz safely

The official image uses the `latest` tag. Always back up before pulling a new image.

## 27.1 Back up

```bash
/opt/postiz/backup-postiz.sh
```

## 27.2 Review upstream Compose changes

```bash
cd /opt/postiz
git fetch origin
git status
git log --oneline HEAD..origin/main
git diff HEAD origin/main -- docker-compose.yaml
```

## 27.3 Pull the Compose repository

```bash
git pull --ff-only
```

## 27.4 Regenerate production Compose

```bash
./render-production-compose.sh
```

If the renderer stops because an expected string changed, do not bypass it blindly. Review:

```bash
git diff HEAD~1 HEAD -- docker-compose.yaml
```

Update the renderer to match the new official structure.

## 27.5 Validate

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  config >/dev/null
```

## 27.6 Pull new images

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  pull
```

## 27.7 Recreate

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

## 27.8 Verify

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=200 postiz
```

```bash
curl -I https://pachey.duckdns.org
```

## 27.9 Remove unused old images

Only after confirming the update works:

```bash
sudo docker image prune -f
```

Avoid:

```bash
sudo docker system prune -a --volumes
```

That command can remove important data and images.

---

# 28. Monitoring and maintenance

## 28.1 Service status

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

## 28.2 Resource use

```bash
sudo docker stats
```

## 28.3 Memory

```bash
free -h
```

## 28.4 Disk

```bash
df -h
sudo docker system df
```

## 28.5 Postiz logs

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --since=1h postiz
```

## 28.6 Temporal logs

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --since=1h temporal
```

## 28.7 Caddy logs

```bash
sudo journalctl -u caddy --since "1 hour ago" --no-pager
```

Access log:

```bash
sudo tail -n 100 /var/log/caddy/postiz-access.log
```

## 28.8 Check failed systemd services

```bash
systemctl --failed
```

## 28.9 Check pending Ubuntu updates

```bash
apt list --upgradable
```

## 28.10 Reboot test

```bash
sudo reboot
```

After reconnecting:

```bash
sudo systemctl is-active docker
sudo systemctl is-active caddy
```

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

```bash
curl -I https://pachey.duckdns.org
```

---

# 29. Troubleshooting

## 29.1 Domain does not open

Check DNS:

```bash
dig +short pachey.duckdns.org
```

Check Oracle public IP:

```bash
curl -4 https://icanhazip.com
```

They must match.

Check Oracle rules for:

```text
TCP 80
TCP 443
```

Check UFW:

```bash
sudo ufw status
```

Check listeners:

```bash
sudo ss -ltnp | grep -E ':(80|443)\b'
```

Check Caddy:

```bash
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy --no-pager -n 150
```

---

## 29.2 Caddy cannot obtain a certificate

Common causes:

- DuckDNS points to an old IP;
- port 80 is blocked in Oracle;
- port 443 is blocked in Oracle;
- UFW blocks traffic;
- another service uses port 80 or 443;
- the VPS has no working public IPv4;
- DNS was updated only moments ago.

Commands:

```bash
dig +short pachey.duckdns.org
sudo ss -ltnp | grep -E ':(80|443)\b'
sudo journalctl -u caddy --no-pager -n 200
```

---

## 29.3 `502 Bad Gateway`

Caddy is working but Postiz is not reachable locally.

Test:

```bash
curl -I http://127.0.0.1:4007
```

Check:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

Logs:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=300 postiz
```

Restart:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  restart postiz
```

If dependencies are unhealthy:

```bash
sudo docker compose \
  -f docker-compose.production.yaml \
  down
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

---

## 29.4 Postiz keeps restarting

Check logs:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --tail=400 postiz
```

Check memory:

```bash
free -h
```

Check out-of-memory events:

```bash
sudo dmesg -T | grep -Ei 'out of memory|oom|killed process'
```

Check disk:

```bash
df -h
sudo docker system df
```

Check dependency health:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  ps
```

---

## 29.5 Elasticsearch is unhealthy

Logs:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --tail=300 temporal-elasticsearch
```

Check:

```bash
sysctl vm.max_map_count
```

Set:

```bash
echo 'vm.max_map_count=262144' | \
  sudo tee /etc/sysctl.d/99-postiz-elasticsearch.conf
sudo sysctl --system
```

Check disk:

```bash
df -h
```

Elasticsearch can become read-only when disk space is critically low.

---

## 29.6 Temporal is unhealthy

Check:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --tail=300 temporal
```

Check Temporal PostgreSQL:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --tail=200 temporal-postgresql
```

Check Elasticsearch:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  ps temporal-elasticsearch temporal-postgresql temporal
```

---

## 29.7 Login redirects repeatedly

Confirm exact URLs:

```bash
grep -E \
  "MAIN_URL|FRONTEND_URL|NEXT_PUBLIC_BACKEND_URL|BACKEND_INTERNAL_URL" \
  /opt/postiz/docker-compose.production.yaml
```

Expected:

```text
https://pachey.duckdns.org
https://pachey.duckdns.org
https://pachey.duckdns.org/api
http://localhost:3000
```

Clear browser cookies for:

```text
pachey.duckdns.org
postpilot-iota-rosy.vercel.app
```

Use the DuckDNS URL only.

Do not set:

```text
NOT_SECURED=true
```

in production.

---

## 29.8 OAuth callback mismatch

The callback in the provider console must match exactly.

Examples:

```text
https://pachey.duckdns.org/integrations/social/facebook
https://pachey.duckdns.org/integrations/social/instagram
https://pachey.duckdns.org/integrations/social/linkedin
```

Common errors:

- `http` instead of `https`;
- Vercel URL used;
- Oracle IP used;
- extra slash;
- wrong provider slug;
- port `4007` added;
- frontend URL changed after the provider app was configured.

---

## 29.9 Provider is missing from Postiz

A provider may not appear until its environment variables are populated.

Check container environment without printing secret values:

```bash
sudo docker exec postiz sh -lc \
  'env | cut -d= -f1 | sort | grep -E "FACEBOOK|INSTAGRAM|LINKEDIN|TIKTOK|X_API"'
```

After adding variables, recreate:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  down
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

---

## 29.10 Scheduled posts do not publish

Check:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  ps
```

Temporal must be healthy.

Check Postiz:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --since=30m postiz
```

Check Temporal:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --since=30m temporal
```

Check server time:

```bash
timedatectl
date
date -u
```

Confirm the connected social account token is valid.

---

## 29.11 Uploads fail

Check disk:

```bash
df -h
```

Check mount:

```bash
sudo docker inspect postiz \
  --format '{{range .Mounts}}{{println .Destination .Name}}{{end}}'
```

Expected destination:

```text
/uploads
```

Check logs:

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  logs --tail=300 postiz
```

Test a public upload URL in an incognito browser.

---

## 29.12 Vercel still shows the old frontend

Confirm that `vercel.json` was committed to the root of the repository connected to the correct Vercel project.

Check Vercel deployment logs.

Test:

```bash
curl -I https://postpilot-iota-rosy.vercel.app
```

It should return a permanent redirect.

Do not configure Vercel environment variables for Postiz after switching to the one-origin architecture.

---

## 29.13 ARM image error

Check:

```bash
uname -m
sudo docker info --format '{{.Architecture}}'
```

Pull manually:

```bash
sudo docker pull ghcr.io/gitroomhq/postiz-app:latest
```

A 64-bit Oracle Ampere server should report:

```text
aarch64
```

or Docker architecture:

```text
arm64
```

---

## 29.14 Compose changes are ignored

A normal restart does not replace container environment values.

Use:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  down
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

---

# 30. Optional source-code development and customisation

You do not need this section to obtain the standard Postiz UI.

Use source development only when you want to:

- change colours;
- change logos;
- change navigation;
- add features;
- change components;
- modify the product workflow;
- maintain a custom fork.

## 30.1 Source repository facts

The current repository is a pnpm monorepo containing:

```text
apps/frontend       Next.js frontend
apps/backend        NestJS backend
apps/orchestrator   Temporal workflows
libraries/...       shared code
```

Current repository requirements include:

```text
Node >=22.12.0 and <23
pnpm 10.6.1
```

The repository build script builds the frontend, backend and orchestrator.

## 30.2 Do not customise directly in `/opt/postiz`

Keep production Compose separate from source:

```text
/opt/postiz          production Compose
/opt/postiz-source   source-code checkout
```

Clone:

```bash
sudo mkdir -p /opt/postiz-source
sudo chown "$USER":"$USER" /opt/postiz-source
```

```bash
git clone \
  https://github.com/gitroomhq/postiz-app.git \
  /opt/postiz-source
```

Enter:

```bash
cd /opt/postiz-source
```

## 30.3 Fork first

For long-term customisation:

1. Fork `gitroomhq/postiz-app` to your GitHub account.
2. Clone your fork.
3. Add the official repository as `upstream`.
4. Make changes in a branch.
5. preserve AGPL notices;
6. publish modified source as required.

Example:

```bash
git remote rename origin upstream
git remote add origin https://github.com/YOUR_USERNAME/YOUR_FORK.git
git fetch --all
```

## 30.4 Development environment

Copy:

```bash
cp .env.example .env
```

Use development URLs:

```env
DATABASE_URL="postgresql://postiz-user:postiz-password@localhost:5432/postiz-db-local"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="LONG_RANDOM_VALUE"
FRONTEND_URL="http://localhost:4200"
NEXT_PUBLIC_BACKEND_URL="http://localhost:3000"
BACKEND_INTERNAL_URL="http://localhost:3000"
TEMPORAL_ADDRESS="localhost:7233"
STORAGE_PROVIDER="local"
IS_GENERAL="true"
NX_ADD_PLUGINS=false
```

Install Node 22 and pnpm 10.6.1 on a development machine with enough RAM.

Install dependencies:

```bash
pnpm install
```

Create database schema:

```bash
pnpm run prisma-db-push
```

Run:

```bash
pnpm run dev
```

Frontend:

```text
http://localhost:4200
```

Backend:

```text
http://localhost:3000
```

## 30.5 Build a custom container

The repository’s development Dockerfile currently builds the monorepo and starts Nginx plus PM2.

A direct build can be attempted with:

```bash
cd /opt/postiz-source
sudo docker build \
  -f Dockerfile.dev \
  -t postiz-custom:local \
  .
```

This build is memory-intensive. Prefer:

- a computer with at least 8 GB RAM;
- GitHub Actions;
- another build server.

Do not build on a 2 GB Oracle VPS unless you accept a high risk of out-of-memory failure.

## 30.6 Use the custom image

In:

```text
/opt/postiz/docker-compose.production.yaml
```

change:

```yaml
image: ghcr.io/gitroomhq/postiz-app:latest
```

to:

```yaml
image: postiz-custom:local
```

Then:

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

## 30.7 Why Vercel remains unnecessary for custom source

Even after customising the frontend, the production image can still bundle:

- frontend;
- backend;
- orchestrator;
- internal Nginx/PM2 process management.

Keeping one origin remains simpler and more reliable.

Use Vercel only when you deliberately redesign the architecture and are prepared to solve:

- cookie domain rules;
- OAuth callback handling;
- CORS;
- SSR backend access;
- media routing;
- environment separation;
- monorepo build settings;
- version synchronisation.

That is an advanced unsupported-style deployment and is not the best solution for this Oracle VPS.

---

# 31. Security hardening checklist

## Required

```text
[ ] Strong JWT secret generated
[ ] Postiz database password changed
[ ] Temporal database password changed
[ ] Secret files have mode 600
[ ] Port 4007 bound to 127.0.0.1
[ ] Oracle exposes only 22, 80 and 443
[ ] UFW exposes only 22, 80 and 443
[ ] HTTPS is valid
[ ] Public registration disabled after first account
[ ] Provider secrets are not committed
[ ] DuckDNS token is protected
[ ] Backups are copied off the VPS
```

## Recommended

```text
[ ] SSH limited to your public IP
[ ] SSH password authentication disabled
[ ] Root SSH login disabled
[ ] Automatic security updates enabled
[ ] Fail2ban installed
[ ] Oracle boot volume backup policy configured
[ ] R2 used for large media
[ ] Monthly restore test completed
[ ] Postiz updated only after backup
```

## Disable SSH password authentication

Confirm key login works first.

Edit:

```bash
sudo nano /etc/ssh/sshd_config.d/99-hardening.conf
```

Enter:

```text
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

Validate:

```bash
sudo sshd -t
```

Reload:

```bash
sudo systemctl reload ssh
```

Keep the existing SSH session open while testing a second connection.

## Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Fail2ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

Check:

```bash
sudo fail2ban-client status
```

---

# 32. Final verification checklist

## Infrastructure

```text
[ ] Oracle VPS is running Ubuntu 22.04 or 24.04
[ ] CPU, memory and disk are sufficient
[ ] Swap exists on a low-memory VPS
[ ] Oracle inbound TCP 80 is open
[ ] Oracle inbound TCP 443 is open
[ ] Oracle inbound TCP 22 is open
[ ] Internal service ports are not open
```

## DNS and TLS

```text
[ ] pachey.duckdns.org resolves to Oracle public IP
[ ] DuckDNS timer is active
[ ] Caddy is active
[ ] HTTP redirects to HTTPS
[ ] HTTPS certificate is valid
```

## Docker and Postiz

```text
[ ] Docker is active
[ ] Docker Compose works
[ ] Official postiz-docker-compose repository is cloned
[ ] Production Compose validates
[ ] Postiz is healthy
[ ] PostgreSQL is healthy
[ ] Redis is healthy
[ ] Temporal is healthy
[ ] Elasticsearch is healthy
[ ] Postiz listens only on 127.0.0.1:4007
```

## Application

```text
[ ] Login works at https://pachey.duckdns.org
[ ] Page refresh keeps the session
[ ] Initial account exists
[ ] Public registration is disabled
[ ] Uploads work
[ ] At least one provider is configured
[ ] Immediate posting works
[ ] Scheduled posting works
```

## Vercel

```text
[ ] postpilot-iota-rosy.vercel.app redirects to pachey.duckdns.org
[ ] Vercel is not used as a separate Postiz frontend
```

## Operations

```text
[ ] Backup script works
[ ] Backup exists off the VPS
[ ] Update procedure is documented
[ ] Restore procedure has been tested
```

---

# 33. Command reference

## Start

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

## Stop without deleting data

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  down
```

## Restart services

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  restart
```

## Recreate after environment changes

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  down
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

## Status

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  ps
```

## Postiz logs

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  logs -f postiz
```

## All logs

```bash
cd /opt/postiz
sudo docker compose \
  -f docker-compose.production.yaml \
  logs --tail=300
```

## Caddy status

```bash
sudo systemctl status caddy --no-pager
```

## Caddy logs

```bash
sudo journalctl -u caddy -f
```

## Local health test

```bash
curl -I http://127.0.0.1:4007
```

## Public health test

```bash
curl -I https://pachey.duckdns.org
```

## Resource use

```bash
sudo docker stats
```

## Disk use

```bash
df -h
sudo docker system df
```

## Validate Compose

```bash
sudo docker compose \
  -f /opt/postiz/docker-compose.production.yaml \
  config >/dev/null
```

## Validate Caddy

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile
```

## Back up

```bash
/opt/postiz/backup-postiz.sh
```

## Update

```bash
cd /opt/postiz
/opt/postiz/backup-postiz.sh
git pull --ff-only
./render-production-compose.sh
sudo docker compose \
  -f docker-compose.production.yaml \
  pull
sudo docker compose \
  -f docker-compose.production.yaml \
  up -d
```

---

# 34. Official sources

The implementation in this guide is based on the official project, documentation and platform documentation available on 20 July 2026.

## Postiz

- Main source repository:  
  `https://github.com/gitroomhq/postiz-app`

- Official production Compose repository:  
  `https://github.com/gitroomhq/postiz-docker-compose`

- Quick start:  
  `https://docs.postiz.com/quickstart`

- Docker Compose installation:  
  `https://docs.postiz.com/installation/docker-compose`

- System requirements:  
  `https://docs.postiz.com/installation/system-requirements`

- Architecture:  
  `https://docs.postiz.com/howitworks`

- Configuration reference:  
  `https://docs.postiz.com/configuration/reference`

- Caddy reverse proxy:  
  `https://docs.postiz.com/reverse-proxies/caddy`

- Provider overview:  
  `https://docs.postiz.com/providers/overview`

- Facebook:  
  `https://docs.postiz.com/providers/facebook`

- Instagram:  
  `https://docs.postiz.com/providers/instagram`

- LinkedIn:  
  `https://docs.postiz.com/providers/linkedin`

- LinkedIn Page:  
  `https://docs.postiz.com/providers/linkedin-page`

- X:  
  `https://docs.postiz.com/providers/x-twitter`

- TikTok:  
  `https://docs.postiz.com/providers/tiktok`

- Email configuration:  
  `https://docs.postiz.com/configuration/emails`

- Cloudflare R2:  
  `https://docs.postiz.com/configuration/r2`

- AGPL-3.0 licence:  
  `https://github.com/gitroomhq/postiz-app/blob/main/LICENSE`

## Docker

- Ubuntu installation:  
  `https://docs.docker.com/engine/install/ubuntu/`

- Compose plugin:  
  `https://docs.docker.com/compose/install/linux/`

- Linux post-installation:  
  `https://docs.docker.com/engine/install/linux-postinstall/`

## Caddy

- Installation:  
  `https://caddyserver.com/docs/install`

- Reverse proxy quick start:  
  `https://caddyserver.com/docs/quick-starts/reverse-proxy`

- Automatic HTTPS:  
  `https://caddyserver.com/docs/automatic-https`

## Oracle Cloud

- Security lists:  
  `https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm`

- Creating security lists:  
  `https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/creating-securitylist.htm`

## Vercel

- `vercel.json`:  
  `https://vercel.com/docs/project-configuration/vercel-json`

- Redirects:  
  `https://vercel.com/docs/cli/redirects`

---

# Final implementation decision

Use:

```text
https://pachey.duckdns.org
```

as the single production Postiz origin.

Run:

```text
Official Postiz container
+ PostgreSQL
+ Redis
+ Temporal
+ Temporal PostgreSQL
+ Elasticsearch
```

on Oracle Cloud through the maintained official Docker Compose repository.

Use Caddy for automatic HTTPS.

Use:

```text
https://postpilot-iota-rosy.vercel.app
```

only as a permanent redirect to the Oracle-hosted Postiz instance.

This design provides the official self-hosted Postiz product UI with the fewest authentication, OAuth, upload, scheduling and maintenance problems.
