FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY miniapp ./miniapp
RUN pnpm i --frozen-lockfile=false --filter miniapp...
RUN pnpm --filter miniapp build

FROM node:20-slim
WORKDIR /app/miniapp
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /app /app
EXPOSE 3003
ENV PORT=3003
CMD ["pnpm","start"]
