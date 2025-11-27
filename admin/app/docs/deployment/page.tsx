export default function DeploymentDocsPage() {
  return (
    <div>
      <h2>Деплой (Docker + Prisma)</h2>
      <h3>API</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`# Сборка
docker build -t loyalty-api ./api

# ENV (пример)
DATABASE_URL=postgresql://loyalty:loyalty@db:5432/loyalty
ADMIN_KEY=... QR_JWT_SECRET=...
CORS_ORIGINS=http://admin:3001,http://miniapp:3003

# Миграции (деплой)
docker run --rm --env DATABASE_URL=$DATABASE_URL loyalty-api pnpm prisma migrate deploy

# Запуск
docker run -d --name api -p 3000:3000 --env-file ./api.env loyalty-api
`}</pre>

      <h3>Bridge</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`docker build -t loyalty-bridge ./bridge
docker run -d --name bridge -p 18080:18080 \
  -e API_BASE=http://api:3000 -e MERCHANT_ID=<merchant_id> -e BRIDGE_SECRET=... loyalty-bridge
`}</pre>

      <h3>Admin/Miniapp</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`docker build -t loyalty-admin ./admin
docker run -d --name admin -p 3001:3001 \
  -e API_BASE=http://api:3000 \
  -e NEXT_PUBLIC_API_BASE=http://api:3000 \
  -e NEXT_PUBLIC_API_KEY=... \
  -e ADMIN_KEY=... \
  -e ADMIN_UI_PASSWORD=... \
  -e ADMIN_SESSION_SECRET=change_me_long_random \
  loyalty-admin

docker build -t loyalty-miniapp ./miniapp
docker run -d --name miniapp -p 3003:3003 -e NEXT_PUBLIC_API_BASE=http://api:3000 loyalty-miniapp
`}</pre>
      <p>База данных и вспомогательные сервисы — см. infra/docker-compose.yml (PostgreSQL/Redis).</p>
    </div>
  );
}
