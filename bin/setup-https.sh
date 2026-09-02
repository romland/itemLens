#!/usr/bin/env bash
set -e

# I need this because I run it on LAN and must have a self-signed cert for PWA features

echo "==> Setting up Ephemeral Local HTTPS (Linux / WSL)..."

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        MKARCH="amd64" ;;
  aarch64|arm64) MKARCH="arm64" ;;
  *) echo "[-] Unsupported architecture: $ARCH"; exit 1 ;;
esac

# 1. Install nss-tools & download valid mkcert binary
if ! command -v mkcert &> /dev/null || ! mkcert -version &> /dev/null; then
  echo "[+] Installing mkcert binary and NSS dependencies..."
  
  if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq || true
    sudo apt-get install -y -qq libnss3-tools curl
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y -q nss-tools curl
  elif command -v pacman &> /dev/null; then
    sudo pacman -Sy --noconfirm nss curl
  fi

  echo "[+] Downloading official mkcert binary for ${MKARCH}..."
  sudo rm -f /usr/local/bin/mkcert
  sudo curl -fsSL -o /usr/local/bin/mkcert "https://dl.filippo.io/mkcert/latest?for=linux/${MKARCH}"
  sudo chmod +x /usr/local/bin/mkcert
else
  echo "[✓] Valid mkcert binary detected."
fi

# 2. Re-initialize Local Root CA
echo "[+] Initializing local CA..."
mkcert -install

# 3. Ensure npm package vite-plugin-mkcert is installed
if ! grep -q "vite-plugin-mkcert" package.json 2>/dev/null; then
  echo "[+] Installing vite-plugin-mkcert dev dependency..."
  npm install -D vite-plugin-mkcert --silent
else
  echo "[✓] vite-plugin-mkcert present in package.json."
fi

# 4. Copy Root CA to current working directory
CA_DIR=$(mkcert -CAROOT)
if [ -f "$CA_DIR/rootCA.pem" ]; then
  cp -f "$CA_DIR/rootCA.pem" ./rootCA.crt
  echo "[✓] Root CA exported to ./rootCA.crt"
else
  echo "[-] Failed to locate generated rootCA.pem"
  exit 1
fi

# 5. Resolve IP & handle WSL live port forwarding
LAN_IP=""
if grep -qi microsoft /proc/version 2>/dev/null && command -v powershell.exe &>/dev/null; then
  echo "[+] WSL detected. Configuring Windows host port forwarding live..."
  
  WSL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
  
  # Target physical host network adapter attached to the IPv4 Default Gateway (ignores vEthernet)
  LAN_IP=$(powershell.exe -NoProfile -Command "((Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -ne \$null }).IPv4Address.IPAddress | Select-Object -First 1)" 2>/dev/null | tr -d '\r\n')

  # Base64 encode the elevated PowerShell command in memory to bypass Start-Process quote parsing bugs
  PS_SCRIPT="\$cmd = 'netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=${WSL_IP}; netsh interface portproxy add v4tov4 listenport=1025 listenaddress=0.0.0.0 connectport=1025 connectaddress=${WSL_IP}; New-NetFirewallRule -DisplayName WSL_Dev_Ports -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173,1025 -ErrorAction SilentlyContinue'; \$bytes = [System.Text.Encoding]::Unicode.GetBytes(\$cmd); \$encoded = [System.Convert]::ToBase64String(\$bytes); Start-Process powershell -Verb RunAs -ArgumentList \"-NoProfile -EncodedCommand \$encoded\""

  powershell.exe -NoProfile -Command "$PS_SCRIPT"
else
  LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
fi

echo ""
echo "=================================================================="
echo " SUCCESS: Local HTTPS setup complete."
echo "=================================================================="
echo " Serve rootCA.crt to your phone via HTTP:"
echo "   python3 -m http.server 1025"
echo ""
echo " Open on your phone browser:"
echo "   http://${LAN_IP}:1025/rootCA.crt"
echo ""
echo " Install 'rootCA.crt' as a Trusted Root CA on your device."
echo " Your Vite dev server will run at: https://${LAN_IP}:5173"
echo "=================================================================="

echo "[+] Starting HTTP server to serve the certificate..."
echo "[!] Press Ctrl+C to stop this server once you've downloaded it to your phone."
python3 -m http.server 1025 --bind 0.0.0.0
