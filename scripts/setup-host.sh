#!/usr/bin/env bash
set -e

# Setup color formatting for feedback
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
NC="\033[0m"

info()    { echo -e "\n${BLUE}${BOLD}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"; }

echo -e "${BOLD}🚀 Starting itemLens Host Environment Setup...${NC}"

# ------------------------------------------------------------------------------
# 1. Memory and Swap Check
# ------------------------------------------------------------------------------
info "Checking RAM and Swap allocation..."
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
TOTAL_SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')

if [ "$TOTAL_RAM_MB" -le 4096 ] && [ "$TOTAL_SWAP_MB" -lt 2048 ]; then
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
# 2. System Packages & Native Build Dependencies
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# 3. Node.js 22 LTS (via NVM)
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# 4. Docker & Docker Compose
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

# ------------------------------------------------------------------------------
# 5. Media Downloader (yt-dlp)
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Setup Summary
# ------------------------------------------------------------------------------
echo -e "\n=========================================================================="
success "Host setup completed successfully!"
echo "=========================================================================="
echo " - Node.js : $(node -v 2>/dev/null || echo 'Reload shell to activate NVM')"
echo " - Docker  : $(docker compose version 2>/dev/null || echo 'Installed')"
echo " - yt-dlp  : $(yt-dlp --version 2>/dev/null || echo 'Installed')"
echo "=========================================================================="