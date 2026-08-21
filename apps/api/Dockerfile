FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.26.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/electron-desktop/package.json apps/electron-desktop/package.json
COPY apps/tauri-desktop/package.json apps/tauri-desktop/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter api build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN npm install --global pnpm@10.26.0

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/src/generated apps/api/src/generated
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules

RUN mkdir -p /app/apps/api/uploads
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "start"]
