#!/usr/bin/env bash
set -e

PKG_VERSION=$(node -p "require('./package.json').version")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_DATE=$(date +'%Y%m%d')
VERSION="${PKG_VERSION}-${BUILD_DATE}-${GIT_HASH}"

echo "🏷️ Packaging itemLens ${VERSION}..."
echo "🧹 Clearing old dist files..."
rm -rf dist itemlens-dist.tar.gz itemlens-*.tar.gz

echo "📦 Building SvelteKit app..."
npm run build

echo "📋 Copying build output (blocking images/u from entering dist)..."
mkdir -p dist
rsync -av \
  --exclude='client/images/u/*' \
  --exclude='client/images/tests/*' \
  build/ dist/build/

# Recreate empty upload folder so SvelteKit/Node won't complain about missing paths
mkdir -p dist/build/client/images/u

echo "${VERSION}" > dist/VERSION

echo "🗄️ Copying Prisma & configuration..."
cp -r prisma dist/
cp package.json package-lock.json .env.example dist/

echo "🐳 Copying Docker services (skipping .git & permission-locked caches)..."
rsync -av \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='singlefile/chrome-data' \
  --exclude='singlefile/node_modules' \
  --exclude='rembg-data' \
  --exclude='paddleocr/paddlex_cache' \
  --exclude='paddleocr/downloads' \
  --exclude='*.log' \
  --exclude='*.pid' \
  --exclude='Singleton*' \
  services/ dist/services/

echo "📜 Generating launch script..."
cat << 'EOF' > dist/start.sh
#!/usr/bin/env bash
set -e

mkdir -p build/client/images/u
mkdir -p services/rembg-data
mkdir -p services/singlefile/chrome-data
mkdir -p services/paddleocr/downloads
mkdir -p services/paddleocr/paddlex_cache

if [ ! -f .env ]; then
  echo "⚠️ No .env found, copying from .env.example..."
  cp .env.example .env
fi

echo "🐳 Starting Docker microservices (RemBG, PaddleOCR, SingleFile)..."
(cd services && docker compose up -d)

echo "📦 Installing production dependencies..."
npm ci --omit=dev

echo "🗄️ Running database migrations..."
npx prisma migrate deploy || npx prisma db push

echo "🚀 Starting itemLens server on port ${PORT:-3000}..."
PORT=${PORT:-3000} node build
EOF

chmod +x dist/start.sh

echo "🗜️ Creating archive itemlens-${VERSION}.tar.gz..."
tar -czf "itemlens-${VERSION}.tar.gz" -C dist .
cp "itemlens-${VERSION}.tar.gz" itemlens-dist.tar.gz

echo "✅ Distribution package created successfully!"
