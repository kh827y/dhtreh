// prisma/seed.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const id = 'M-1';
  const name = 'Demo Merchant';
  await prisma.merchant.upsert({
    where: { id },
    update: {},
    create: {
      id, name,
      settings: { create: { earnBps: 500, redeemLimitBps: 5000 } },
    },
  });
  console.log('Seeded merchant', id);

  // Seed default subscription plans if absent
  const plans = [
    { id: 'plan_free', name: 'free', displayName: 'Бесплатный', price: 0, currency: 'RUB', interval: 'month', features: { description: 'Для малого бизнеса' }, maxTransactions: 1000, maxCustomers: 100, maxOutlets: 1, webhooksEnabled: false, customBranding: false, prioritySupport: false, apiAccess: false },
    { id: 'plan_starter', name: 'starter', displayName: 'Стартовый', price: 199000, currency: 'RUB', interval: 'month', features: { description: 'Для растущего бизнеса' }, maxTransactions: 10000, maxCustomers: 1000, maxOutlets: 3, webhooksEnabled: true, customBranding: false, prioritySupport: false, apiAccess: true },
    { id: 'plan_business', name: 'business', displayName: 'Бизнес', price: 499000, currency: 'RUB', interval: 'month', features: { description: 'Для среднего бизнеса' }, maxTransactions: 100000, maxCustomers: 10000, maxOutlets: 10, webhooksEnabled: true, customBranding: true, prioritySupport: false, apiAccess: true },
    { id: 'plan_enterprise', name: 'enterprise', displayName: 'Корпоративный', price: 1999000, currency: 'RUB', interval: 'month', features: { description: 'Для крупного бизнеса' }, maxTransactions: null, maxCustomers: null, maxOutlets: null, webhooksEnabled: true, customBranding: true, prioritySupport: true, apiAccess: true },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    }).catch(() => {});
  }
  console.log('Seeded default plans');
}

main().finally(() => prisma.$disconnect());
