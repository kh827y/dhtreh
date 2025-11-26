import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FULL_PLAN_ID = 'plan_full';

async function seedPlans() {
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

  console.log('🌱 Seeding subscription plans...');

  await prisma.plan.upsert({
    where: { id: fullPlan.id },
    update: fullPlan,
    create: fullPlan,
  });
  console.log(`✅ Plan "${fullPlan.displayName}" создан/обновлён`);
  console.log('✨ Plans seeding completed!');
}

async function main() {
  try {
    await seedPlans();
  } catch (error) {
    console.error('Error seeding plans:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
