# syntax = docker/dockerfile:1

FROM node:20-slim AS base

# Install FFmpeg for video processing and HLS generation
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies (including devDependencies needed for build)
COPY package*.json ./
RUN npm ci --include=dev

# Copy application code
COPY . .

# Build Vite frontend & compile backend server.ts bundle
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --omit=dev

# Create uploads directories
RUN mkdir -p uploads/hls uploads/temp uploads/posters uploads/videos

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
