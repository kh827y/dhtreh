import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPlans() {
  const plans = [
    {
      id: 'plan_free',
      name: 'free',
      displayName: 'Free',
      description: 'Бесплатный план для небольших бизнесов',
      price: 0,
      currency: 'RUB',
      interval: 'month',
      trialDays: 0,
      isActive: true,
      maxTransactions: 1000,
      maxCustomers: 100,
      maxOutlets: 1,
      maxDevices: 2,
      webhooksEnabled: false,
      customBranding: false,
      prioritySupport: false,
      apiAccess: false,
      features: {
        basicReports: true,
        emailNotifications: false,
        smsNotifications: false,
        exportData: false,
        multiUser: false,
        advancedAnalytics: false,
      },
    },
    {
      id: 'plan_starter',
      name: 'starter',
      displayName: 'Starter',
      description: 'Идеально для растущего бизнеса',
      price: 2900,
      currency: 'RUB',
      interval: 'month',
      trialDays: 14,
      isActive: true,
      maxTransactions: 10000,
      maxCustomers: 1000,
      maxOutlets: 3,
      maxDevices: 5,
      webhooksEnabled: true,
      customBranding: false,
      prioritySupport: false,
      apiAccess: true,
      features: {
        basicReports: true,
        emailNotifications: true,
        smsNotifications: false,
        exportData: true,
        multiUser: true,
        advancedAnalytics: false,
      },
    },
    {
      id: 'plan_business',
      name: 'business',
      displayName: 'Business',
      description: 'Полный функционал для серьезного бизнеса',
      price: 9900,
      currency: 'RUB',
      interval: 'month',
      trialDays: 14,
      isActive: true,
      maxTransactions: 100000,
      maxCustomers: 10000,
      maxOutlets: 10,
      maxDevices: 20,
      webhooksEnabled: true,
      customBranding: true,
      prioritySupport: false,
      apiAccess: true,
      features: {
        basicReports: true,
        emailNotifications: true,
        smsNotifications: true,
        exportData: true,
        multiUser: true,
        advancedAnalytics: true,
        customRules: true,
        campaigns: true,
        segments: true,
      },
    },
    {
      id: 'plan_enterprise',
      name: 'enterprise',
      displayName: 'Enterprise',
      description: 'Индивидуальные условия для крупного бизнеса',
      price: 29900,
      currency: 'RUB',
      interval: 'month',
      trialDays: 30,
      isActive: true,
      maxTransactions: null, // unlimited
      maxCustomers: null, // unlimited
      maxOutlets: null, // unlimited
      maxDevices: null, // unlimited
      webhooksEnabled: true,
      customBranding: true,
      prioritySupport: true,
      apiAccess: true,
      features: {
        basicReports: true,
        emailNotifications: true,
        smsNotifications: true,
        exportData: true,
        multiUser: true,
        advancedAnalytics: true,
        customRules: true,
        campaigns: true,
        segments: true,
        whiteLabel: true,
        dedicatedSupport: true,
        sla: true,
        customIntegrations: true,
      },
    },
  ];

  console.log('🌱 Seeding subscription plans...');

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
    console.log(`✅ Plan "${plan.displayName}" created/updated`);
  }

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
