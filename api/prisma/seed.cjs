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
}

main().finally(() => prisma.$disconnect());
