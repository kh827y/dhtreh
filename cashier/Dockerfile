FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json ./
RUN pnpm i --frozen-lockfile=false
COPY . .
RUN pnpm build

FROM node:20-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /app .
EXPOSE 3000
ENV PORT=3000
CMD ["pnpm","start"]
