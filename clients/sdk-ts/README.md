# Loyalty TypeScript SDK (minimal)

Минимальный SDK для работы с Loyalty API из Node/браузера.

## Использование

```ts
import { LoyaltyApi } from '@loyalty/sdk-ts';

const api = new LoyaltyApi({ baseUrl: 'http://localhost:3000' });

// QUOTE
const q = await api.quote({
  mode: 'redeem',
  merchantId: 'M-1',
  userToken: 'user-1',
  orderId: 'O-1',
  total: 1000,
  eligibleTotal: 1000,
}, { staffKey: '...' });

// COMMIT
const c = await api.commit({ merchantId: 'M-1', holdId: q.holdId!, orderId: 'O-1' }, { idempotencyKey: 'commit:M-1:O-1' });

// REFUND
const r = await api.refund({ merchantId: 'M-1', orderId: 'O-1', refundTotal: 100 });
```

