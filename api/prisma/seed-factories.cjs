const crypto = require('node:crypto');

function nowMinus({ days = 0, hours = 0 }) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(date.getHours() - hours);
  return date;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function createOutlets(prisma, merchantId) {
  const main = await prisma.outlet.upsert({
    where: { id: 'outlet-main' },
    update: {
      name: 'Главный магазин',
      address: 'Москва, Тверская 12',
      code: 'main',
      tags: ['флагман', '24/7'],
      scheduleEnabled: true,
      scheduleMode: 'CUSTOM',
      integrationProvider: 'iiko',
      integrationLocationCode: 'IIKO-001',
      integrationPayload: { warehouseCode: 'M1', sync: true },
    },
    create: {
      id: 'outlet-main',
      merchantId,
      name: 'Главный магазин',
      address: 'Москва, Тверская 12',
      code: 'main',
      tags: ['флагман', '24/7'],
      scheduleEnabled: true,
      scheduleMode: 'CUSTOM',
      integrationProvider: 'iiko',
      integrationLocationCode: 'IIKO-001',
      integrationPayload: { warehouseCode: 'M1', sync: true },
    },
  });

  await prisma.outletSchedule.deleteMany({ where: { outletId: main.id } });
  await prisma.outletSchedule.createMany({
    data: Array.from({ length: 5 }, (_, idx) => ({
      outletId: main.id,
      dayOfWeek: idx,
      opensAt: '08:00',
      closesAt: '22:00',
      isDayOff: false,
      notes: idx === 4 ? 'короткий день' : null,
    })).concat([
      { outletId: main.id, dayOfWeek: 5, opensAt: '10:00', closesAt: '18:00', isDayOff: false },
      { outletId: main.id, dayOfWeek: 6, opensAt: null, closesAt: null, isDayOff: true },
    ]),
    skipDuplicates: true,
  });

  const kiosk = await prisma.outlet.upsert({
    where: { id: 'outlet-kiosk' },
    update: {
      name: 'Киоск в бизнес-центре',
      address: 'Москва, Пресненская наб. 8',
      code: 'kiosk',
      tags: ['iiko-sync'],
      integrationProvider: 'poster',
      integrationLocationCode: 'POS-778',
      integrationPayload: { cashRegister: 'K1' },
    },
    create: {
      id: 'outlet-kiosk',
      merchantId,
      name: 'Киоск в бизнес-центре',
      address: 'Москва, Пресненская наб. 8',
      code: 'kiosk',
      tags: ['iiko-sync'],
      scheduleEnabled: false,
      integrationProvider: 'poster',
      integrationLocationCode: 'POS-778',
      integrationPayload: { cashRegister: 'K1' },
    },
  });

  return { main, kiosk };
}

async function createAccessGroups(prisma, merchantId, ownerId) {
  const groups = [
    {
      id: 'access-owner',
      name: 'Владелец',
      scope: 'PORTAL',
      isSystem: true,
      isDefault: true,
      description: 'Полный доступ ко всем разделам',
    },
    {
      id: 'access-manager',
      name: 'Менеджер',
      scope: 'PORTAL',
      isSystem: false,
      isDefault: false,
      description: 'Управление акциями и каталогом',
    },
    {
      id: 'access-cashier',
      name: 'Кассир',
      scope: 'CASHIER',
      isSystem: false,
      isDefault: false,
      description: 'Работа только в панели кассира',
    },
  ];

  const permissionMatrix = {
    owner: [
      ['dashboard', 'manage'],
      ['staff', 'manage'],
      ['catalog', 'manage'],
      ['analytics', 'view'],
      ['promo', 'manage'],
      ['audience', 'manage'],
      ['settings', 'manage'],
    ],
    manager: [
      ['dashboard', 'view'],
      ['staff', 'view'],
      ['catalog', 'manage'],
      ['promo', 'manage'],
      ['audience', 'manage'],
      ['analytics', 'view'],
    ],
    cashier: [
      ['cashier', 'operate'],
      ['analytics', 'view-own'],
    ],
  };

  const created = {};
  for (const group of groups) {
    const record = await prisma.accessGroup.upsert({
      where: { id: group.id },
      update: {
        name: group.name,
        description: group.description,
        scope: group.scope,
        isSystem: group.isSystem,
        isDefault: group.isDefault,
        updatedById: ownerId,
      },
      create: {
        id: group.id,
        merchantId,
        name: group.name,
        description: group.description,
        scope: group.scope,
        isSystem: group.isSystem,
        isDefault: group.isDefault,
        createdById: ownerId,
      },
    });

    await prisma.accessGroupPermission.deleteMany({ where: { groupId: record.id } });
    const matrix = permissionMatrix[group.id.split('-')[1]] || [];
    if (matrix.length) {
      await prisma.accessGroupPermission.createMany({
        data: matrix.map(([resource, action]) => ({
          groupId: record.id,
          resource,
          action,
          conditions: resource === 'analytics' && action === 'view-own' ? { scope: 'self' } : null,
        })),
      });
    }
    created[group.id] = record;
  }

  return created;
}

async function createStaff(prisma, merchantId, accessGroups, outlets) {
  const owner = await prisma.staff.upsert({
    where: { id: 'staff-owner' },
    update: {
      status: 'ACTIVE',
      portalState: 'ENABLED',
      email: 'owner@demo.test',
      phone: '+79990001111',
      canAccessPortal: true,
      portalAccessEnabled: true,
      lastPortalLoginAt: nowMinus({ days: 1 }),
      lastActivityAt: new Date(),
    },
    create: {
      id: 'staff-owner',
      merchantId,
      role: 'MERCHANT',
      status: 'ACTIVE',
      portalState: 'ENABLED',
      email: 'owner@demo.test',
      phone: '+79990001111',
      firstName: 'Анна',
      lastName: 'Иванова',
      position: 'Основатель',
      canAccessPortal: true,
      portalAccessEnabled: true,
      isOwner: true,
      hiredAt: nowMinus({ days: 400 }),
      lastPortalLoginAt: nowMinus({ days: 1 }),
      lastActivityAt: new Date(),
      comment: 'Создан автоматически при регистрации мерчанта',
    },
  });

  const manager = await prisma.staff.upsert({
    where: { id: 'staff-manager' },
    update: {
      status: 'ACTIVE',
      portalState: 'ENABLED',
      email: 'manager@demo.test',
      canAccessPortal: true,
      portalAccessEnabled: true,
      lastPortalLoginAt: nowMinus({ days: 2 }),
      lastActivityAt: nowMinus({ hours: 5 }),
    },
    create: {
      id: 'staff-manager',
      merchantId,
      role: 'ADMIN',
      status: 'ACTIVE',
      portalState: 'ENABLED',
      email: 'manager@demo.test',
      phone: '+79990002222',
      firstName: 'Борис',
      lastName: 'Менеджеров',
      position: 'Менеджер лояльности',
      canAccessPortal: true,
      portalAccessEnabled: true,
      hiredAt: nowMinus({ days: 220 }),
      lastPortalLoginAt: nowMinus({ days: 2 }),
      lastActivityAt: nowMinus({ hours: 5 }),
    },
  });

  const cashier = await prisma.staff.upsert({
    where: { id: 'staff-cashier' },
    update: {
      status: 'ACTIVE',
      portalState: 'DISABLED',
      canAccessPortal: false,
      portalAccessEnabled: false,
      lastCashierLoginAt: nowMinus({ hours: 2 }),
      lastActivityAt: nowMinus({ hours: 2 }),
    },
    create: {
      id: 'staff-cashier',
      merchantId,
      role: 'CASHIER',
      status: 'ACTIVE',
      portalState: 'DISABLED',
      email: null,
      phone: '+79990003333',
      firstName: 'Виктория',
      lastName: 'Кассирова',
      position: 'Старший кассир',
      canAccessPortal: false,
      portalAccessEnabled: false,
      hiredAt: nowMinus({ days: 120 }),
      lastCashierLoginAt: nowMinus({ hours: 2 }),
      lastActivityAt: nowMinus({ hours: 2 }),
    },
  });

  const archived = await prisma.staff.upsert({
    where: { id: 'staff-archived' },
    update: {
      status: 'FIRED',
      firedAt: nowMinus({ days: 10 }),
      portalState: 'LOCKED',
      portalAccessEnabled: false,
      canAccessPortal: false,
    },
    create: {
      id: 'staff-archived',
      merchantId,
      role: 'CASHIER',
      status: 'FIRED',
      portalState: 'LOCKED',
      email: 'ex@demo.test',
      firstName: 'Григорий',
      lastName: 'Уволенный',
      position: 'Кассир',
      canAccessPortal: false,
      portalAccessEnabled: false,
      hiredAt: nowMinus({ days: 320 }),
      firedAt: nowMinus({ days: 10 }),
      terminationReason: 'Смена места работы',
    },
  });

  const assignments = [
    { staffId: owner.id, groupId: accessGroups['access-owner'].id, isPrimary: true },
    { staffId: manager.id, groupId: accessGroups['access-manager'].id, isPrimary: true },
    { staffId: cashier.id, groupId: accessGroups['access-cashier'].id, isPrimary: true },
  ];

  for (const assignment of assignments) {
    await prisma.staffAccessGroup.upsert({
      where: { id: `${assignment.staffId}-${assignment.groupId}` },
      update: {
        merchantId,
        staffId: assignment.staffId,
        groupId: assignment.groupId,
        isPrimary: assignment.isPrimary,
        assignedById: owner.id,
      },
      create: {
        id: `${assignment.staffId}-${assignment.groupId}`,
        merchantId,
        staffId: assignment.staffId,
        groupId: assignment.groupId,
        isPrimary: assignment.isPrimary,
        assignedById: owner.id,
      },
    });
  }

  await prisma.staffAccessLog.createMany({
    data: [
      {
        id: 'log-owner-portal',
        merchantId,
        staffId: manager.id,
        actorId: owner.id,
        action: 'PORTAL_ACCESS_ENABLED',
        payload: { reason: 'Повышение' },
      },
      {
        id: 'log-cashier-pin',
        merchantId,
        staffId: cashier.id,
        actorId: manager.id,
        action: 'PIN_REGENERATED',
        payload: { outletId: outlets.main.id },
      },
    ],
    skipDuplicates: true,
  });

  await prisma.staffOutletAccess.upsert({
    where: { id: 'soa-manager-main' },
    update: {
      status: 'ACTIVE',
      pinCode: '4821',
      pinCodeHash: hashPin('4821'),
      pinIssuedById: owner.id,
      pinIssuedAt: nowMinus({ days: 30 }),
      lastTxnAt: nowMinus({ days: 1 }),
    },
    create: {
      id: 'soa-manager-main',
      merchantId,
      staffId: manager.id,
      outletId: outlets.main.id,
      status: 'ACTIVE',
      pinCode: '4821',
      pinCodeHash: hashPin('4821'),
      pinIssuedById: owner.id,
      pinIssuedAt: nowMinus({ days: 30 }),
      lastTxnAt: nowMinus({ days: 1 }),
    },
  });

  await prisma.staffOutletAccess.upsert({
    where: { id: 'soa-cashier-main' },
    update: {
      status: 'ACTIVE',
      pinCode: '9075',
      pinCodeHash: hashPin('9075'),
      pinIssuedById: manager.id,
      pinIssuedAt: nowMinus({ days: 7 }),
      lastTxnAt: nowMinus({ hours: 3 }),
    },
    create: {
      id: 'soa-cashier-main',
      merchantId,
      staffId: cashier.id,
      outletId: outlets.main.id,
      status: 'ACTIVE',
      pinCode: '9075',
      pinCodeHash: hashPin('9075'),
      pinIssuedById: manager.id,
      pinIssuedAt: nowMinus({ days: 7 }),
      lastTxnAt: nowMinus({ hours: 3 }),
    },
  });

  await prisma.staffOutletAccess.upsert({
    where: { id: 'soa-cashier-kiosk' },
    update: {
      status: 'REVOKED',
      pinCode: null,
      pinCodeHash: null,
      revokedAt: nowMinus({ days: 2 }),
      revokedById: manager.id,
    },
    create: {
      id: 'soa-cashier-kiosk',
      merchantId,
      staffId: cashier.id,
      outletId: outlets.kiosk.id,
      status: 'REVOKED',
      pinCode: null,
      pinCodeHash: null,
      revokedAt: nowMinus({ days: 2 }),
      revokedById: manager.id,
    },
  });

  await prisma.staffInvitation.upsert({
    where: { id: 'invite-analyst' },
    update: {
      status: 'PENDING',
      expiresAt: nowMinus({ days: -3 }),
    },
    create: {
      id: 'invite-analyst',
      merchantId,
      email: 'analyst@demo.test',
      firstName: 'Дарья',
      lastName: 'Аналитик',
      role: 'ADMIN',
      status: 'PENDING',
      accessGroupId: accessGroups['access-manager'].id,
      invitedById: owner.id,
      token: 'token-analyst',
      expiresAt: nowMinus({ days: -3 }),
    },
  });

  await prisma.staffInvitation.upsert({
    where: { id: 'invite-cashier-accepted' },
    update: {
      status: 'ACCEPTED',
      staffId: cashier.id,
      acceptedAt: nowMinus({ days: 20 }),
    },
    create: {
      id: 'invite-cashier-accepted',
      merchantId,
      email: 'cashier@demo.test',
      role: 'CASHIER',
      status: 'ACCEPTED',
      staffId: cashier.id,
      invitedById: manager.id,
      token: 'token-cashier',
      accessGroupId: accessGroups['access-cashier'].id,
      expiresAt: nowMinus({ days: -30 }),
      acceptedAt: nowMinus({ days: 20 }),
    },
  });

  return { owner, manager, cashier, archived };
}
async function createCustomers(prisma, merchantId) {
  const customers = {};
  const data = [
    {
      id: 'customer-alex',
      phone: '+79995550011',
      email: 'alex@demo.test',
      name: 'Алексей Петров',
      gender: 'male',
      city: 'Москва',
      tags: ['кофеман', 'утро'],
      birthday: nowMinus({ days: 9000 }),
    },
    {
      id: 'customer-maria',
      phone: '+79995550022',
      email: 'maria@demo.test',
      name: 'Мария Смирнова',
      gender: 'female',
      city: 'Москва',
      tags: ['чай', 'семья'],
      birthday: nowMinus({ days: 12000 }),
    },
    {
      id: 'customer-ivan',
      phone: '+79995550033',
      email: 'ivan@demo.test',
      name: 'Иван Кузнецов',
      gender: 'male',
      city: 'Химки',
      tags: ['редко'],
      birthday: nowMinus({ days: 8000 }),
    },
  ];

  for (const customer of data) {
    customers[customer.id] = await prisma.customer.upsert({
      where: { id: customer.id },
      update: customer,
      create: {
        id: customer.id,
        ...customer,
      },
    });
  }

  return customers;
}

async function createSegments(prisma, merchantId, staff, customers) {
  const activeSegment = await prisma.customerSegment.upsert({
    where: { id: 'segment-active' },
    update: {
      name: 'Постоянные покупатели',
      description: 'Клиенты с ≥3 визитами за последние 30 дней',
      rules: { visits: { gte: 3 }, lastVisitDays: { lte: 30 } },
      filters: { outlets: ['outlet-main'] },
      customerCount: 2,
      updatedById: staff.manager.id,
      lastEvaluatedAt: new Date(),
      metricsSnapshot: { revenue: 560000, visits: 12 },
      tags: ['retention'],
    },
    create: {
      id: 'segment-active',
      merchantId,
      name: 'Постоянные покупатели',
      description: 'Клиенты с ≥3 визитами за последние 30 дней',
      rules: { visits: { gte: 3 }, lastVisitDays: { lte: 30 } },
      filters: { outlets: ['outlet-main'] },
      customerCount: 2,
      createdById: staff.owner.id,
      updatedById: staff.manager.id,
      metricsSnapshot: { revenue: 560000, visits: 12 },
      lastEvaluatedAt: new Date(),
      tags: ['retention'],
    },
  });

  const sleepers = await prisma.customerSegment.upsert({
    where: { id: 'segment-lapsed' },
    update: {
      name: 'Заснувшие клиенты',
      description: 'Не приходили более 90 дней',
      rules: { lastVisitDays: { gte: 90 } },
      customerCount: 1,
      updatedById: staff.manager.id,
    },
    create: {
      id: 'segment-lapsed',
      merchantId,
      name: 'Заснувшие клиенты',
      description: 'Не приходили более 90 дней',
      rules: { lastVisitDays: { gte: 90 } },
      customerCount: 1,
      createdById: staff.owner.id,
      updatedById: staff.manager.id,
    },
  });

  await prisma.segmentCustomer.deleteMany({ where: { segmentId: { in: [activeSegment.id, sleepers.id] } } });
  await prisma.segmentCustomer.createMany({
    data: [
      { id: 'sc-active-alex', segmentId: activeSegment.id, customerId: customers['customer-alex'].id },
      { id: 'sc-active-maria', segmentId: activeSegment.id, customerId: customers['customer-maria'].id },
      { id: 'sc-lapsed-ivan', segmentId: sleepers.id, customerId: customers['customer-ivan'].id },
    ],
    skipDuplicates: true,
  });

  await prisma.segmentMetricSnapshot.createMany({
    data: [
      {
        id: 'segment-active-snapshot-week',
        merchantId,
        segmentId: activeSegment.id,
        periodStart: nowMinus({ days: 7 }),
        periodEnd: new Date(),
        metrics: { revenue: 320000, visits: 18, avgCheck: 64000 },
      },
      {
        id: 'segment-lapsed-snapshot-quarter',
        merchantId,
        segmentId: sleepers.id,
        periodStart: nowMinus({ days: 120 }),
        periodEnd: nowMinus({ days: 30 }),
        metrics: { lostRevenue: 210000, customers: 14 },
      },
    ],
    skipDuplicates: true,
  });

  return { activeSegment, sleepers };
}

async function createLoyaltyTiers(prisma, merchantId, customers, staff) {
  const welcome = await prisma.loyaltyTier.upsert({
    where: { id: 'tier-welcome' },
    update: {
      description: 'Стартовый уровень для новых клиентов',
      earnRateBps: 500,
      redeemRateBps: 1000,
    },
    create: {
      id: 'tier-welcome',
      merchantId,
      name: 'Welcome',
      description: 'Стартовый уровень для новых клиентов',
      thresholdAmount: 0,
      earnRateBps: 500,
      redeemRateBps: 1000,
      isDefault: true,
      isInitial: true,
      color: '#A0D911',
    },
  });

  const silver = await prisma.loyaltyTier.upsert({
    where: { id: 'tier-silver' },
    update: {
      description: 'Любители кофе',
      earnRateBps: 700,
      redeemRateBps: 1500,
    },
    create: {
      id: 'tier-silver',
      merchantId,
      name: 'Silver',
      description: 'Любители кофе',
      thresholdAmount: 150000,
      earnRateBps: 700,
      redeemRateBps: 1500,
      color: '#D9D9D9',
    },
  });

  const gold = await prisma.loyaltyTier.upsert({
    where: { id: 'tier-gold' },
    update: {
      description: 'Самые лояльные гости',
      earnRateBps: 900,
      redeemRateBps: 2000,
    },
    create: {
      id: 'tier-gold',
      merchantId,
      name: 'Gold',
      description: 'Самые лояльные гости',
      thresholdAmount: 300000,
      earnRateBps: 900,
      redeemRateBps: 2000,
      color: '#FADB14',
    },
  });

  await prisma.loyaltyTierBenefit.deleteMany({ where: { tierId: { in: [welcome.id, silver.id, gold.id] } } });
  await prisma.loyaltyTierBenefit.createMany({
    data: [
      { id: 'benefit-welcome', tierId: welcome.id, title: '5% бонусами', value: { rate: 5 }, order: 1 },
      { id: 'benefit-silver', tierId: silver.id, title: '7% бонусами', value: { rate: 7 }, order: 1 },
      { id: 'benefit-silver-birthday', tierId: silver.id, title: 'Подарок ко дню рождения', value: { coupon: 'BIRTHDAY50' }, order: 2 },
      { id: 'benefit-gold', tierId: gold.id, title: '10% бонусами', value: { rate: 10 }, order: 1 },
      { id: 'benefit-gold-priority', tierId: gold.id, title: 'Приоритетная поддержка', value: { hotline: true }, order: 2 },
    ],
    skipDuplicates: true,
  });

  await prisma.loyaltyTierAssignment.upsert({
    where: { id: 'assign-alex' },
    update: {
      tierId: silver.id,
      assignedById: staff.manager.id,
      assignedAt: nowMinus({ days: 45 }),
    },
    create: {
      id: 'assign-alex',
      merchantId,
      customerId: customers['customer-alex'].id,
      tierId: silver.id,
      assignedById: staff.manager.id,
      assignedAt: nowMinus({ days: 45 }),
    },
  });

  await prisma.loyaltyTierAssignment.upsert({
    where: { id: 'assign-maria' },
    update: {
      tierId: gold.id,
      assignedById: staff.owner.id,
      assignedAt: nowMinus({ days: 120 }),
    },
    create: {
      id: 'assign-maria',
      merchantId,
      customerId: customers['customer-maria'].id,
      tierId: gold.id,
      assignedById: staff.owner.id,
      assignedAt: nowMinus({ days: 120 }),
    },
  });

  await prisma.loyaltyTierAssignment.upsert({
    where: { id: 'assign-ivan' },
    update: {
      tierId: welcome.id,
      assignedById: staff.manager.id,
      assignedAt: nowMinus({ days: 200 }),
      expiresAt: nowMinus({ days: 30 }),
    },
    create: {
      id: 'assign-ivan',
      merchantId,
      customerId: customers['customer-ivan'].id,
      tierId: welcome.id,
      assignedById: staff.manager.id,
      assignedAt: nowMinus({ days: 200 }),
      expiresAt: nowMinus({ days: 30 }),
      notes: 'Неактивен, следует вернуть',
    },
  });

  return { welcome, silver, gold };
}
async function createCommunicationAssets(prisma, merchantId, staff) {
  const startTemplate = await prisma.communicationTemplate.upsert({
    where: { id: 'template-promo-start' },
    update: {
      name: 'Старт акции',
      content: { title: 'Новая акция', body: 'Начисляем дополнительные баллы' },
      updatedById: staff.id,
    },
    create: {
      id: 'template-promo-start',
      merchantId,
      name: 'Старт акции',
      channel: 'PUSH',
      subject: 'Запуск акции',
      content: { title: 'Новая акция', body: 'Начисляем дополнительные баллы' },
      preview: { platform: 'ios' },
      createdById: staff.id,
    },
  });

  const reminderTemplate = await prisma.communicationTemplate.upsert({
    where: { id: 'template-promo-reminder' },
    update: {
      name: 'Напоминание',
      content: { title: 'Скоро окончание', body: 'Успейте получить бонусы' },
      updatedById: staff.id,
    },
    create: {
      id: 'template-promo-reminder',
      merchantId,
      name: 'Напоминание',
      channel: 'PUSH',
      subject: 'Акция заканчивается',
      content: { title: 'Скоро окончание', body: 'Успейте получить бонусы' },
      preview: { platform: 'android' },
      createdById: staff.id,
    },
  });

  return { startTemplate, reminderTemplate };
}

async function createPromoCodes(prisma, merchantId, segments, tiers, staff, customers, outlets) {
  // Промокоды больше не создаются автоматически при сидировании.
  // Страницы портала и мини-аппы работают с данными реального API,
  // поэтому демо-подготовка оставлена пустой.
  return {};
}

async function createPromotions(prisma, merchantId, segments, tiers, staff, templates, customers, outlets) {
  const spring = await prisma.loyaltyPromotion.upsert({
    where: { id: 'promo-spring' },
    update: {
      status: 'ACTIVE',
      startAt: nowMinus({ days: 3 }),
      endAt: nowMinus({ days: -10 }),
    },
    create: {
      id: 'promo-spring',
      merchantId,
      segmentId: segments.activeSegment.id,
      targetTierId: tiers.silver.id,
      name: 'Весенний кэшбек',
      description: 'Дополнительные 10% баллами',
      status: 'ACTIVE',
      rewardType: 'POINTS',
      rewardValue: 10,
      rewardMetadata: { percent: 10 },
      pointsExpireInDays: 14,
      pushTemplateStartId: templates.startTemplate.id,
      pushTemplateReminderId: templates.reminderTemplate.id,
      pushOnStart: true,
      pushReminderEnabled: true,
      reminderOffsetHours: 48,
      autoLaunch: true,
      startAt: nowMinus({ days: 3 }),
      endAt: nowMinus({ days: -10 }),
      createdById: staff.manager.id,
      updatedById: staff.manager.id,
    },
  });

  const upcoming = await prisma.loyaltyPromotion.upsert({
    where: { id: 'promo-holiday' },
    update: {
      status: 'SCHEDULED',
      startAt: nowMinus({ days: -5 }),
      endAt: nowMinus({ days: -15 }),
    },
    create: {
      id: 'promo-holiday',
      merchantId,
      segmentId: segments.sleepers.id,
      targetTierId: tiers.welcome.id,
      name: 'Праздничный возврат',
      description: 'Вернём спящих клиентов подарком',
      status: 'SCHEDULED',
      rewardType: 'LEVEL_UP',
      rewardValue: 0,
      rewardMetadata: { upgradeTo: 'Silver' },
      pushTemplateStartId: templates.startTemplate.id,
      pushTemplateReminderId: templates.reminderTemplate.id,
      pushOnStart: true,
      pushReminderEnabled: true,
      reminderOffsetHours: 24,
      autoLaunch: false,
      startAt: nowMinus({ days: -5 }),
      endAt: nowMinus({ days: -15 }),
      createdById: staff.owner.id,
      updatedById: staff.owner.id,
    },
  });

  const flash = await prisma.loyaltyPromotion.upsert({
    where: { id: 'promo-flash' },
    update: {
      status: 'DRAFT',
      metadata: { lastEditedBy: staff.manager.id },
    },
    create: {
      id: 'promo-flash',
      merchantId,
      name: 'Флеш-распродажа выходного дня',
      description: 'Бонусные баллы за визит в ближайший уикенд',
      status: 'DRAFT',
      rewardType: 'POINTS',
      rewardValue: 20,
      rewardMetadata: { percent: 20, minReceipt: 80000 },
      pushOnStart: false,
      pushReminderEnabled: false,
      autoLaunch: false,
      pointsExpireInDays: 7,
      metadata: { checklist: ['Подтвердить товары', 'Согласовать баннер'] },
      createdById: staff.manager.id,
      updatedById: staff.manager.id,
    },
  });

  await prisma.promotionParticipant.createMany({
    data: [
      {
        id: 'participant-alex',
        promotionId: spring.id,
        merchantId,
        customerId: customers['customer-alex'].id,
        outletId: outlets.main.id,
        purchasesCount: 3,
        totalSpent: 240000,
        pointsIssued: 2400,
        pointsRedeemed: 1200,
        joinedAt: nowMinus({ days: 2 }),
        lastPurchaseAt: nowMinus({ days: 1 }),
      },
      {
        id: 'participant-maria',
        promotionId: spring.id,
        merchantId,
        customerId: customers['customer-maria'].id,
        outletId: outlets.main.id,
        purchasesCount: 2,
        totalSpent: 180000,
        pointsIssued: 1800,
        pointsRedeemed: 600,
        joinedAt: nowMinus({ days: 2 }),
        lastPurchaseAt: nowMinus({ days: 2 }),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.loyaltyPromotionMetric.upsert({
    where: { id: 'metric-spring' },
    update: {
      participantsCount: 58,
      revenueGenerated: 950000,
      revenueRedeemed: 120000,
      pointsIssued: 95000,
      pointsRedeemed: 42000,
      charts: { daily: [45, 60, 85] },
    },
    create: {
      id: 'metric-spring',
      promotionId: spring.id,
      merchantId,
      participantsCount: 58,
      revenueGenerated: 950000,
      revenueRedeemed: 120000,
      pointsIssued: 95000,
      pointsRedeemed: 42000,
      charts: { daily: [45, 60, 85] },
    },
  });

  await prisma.communicationTask.createMany({
    data: [
      {
        id: 'task-spring-start',
        merchantId,
        channel: 'PUSH',
        templateId: templates.startTemplate.id,
        promotionId: spring.id,
        audienceId: segments.activeSegment.id,
        createdById: staff.manager.id,
        status: 'COMPLETED',
        scheduledAt: nowMinus({ days: 3 }),
        startedAt: nowMinus({ days: 3 }),
        completedAt: nowMinus({ days: 3 }),
        stats: { sent: 52, failed: 3 },
      },
      {
        id: 'task-holiday-start',
        merchantId,
        channel: 'PUSH',
        templateId: templates.startTemplate.id,
        promotionId: upcoming.id,
        audienceId: segments.sleepers.id,
        createdById: staff.owner.id,
        status: 'SCHEDULED',
        scheduledAt: nowMinus({ days: -4 }),
      },
      {
        id: 'task-flash-draft',
        merchantId,
        channel: 'PUSH',
        promotionId: flash.id,
        createdById: staff.manager.id,
        status: 'DRAFT',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.communicationTaskRecipient.createMany({
    data: [
      {
        id: 'recipient-alex',
        taskId: 'task-spring-start',
        merchantId,
        customerId: customers['customer-alex'].id,
        channel: 'PUSH',
        status: 'SENT',
        sentAt: nowMinus({ days: 3 }),
      },
      {
        id: 'recipient-maria',
        taskId: 'task-spring-start',
        merchantId,
        customerId: customers['customer-maria'].id,
        channel: 'PUSH',
        status: 'SENT',
        sentAt: nowMinus({ days: 3 }),
      },
    ],
    skipDuplicates: true,
  });

  return { spring, upcoming, flash };
}
async function createMechanics(prisma, merchantId, staff) {
  await prisma.loyaltyMechanic.upsert({
    where: { id: 'mechanic-tiers' },
    update: {
      status: 'ENABLED',
      updatedById: staff.manager.id,
      enabledAt: nowMinus({ days: 60 }),
    },
    create: {
      id: 'mechanic-tiers',
      merchantId,
      type: 'TIERS',
      name: 'Уровни клиентов',
      description: 'Настройка уровней лояльности',
      status: 'ENABLED',
      settings: { autoUpgrade: true },
      createdById: staff.owner.id,
      updatedById: staff.manager.id,
      enabledAt: nowMinus({ days: 60 }),
    },
  });

  await prisma.loyaltyMechanic.upsert({
    where: { id: 'mechanic-birthday' },
    update: {
      status: 'ENABLED',
      updatedById: staff.manager.id,
      enabledAt: nowMinus({ days: 15 }),
    },
    create: {
      id: 'mechanic-birthday',
      merchantId,
      type: 'BIRTHDAY',
      name: 'Поздравление с ДР',
      description: 'Автопоздравление с подарком',
      status: 'ENABLED',
      settings: { points: 500, daysBefore: 3 },
      createdById: staff.manager.id,
      updatedById: staff.manager.id,
      enabledAt: nowMinus({ days: 15 }),
    },
  });

  await prisma.loyaltyMechanic.upsert({
    where: { id: 'mechanic-winback' },
    update: {
      status: 'DISABLED',
      disabledAt: nowMinus({ days: 5 }),
      updatedById: staff.owner.id,
    },
    create: {
      id: 'mechanic-winback',
      merchantId,
      type: 'WINBACK',
      name: 'Автовозврат клиентов',
      description: 'Напоминания об акциях для спящих клиентов',
      status: 'DISABLED',
      settings: { thresholdDays: 60, bonus: 300 },
      createdById: staff.owner.id,
      updatedById: staff.owner.id,
      disabledAt: nowMinus({ days: 5 }),
    },
  });

  await prisma.loyaltyMechanicLog.createMany({
    data: [
      {
        id: 'mechanic-log-enable-tiers',
        mechanicId: 'mechanic-tiers',
        merchantId,
        actorId: staff.owner.id,
        action: 'ENABLED',
        payload: { note: 'После запуска программы' },
      },
      {
        id: 'mechanic-log-birthday-update',
        mechanicId: 'mechanic-birthday',
        merchantId,
        actorId: staff.manager.id,
        action: 'CONFIG_UPDATED',
        payload: { bonus: 500 },
      },
      {
        id: 'mechanic-log-winback-disable',
        mechanicId: 'mechanic-winback',
        merchantId,
        actorId: staff.owner.id,
        action: 'DISABLED',
        payload: { reason: 'слишком частые уведомления' },
      },
    ],
    skipDuplicates: true,
  });
}
async function createCatalog(prisma, merchantId, outlets) {
  await prisma.productCategory.upsert({
    where: { id: 'category-coffee' },
    update: {
      name: 'Кофе',
      description: 'Горячие напитки',
    },
    create: {
      id: 'category-coffee',
      merchantId,
      name: 'Кофе',
      slug: 'coffee',
      description: 'Горячие напитки',
      order: 1,
    },
  });

  const product = await prisma.product.upsert({
    where: { id: 'product-latte' },
    update: {
      description: 'Фирменный латте',
      price: 230_00,
      allowRedeem: true,
      tags: ['хит'],
    },
    create: {
      id: 'product-latte',
      merchantId,
      categoryId: 'category-coffee',
      name: 'Фирменный латте',
      sku: 'LATTE-001',
      description: 'Нежный латте с авторским сиропом',
      priceEnabled: true,
      price: 230_00,
      accruePoints: true,
      allowRedeem: true,
      redeemPercent: 50,
      hasVariants: true,
      tags: ['хит'],
    },
  });

  await prisma.productImage.upsert({
    where: { id: 'image-latte' },
    update: {
      url: 'https://example.com/images/latte.png',
    },
    create: {
      id: 'image-latte',
      productId: product.id,
      url: 'https://example.com/images/latte.png',
      alt: 'Кофе латте',
      position: 0,
    },
  });

  const variantRegular = await prisma.productVariant.upsert({
    where: { id: 'variant-latte-regular' },
    update: {
      price: 230_00,
    },
    create: {
      id: 'variant-latte-regular',
      productId: product.id,
      name: 'Стандартный',
      sku: 'LATTE-001-REG',
      price: 230_00,
      position: 0,
    },
  });

  const variantLarge = await prisma.productVariant.upsert({
    where: { id: 'variant-latte-large' },
    update: {
      price: 270_00,
    },
    create: {
      id: 'variant-latte-large',
      productId: product.id,
      name: 'Большой',
      sku: 'LATTE-001-L',
      price: 270_00,
      position: 1,
    },
  });

  await prisma.productOption.upsert({
    where: { id: 'option-size' },
    update: {
      name: 'Размер',
    },
    create: {
      id: 'option-size',
      merchantId,
      productId: product.id,
      name: 'Размер',
      type: 'select',
      isRequired: true,
      position: 0,
    },
  });

  await prisma.productOption.upsert({
    where: { id: 'option-milk' },
    update: {
      name: 'Молоко',
    },
    create: {
      id: 'option-milk',
      merchantId,
      productId: product.id,
      name: 'Молоко',
      type: 'select',
      isRequired: true,
      position: 1,
    },
  });

  const valueRegular = await prisma.productOptionValue.upsert({
    where: { id: 'value-size-regular' },
    update: {},
    create: {
      id: 'value-size-regular',
      optionId: 'option-size',
      name: 'Стандартный',
      position: 0,
    },
  });

  const valueLarge = await prisma.productOptionValue.upsert({
    where: { id: 'value-size-large' },
    update: {},
    create: {
      id: 'value-size-large',
      optionId: 'option-size',
      name: 'Большой',
      priceDelta: 40_00,
      position: 1,
    },
  });

  const valueOat = await prisma.productOptionValue.upsert({
    where: { id: 'value-milk-oat' },
    update: {},
    create: {
      id: 'value-milk-oat',
      optionId: 'option-milk',
      name: 'Овсяное',
      priceDelta: 20_00,
      position: 0,
    },
  });

  await prisma.productVariantOption.upsert({
    where: { id: 'variant-regular-size' },
    update: {},
    create: {
      id: 'variant-regular-size',
      variantId: variantRegular.id,
      optionId: 'option-size',
      optionValueId: valueRegular.id,
    },
  });

  await prisma.productVariantOption.upsert({
    where: { id: 'variant-large-size' },
    update: {},
    create: {
      id: 'variant-large-size',
      variantId: variantLarge.id,
      optionId: 'option-size',
      optionValueId: valueLarge.id,
    },
  });

  await prisma.productVariantOption.upsert({
    where: { id: 'variant-regular-milk' },
    update: {},
    create: {
      id: 'variant-regular-milk',
      variantId: variantRegular.id,
      optionId: 'option-milk',
      optionValueId: valueOat.id,
    },
  });

  await prisma.productStock.upsert({
    where: { id: 'stock-main-latte' },
    update: {
      balance: 120,
    },
    create: {
      id: 'stock-main-latte',
      productId: product.id,
      outletId: outlets.main.id,
      label: 'Основной склад',
      balance: 120,
      price: 230_00,
    },
  });
}
async function createDataImports(prisma, merchantId, staff) {
  const job = await prisma.dataImportJob.upsert({
    where: { id: 'import-customers' },
    update: {
      status: 'COMPLETED',
      processedAt: nowMinus({ days: 1 }),
      completedAt: nowMinus({ days: 1 }),
      successRows: 2,
      failedRows: 1,
    },
    create: {
      id: 'import-customers',
      merchantId,
      type: 'CUSTOMERS',
      status: 'COMPLETED',
      sourceFileName: 'customers.csv',
      sourceFileSize: 2048,
      sourceMimeType: 'text/csv',
      uploadedById: staff.manager.id,
      startedAt: nowMinus({ days: 1, hours: 2 }),
      processedAt: nowMinus({ days: 1 }),
      completedAt: nowMinus({ days: 1 }),
      totalRows: 3,
      successRows: 2,
      failedRows: 1,
      settings: { delimiter: ';', encoding: 'utf-8' },
      errorSummary: { invalidRows: 1 },
    },
  });

  await prisma.dataImportRow.deleteMany({ where: { jobId: job.id } });
  await prisma.dataImportRow.createMany({
    data: [
      {
        id: 'import-row-1',
        jobId: job.id,
        rowNumber: 2,
        rawData: { phone: '+79991234567', name: 'Гость 1', points: 120 },
        normalizedData: { phone: '+79991234567', firstName: 'Гость', lastName: 'Один' },
        status: 'PROCESSED',
      },
      {
        id: 'import-row-2',
        jobId: job.id,
        rowNumber: 3,
        rawData: { phone: '+79992345678', name: 'Гость 2', points: 0 },
        normalizedData: { phone: '+79992345678', firstName: 'Гость', lastName: 'Два' },
        status: 'PROCESSED',
      },
      {
        id: 'import-row-3',
        jobId: job.id,
        rowNumber: 4,
        rawData: { phone: '123', name: 'Ошибка', points: 'abc' },
        status: 'FAILED',
        errorMessage: 'Некорректный телефон',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dataImportError.deleteMany({ where: { jobId: job.id } });
  await prisma.dataImportError.create({
    data: {
      id: 'import-error-1',
      jobId: job.id,
      rowNumber: 4,
      columnKey: 'phone',
      code: 'invalid_phone',
      message: 'Номер телефона должен содержать 11 цифр',
      details: { value: '123' },
    },
  });

  await prisma.dataImportMetric.upsert({
    where: { id: 'import-metric-1' },
    update: {
      stats: { processed: 2, failed: 1, durationSec: 85 },
    },
    create: {
      id: 'import-metric-1',
      jobId: job.id,
      stats: { processed: 2, failed: 1, durationSec: 85 },
    },
  });
}

async function createAnalytics(prisma, merchantId, staff, outlets, customers, segments) {
  await prisma.merchantKpiDaily.upsert({
    where: { id: 'kpi-merchant-today' },
    update: {
      revenue: 540000,
      transactionCount: 82,
      newCustomers: 6,
      pointsIssued: 38000,
      pointsRedeemed: 12000,
    },
    create: {
      id: 'kpi-merchant-today',
      merchantId,
      date: new Date(),
      revenue: 540000,
      transactionCount: 82,
      newCustomers: 6,
      activeCustomers: 140,
      pointsIssued: 38000,
      pointsRedeemed: 12000,
    },
  });

  await prisma.outletKpiDaily.upsert({
    where: { id: 'kpi-outlet-main' },
    update: {
      revenue: 420000,
      transactionCount: 60,
      customers: 110,
    },
    create: {
      id: 'kpi-outlet-main',
      merchantId,
      outletId: outlets.main.id,
      date: new Date(),
      revenue: 420000,
      transactionCount: 60,
      averageCheck: 7000,
      pointsIssued: 29000,
      pointsRedeemed: 9000,
      customers: 110,
      newCustomers: 4,
      stampsIssued: 25,
    },
  });

  await prisma.staffKpiDaily.upsert({
    where: { id: 'kpi-staff-manager' },
    update: {
      salesAmount: 180000,
      pointsIssued: 12000,
    },
    create: {
      id: 'kpi-staff-manager',
      merchantId,
      staffId: staff.manager.id,
      outletId: outlets.main.id,
      date: new Date(),
      performanceScore: 92,
      salesCount: 18,
      salesAmount: 180000,
      averageCheck: 10000,
      pointsIssued: 12000,
      pointsRedeemed: 4000,
      giftsIssued: 3,
      newCustomers: 2,
    },
  });

  await prisma.staffKpiDaily.upsert({
    where: { id: 'kpi-staff-cashier' },
    update: {
      salesAmount: 120000,
      pointsIssued: 8000,
    },
    create: {
      id: 'kpi-staff-cashier',
      merchantId,
      staffId: staff.cashier.id,
      outletId: outlets.main.id,
      date: new Date(),
      performanceScore: 75,
      salesCount: 24,
      salesAmount: 120000,
      averageCheck: 5000,
      pointsIssued: 8000,
      pointsRedeemed: 3000,
      giftsIssued: 1,
      newCustomers: 1,
    },
  });

  await prisma.cashierSession.createMany({
    data: [
      {
        id: 'session-manager',
        merchantId,
        staffId: staff.manager.id,
        outletId: outlets.main.id,
        pinAccessId: 'soa-manager-main',
        startedAt: nowMinus({ hours: 5 }),
        endedAt: nowMinus({ hours: 4 }),
        result: 'SUCCESS',
        ipAddress: '10.0.0.11',
        userAgent: 'Chrome/120.0',
      },
      {
        id: 'session-cashier',
        merchantId,
        staffId: staff.cashier.id,
        outletId: outlets.main.id,
        pinAccessId: 'soa-cashier-main',
        startedAt: nowMinus({ hours: 2 }),
        result: 'ACTIVE',
        ipAddress: '10.0.0.25',
        userAgent: 'Chrome/120.0',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.customerStats.upsert({
    where: { merchantId_customerId: { merchantId, customerId: customers['customer-alex'].id } },
    update: {
      visits: 12,
      totalSpent: 420000,
      lastOrderAt: nowMinus({ days: 1 }),
      rfmR: 2,
      rfmF: 4,
      rfmM: 3,
      rfmScore: 9,
      rfmClass: 'VIP',
    },
    create: {
      merchantId,
      customerId: customers['customer-alex'].id,
      visits: 12,
      totalSpent: 420000,
      lastOrderAt: nowMinus({ days: 1 }),
      rfmR: 2,
      rfmF: 4,
      rfmM: 3,
      rfmScore: 9,
      rfmClass: 'VIP',
    },
  });

  await prisma.segmentMetricSnapshot.create({
    data: {
      id: 'segment-active-dynamics',
      merchantId,
      segmentId: segments.activeSegment.id,
      periodStart: nowMinus({ days: 30 }),
      periodEnd: new Date(),
      metrics: { revenue: 960000, visits: 240, avgCheck: 4000 },
    },
  }).catch(() => {});
}
module.exports = {
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
};
