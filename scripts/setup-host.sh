#!/usr/bin/env bash
set -e

# Setup color formatting for feedback
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
RED="\033[0;31m"
NC="\033[0m"

info()    { echo -e "\n${BLUE}${BOLD}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"; }
error()   { echo -e "${RED}${BOLD}[ERROR]${NC} $1"; }

# ------------------------------------------------------------------------------
# 0. Flag Parsing & Architecture Check
# ------------------------------------------------------------------------------
SKIP_PROMPT=false
USE_DOCKER=""

for arg in "$@"; do
    case $arg in
        -y|--yes) SKIP_PROMPT=true ;;
        --docker) USE_DOCKER=true ;;
        --native) USE_DOCKER=false ;;
    esac
done

ARCH=$(uname -m)
USERLAND_ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)

# Interactive deployment mode selection if no flag was provided
if [ -z "$USE_DOCKER" ]; then
    echo -e "${BOLD}🚀 itemLens Host Setup${NC}"
    echo "Select your deployment mode:"
    echo "  1) Native Host Mode (Node 22 on host + microservices in Docker)"
    echo "  2) Full Docker Mode (App + microservices all in Docker containers)"
    echo ""
    
    if [ "$USERLAND_ARCH" = "armhf" ] || [ "$USERLAND_ARCH" = "arm" ]; then
        warn "32-bit userland detected ($USERLAND_ARCH). Full Docker Mode (Option 2) is strongly recommended."
        read -p "Choice [1-2] (Default: 2): " CHOICE
        case "$CHOICE" in
            1) USE_DOCKER=false ;;
            *) USE_DOCKER=true ;;
        esac
    else
        read -p "Choice [1-2] (Default: 1): " CHOICE
        case "$CHOICE" in
            2) USE_DOCKER=true ;;
            *) USE_DOCKER=false ;;
        esac
    fi
fi

# Hard safety guard for Native Mode on 32-bit userlands
if [ "$USE_DOCKER" = false ] && [ "$USERLAND_ARCH" != "arm64" ] && [ "$USERLAND_ARCH" != "amd64" ] && [ "$USERLAND_ARCH" != "x86_64" ]; then
    echo ""
    error "Native Host Mode requires a 64-bit OS userland (arm64, amd64, or x86_64)."
    echo "Current Architecture: $ARCH"
    echo "Current Userland Architecture: $USERLAND_ARCH"
    echo ""
    echo "Node 22 and C++ native dependencies cannot run natively on 32-bit userlands."
    read -p "Switch to Full Docker Mode instead? (Y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Setup aborted."
        exit 1
    fi
    USE_DOCKER=true
fi

# Patch outdated libseccomp2 on 32-bit userlands to prevent SIGSYS (exit code 159) on arm64
# Very specific for me (romland) since I am trying to get this running on a dirt-old Raspberry Pi already used for other stuff.
if [ "$USERLAND_ARCH" = "armhf" ] || [ "$USERLAND_ARCH" = "arm" ]; then
    SECCOMP_VER=$(dpkg-query -W -f='${Version}' libseccomp2 2>/dev/null || echo "0")
    if [[ "$SECCOMP_VER" < "2.5.0" ]]; then
        info "Upgrading libseccomp2 for 64-bit container syscall compatibility..."
        wget -q http://ftp.debian.org/debian/pool/main/libs/libseccomp/libseccomp2_2.5.4-1+deb12u1_armhf.deb -O /tmp/libseccomp2.deb
        sudo dpkg -i /tmp/libseccomp2.deb && rm -f /tmp/libseccomp2.deb
        sudo systemctl restart docker
        success "libseccomp2 upgraded and Docker daemon restarted!"
    fi
fi

# ------------------------------------------------------------------------------
# Pre-Flight Summary
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}🔍 Checking system prerequisites (${USE_DOCKER:+Full Docker Mode}${USE_DOCKER:-Native Mode})...${NC}"

WILL_INSTALL=()
if [ "$USE_DOCKER" = false ]; then
    command -v git &>/dev/null || WILL_INSTALL+=("Git & build libraries (APT)")
    command -v ffmpeg &>/dev/null || WILL_INSTALL+=("Media processing (FFmpeg, Poppler)")
    command -v node &>/dev/null || WILL_INSTALL+=("Node.js 22 (via NVM)")
    command -v yt-dlp &>/dev/null || WILL_INSTALL+=("yt-dlp (Media downloader)")
fi
command -v docker &>/dev/null || WILL_INSTALL+=("Docker Engine & Docker Compose")

echo ""
echo "itemLens requires the following host adjustments:"
if [ ${#WILL_INSTALL[@]} -eq 0 ]; then
    echo "  • All system dependencies for this mode are already installed!"
else
    for item in "${WILL_INSTALL[@]}"; do
        echo "  • Will install: $item"
    done
fi

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
TOTAL_SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$TOTAL_RAM_MB" -le 4096 ] && [ "$TOTAL_SWAP_MB" -lt 1900 ]; then
    echo "  • Will offer to increase Swap file to 2048MB (recommended for OCR)"
fi

echo ""
if [ "$SKIP_PROMPT" = false ]; then
    read -p "Do you want to proceed with host setup? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled by user."
        exit 0
    fi
fi

# ------------------------------------------------------------------------------
# 1. Memory and Swap Check
# ------------------------------------------------------------------------------
info "Checking RAM and Swap allocation..."
if [ "$TOTAL_RAM_MB" -le 4096 ] && [ "$TOTAL_SWAP_MB" -lt 1900 ]; then
    warn "Low Swap Configuration Detected (${TOTAL_SWAP_MB}MB Swap on ${TOTAL_RAM_MB}MB RAM)."
    echo "Heavy OCR (PaddleOCR) and Vision AI tasks can crash the server due to OOM kills."
    
    if [ -f /etc/dphys-swapfile ]; then
        read -p "Automated fix available: Set swap to 2048MB in /etc/dphys-swapfile? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
            sudo systemctl restart dphys-swapfile
            success "Swap updated to 2048MB!"
        fi
    else
        warn "dphys-swapfile not present. Manually increase your swap space if you encounter OOM errors."
    fi
else
    success "Memory configuration looks solid (${TOTAL_RAM_MB}MB RAM / ${TOTAL_SWAP_MB}MB Swap)."
fi

# ------------------------------------------------------------------------------
# 2. System Packages & Native Build Dependencies (Native Mode Only)
# ------------------------------------------------------------------------------
if [ "$USE_DOCKER" = false ]; then
    info "Installing required APT packages and media libraries..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq \
      curl \
      wget \
      git \
      poppler-utils \
      ffmpeg \
      build-essential \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev
    success "System libraries installed."
else
    info "Skipping host APT package installs (handled inside Docker container)."
fi

# ------------------------------------------------------------------------------
# 3. Node.js 22 LTS (via NVM - Native Mode Only)
# ------------------------------------------------------------------------------
if [ "$USE_DOCKER" = false ]; then
    info "Checking Node.js version..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    CURRENT_NODE_VER=""
    if command -v node &> /dev/null; then
        CURRENT_NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    fi

    if [ "${CURRENT_NODE_VER:-0}" -ge 22 ]; then
        success "Node.js $(node -v) is already installed."
    else
        info "Installing Node.js 22 LTS..."
        if [ ! -s "$NVM_DIR/nvm.sh" ]; then
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        fi
        nvm install 22
        nvm use 22
        nvm alias default 22
        success "Node.js $(node -v) configured."
    fi
else
    info "Skipping host Node.js installation (handled inside Docker container)."
fi

# ------------------------------------------------------------------------------
# 4. Docker & Docker Compose (Required for both modes)
# ------------------------------------------------------------------------------
info "Checking Docker installation..."
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    success "Docker and Docker Compose are already installed."
else
    info "Installing Docker via official convenience script..."
    curl -fsSL https://get.docker.com | sudo sh
    success "Docker installed."
fi

if ! groups "$USER" | grep -q "\bdocker\b"; then
    info "Adding $USER to the 'docker' user group..."
    sudo usermod -aG docker "$USER"
    warn "User added to group 'docker'. Log out and back in (or run 'exec su - \$USER') to refresh permissions."
else
    success "User $USER already belongs to the 'docker' group."
fi

# Prevent credential helper DBus crashes on headless OS
mkdir -p "$HOME/.local/bin"
cat << 'EOF' > "$HOME/.local/bin/docker-credential-secretservice"
#!/bin/sh
if [ "$1" = "get" ]; then
  echo '{"ServerURL":"","Username":"","Secret":""}'
  exit 0
fi
exit 0

# ------------------------------------------------------------------------------
# 5. Media Downloader (yt-dlp - Native Mode Only)
# Override Docker credential store to prevent D-Bus helper crashes on headless hosts
mkdir -p "$HOME/.docker"
cat << 'EOF' > "$HOME/.docker/config.json"
{
  "credsStore": ""
}
EOF
# ------------------------------------------------------------------------------
if [ "$USE_DOCKER" = false ]; then
    info "Checking yt-dlp status..."
    if command -v yt-dlp &> /dev/null; then
        success "yt-dlp is installed. Checking for updates..."
        sudo yt-dlp -U || true
    else
        info "Fetching latest yt-dlp binary..."
        sudo wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
        sudo chmod a+rx /usr/local/bin/yt-dlp
        success "yt-dlp installed to /usr/local/bin/yt-dlp."
    fi
else
    info "Skipping host yt-dlp installation (handled inside Docker container)."
fi

# ------------------------------------------------------------------------------
# 6. Fetch and Extract Latest Release
# ------------------------------------------------------------------------------
info "Downloading latest itemLens release..."
INSTALL_DIR="${HOME}/itemlens"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

RELEASE_API="https://api.github.com/repos/romland/itemLens/releases/latest"
DOWNLOAD_URL=$(curl -s "$RELEASE_API" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for asset in data.get('assets', []):
        if asset['name'].endswith('.tar.gz'):
            print(asset['browser_download_url'])
            break
except Exception: pass
" 2>/dev/null || echo "")

if [ -z "$DOWNLOAD_URL" ]; then
    DOWNLOAD_URL="https://github.com/romland/itemLens/releases/latest/download/itemlens-dist.tar.gz"
fi

curl -fsSL "$DOWNLOAD_URL" -o itemlens-dist.tar.gz
tar -xzf itemlens-dist.tar.gz
rm -f itemlens-dist.tar.gz

# Persist user choice into .env so start.sh knows how to boot
touch .env
if [ "$USE_DOCKER" = true ]; then
    grep -q "^DOCKER_MODE=" .env && sed -i 's/^DOCKER_MODE=.*/DOCKER_MODE=true/' .env || echo "DOCKER_MODE=true" >> .env
else
    grep -q "^DOCKER_MODE=" .env && sed -i 's/^DOCKER_MODE=.*/DOCKER_MODE=false/' .env || echo "DOCKER_MODE=false" >> .env
fi

success "itemLens unpacked into $INSTALL_DIR"

# ------------------------------------------------------------------------------
# Setup Summary
# ------------------------------------------------------------------------------
echo -e "\n=========================================================================="
success "Host setup completed successfully!"
echo "=========================================================================="
echo " - Mode    : $( [ "$USE_DOCKER" = true ] && echo 'Full Docker' || echo 'Native Host' )"
echo " - Node.js : $( [ "$USE_DOCKER" = true ] && echo 'Containerized' || node -v 2>/dev/null || echo 'Reload shell to activate NVM' )"
echo " - Docker  : $(docker compose version 2>/dev/null || echo 'Installed')"
echo " - yt-dlp  : $( [ "$USE_DOCKER" = true ] && echo 'Containerized' || yt-dlp --version 2>/dev/null || echo 'Installed' )"
echo ""
echo "🚀 To start itemLens: ./start.sh"
echo "=========================================================================="