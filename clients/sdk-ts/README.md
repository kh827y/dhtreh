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
  positions: [{ productId: 'P-1', qty: 1, price: 1000 }],
}, { staffKey: '...' });

// COMMIT
const c = await api.commit({ merchantId: 'M-1', holdId: q.holdId!, orderId: 'O-1' }, { idempotencyKey: 'commit:M-1:O-1' });

// REFUND
const r = await api.refund({ merchantId: 'M-1', orderId: 'O-1', refundTotal: 100 });
```

## Referrals (beta/preview)

```ts
const api = new LoyaltyApi({ baseUrl: 'http://localhost:3000' });
const API_KEY = 'test-api-key';

// 1) Создать программу
const program = await api.referrals.program({
  merchantId: 'M-REF',
  name: 'Invite friends',
  referrerReward: 20,
  refereeReward: 10,
  minPurchaseAmount: 100,
}, { apiKey: API_KEY });

// 2) Создать реферальную ссылку/код
const link = await api.referrals.create({ merchantId: 'M-REF', referrerId: 'C1', channel: 'LINK' }, { apiKey: API_KEY });

// 3) Активация кода при регистрации/логине приглашённого
const act = await api.referrals.activate({ code: link.code, refereeId: 'C2' }, { apiKey: API_KEY });

// 4) Завершение после первой покупки (начисление рефереру)
const done = await api.referrals.complete({ refereeId: 'C2', merchantId: 'M-REF', purchaseAmount: 500 }, { apiKey: API_KEY });
```
