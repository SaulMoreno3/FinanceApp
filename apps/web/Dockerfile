FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.26.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/electron-desktop/package.json apps/electron-desktop/package.json
COPY apps/tauri-desktop/package.json apps/tauri-desktop/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
# Shared pure property types and calculations used by the frontend.
COPY apps/api/src/modules/real-estate apps/api/src/modules/real-estate
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
