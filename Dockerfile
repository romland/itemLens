# --- STAGE 1: Build Application ---
FROM node:22-bullseye-slim AS builder

WORKDIR /app

COPY .npmrc package*.json ./
COPY prisma ./prisma/

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm ci && npx prisma generate

COPY postcss.config.cjs tailwind.config.cjs svelte.config.js tsconfig.json vite.config.ts ./
COPY src ./src
COPY static ./static

RUN npm run build

# --- STAGE 2: Production Runtime ---
FROM node:22-bullseye-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    ffmpeg \
    python3 \
    wget \
    ca-certificates \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
 && wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY package*.json server.js ./

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["sh", "-c", "npx prisma db push && node server.js"]