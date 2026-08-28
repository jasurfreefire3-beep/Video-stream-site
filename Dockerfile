# syntax = docker/dockerfile:1

FROM node:20-slim AS base

# Install FFmpeg for video processing and HLS generation
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000

# Install dependencies (use npm install so missing lockfile won't fail)
COPY package.json ./
RUN npm install

# Copy application code
COPY . .

# Build Vite frontend & compile backend server.ts bundle
RUN npm run build

ENV NODE_ENV=production

# Create uploads directories
RUN mkdir -p uploads/hls uploads/temp uploads/posters uploads/videos dist

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
