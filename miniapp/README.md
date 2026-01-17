# Miniapp (Telegram)

Клиентская мини‑аппа для Telegram (Next.js).

## Локальный запуск

```bash
pnpm --filter miniapp dev
```

## Переменные окружения

См. `infra/env-examples/miniapp.env.example`:

- `NEXT_PUBLIC_API_BASE`

TTL QR берётся из настроек мерчанта (`qrTtlSec`), по умолчанию 300 секунд.
Для запуска miniapp требуется `merchantId` в URL (Menu Button или `?merchantId=...`).
