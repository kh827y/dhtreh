const { PrismaClient } = require('@prisma/client');
const {
  nowMinus,
  createOutlets,
  createAccessGroups,
  createStaff,
  createCustomers,
  createSegments,
  createLoyaltyTiers,
  createCommunicationAssets,
  createPromoCodes,
  createPromotions,
  createMechanics,
  createCatalog,
  createDataImports,
  createAnalytics,
} = require('./seed-factories.cjs');

const prisma = new PrismaClient();

async function ensureMerchant() {
  const merchant = await prisma.merchant.upsert({
    where: { id: 'M-1' },
    update: {
      name: 'Demo Merchant',
      portalEmail: 'owner@demo.test',
      portalLoginEnabled: true,
      portalLastLoginAt: nowMinus({ days: 1 }),
      cashierLogin: 'demomerchant',
      cashierPassword9: '123-456-789',
      cashierPasswordUpdatedAt: new Date(),
    },
    create: {
      id: 'M-1',
      name: 'Demo Merchant',
      portalEmail: 'owner@demo.test',
      portalPasswordHash: 'hash-demo-password',
      portalLoginEnabled: true,
      portalTotpEnabled: false,
      portalLastLoginAt: nowMinus({ days: 1 }),
      cashierLogin: 'demomerchant',
      cashierPassword9: '123-456-789',
      cashierPasswordUpdatedAt: new Date(),
      settings: {
        create: {
          earnBps: 300,
          redeemLimitBps: 5000,
          qrTtlSec: 180,
          redeemCooldownSec: 30,
          earnCooldownSec: 0,
          monthlyReports: true,
          phone: '+79990000000',
          smsSignature: 'DEMO',
        },
      },
    },
  });

  return merchant;
}

async function seedPlans() {
  const plans = [
    {
      id: 'plan_free',
      name: 'free',
      displayName: 'Бесплатный',
      price: 0,
      currency: 'RUB',
      interval: 'month',
      features: { description: 'Для малого бизнеса' },
      maxTransactions: 1000,
      maxCustomers: 100,
      maxOutlets: 1,
      webhooksEnabled: false,
      customBranding: false,
      prioritySupport: false,
      apiAccess: false,
    },
    {
      id: 'plan_starter',
      name: 'starter',
      displayName: 'Стартовый',
      price: 199000,
      currency: 'RUB',
      interval: 'month',
      features: { description: 'Для растущего бизнеса' },
      maxTransactions: 10000,
      maxCustomers: 1000,
      maxOutlets: 3,
      webhooksEnabled: true,
      customBranding: false,
      prioritySupport: false,
      apiAccess: true,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
  }
}

async function main() {
  const merchant = await ensureMerchant();
  await seedPlans();

  // prepare owner stub so FK constraints are satisfied for access groups
  await prisma.staff.upsert({
    where: { id: 'staff-owner' },
    update: {},
    create: {
      id: 'staff-owner',
      merchantId: merchant.id,
      role: 'MERCHANT',
      status: 'ACTIVE',
      portalState: 'ENABLED',
      canAccessPortal: true,
      portalAccessEnabled: true,
    },
  });

  const outlets = await createOutlets(prisma, merchant.id);
  const accessGroups = await createAccessGroups(prisma, merchant.id, 'staff-owner');
  const staff = await createStaff(prisma, merchant.id, accessGroups, outlets);
  const customers = await createCustomers(prisma, merchant.id);
  const segments = await createSegments(prisma, merchant.id, staff, customers);
  const tiers = await createLoyaltyTiers(prisma, merchant.id, customers, staff);
  const templates = await createCommunicationAssets(prisma, merchant.id, staff.manager);
  await createPromoCodes(prisma, merchant.id, segments, tiers, staff, customers, outlets);
  await createPromotions(prisma, merchant.id, segments, tiers, staff, templates, customers, outlets);
  await createMechanics(prisma, merchant.id, staff);
  await createCatalog(prisma, merchant.id, outlets);
  await createDataImports(prisma, merchant.id, staff);
  await createAnalytics(prisma, merchant.id, staff, outlets, customers, segments);

  console.log('Seed data prepared for merchant portal demo');
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
