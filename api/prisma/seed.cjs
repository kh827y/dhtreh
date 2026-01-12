const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const FULL_PLAN_ID = 'plan_full';

async function seedMinimal() {
  const fullPlan = {
    id: FULL_PLAN_ID,
    name: 'full',
    displayName: 'Full',
    price: 0,
    currency: 'RUB',
    interval: 'day',
    features: { all: true },
    maxTransactions: null,
    maxCustomers: null,
    maxOutlets: null,
    webhooksEnabled: true,
    customBranding: true,
    prioritySupport: true,
    apiAccess: true,
    isActive: true,
  };

  await prisma.plan.upsert({
    where: { id: fullPlan.id },
    update: fullPlan,
    create: fullPlan,
  });

  console.log('Seed completed: plan_full');
}

seedMinimal()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
