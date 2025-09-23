export type Gender = 'male' | 'female' | 'unknown';

export type CustomerExpiry = {
  id: string;
  accrualDate: string;
  expiresAt: string;
  amount: number;
};

export type CustomerTransaction = {
  id: string;
  purchaseAmount: number;
  change: number;
  details: string;
  datetime: string;
  outlet: string;
  rating?: number;
  receipt: string;
  manager: string;
  carrier: string;
  carrierCode?: string;
  toPay: number;
  paidByPoints: number;
  total: number;
};

export type CustomerReview = {
  id: string;
  outlet: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export type InvitedCustomer = {
  id: string;
  name: string;
  login: string;
  joinedAt: string;
  purchases?: number;
};

export type CustomerRecord = {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  visitFrequency: string;
  averageCheck: number;
  birthday: string;
  age: number;
  gender: Gender;
  daysSinceLastVisit: number;
  visitCount: number;
  bonusBalance: number;
  pendingBalance: number;
  level: string;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  stamps: number;
  tags: string[];
  registeredAt: string;
  comment: string;
  blocked: boolean;
  referrer?: string;
  group: string;
  inviteCode: string;
  customerNumber: string;
  deviceNumber?: string;
  transactions: CustomerTransaction[];
  expiry: CustomerExpiry[];
  reviews: CustomerReview[];
  invited: InvitedCustomer[];
};

export const customersMock: CustomerRecord[] = [
  {
    id: 'cust-001',
    login: '+7 (901) 111-22-33',
    firstName: 'Вероника',
    lastName: 'Громова',
    email: 'veronika.gromova@example.com',
    visitFrequency: 'Еженедельно (4 визита)',
    averageCheck: 890,
    birthday: '1992-03-14',
    age: 33,
    gender: 'female',
    daysSinceLastVisit: 6,
    visitCount: 86,
    bonusBalance: 1540,
    pendingBalance: 120,
    level: 'Silver',
    spendPreviousMonth: 12600,
    spendCurrentMonth: 8400,
    spendTotal: 284000,
    stamps: 6,
    tags: ['кофе', 'обеды'],
    registeredAt: '2022-06-10T09:30:00Z',
    comment: 'Предпочитает безлактозное молоко, любит новости о новых десертах.',
    blocked: false,
    referrer: 'Промокод BLOGGER5',
    group: 'Постоянные',
    inviteCode: 'NIKA2024',
    customerNumber: 'CL-0001',
    deviceNumber: 'IOS-883',
    transactions: [
      {
        id: 'txn-001',
        purchaseAmount: 1350,
        change: 135,
        details: 'Покупка. Автоматическое начисление 10% по уровню Silver.',
        datetime: new Date('2025-02-12T14:22:00Z').toISOString(),
        outlet: 'Кофейня на Лиговском',
        rating: 5,
        receipt: '000981',
        manager: 'Алексей Плотников',
        carrier: 'Мобильное приложение',
        carrierCode: 'APP-292',
        toPay: 1215,
        paidByPoints: 135,
        total: 1350,
      },
      {
        id: 'txn-002',
        purchaseAmount: 980,
        change: -200,
        details: 'Списание баллов на кассе. Правило «каждый 5-й кофе бесплатно».',
        datetime: new Date('2025-02-05T08:55:00Z').toISOString(),
        outlet: 'Pop-up в бизнес-центре',
        rating: 4,
        receipt: '000954',
        manager: 'Сергей Новиков',
        carrier: 'Пластиковая карта',
        carrierCode: '4213',
        toPay: 780,
        paidByPoints: 200,
        total: 980,
      },
      {
        id: 'txn-003',
        purchaseAmount: 0,
        change: 500,
        details: 'Начислены комплиментарные баллы на день рождения.',
        datetime: new Date('2025-01-30T07:20:00Z').toISOString(),
        outlet: 'Сервисный центр',
        rating: 0,
        receipt: 'BD-2025',
        manager: 'Система',
        carrier: 'Телефон',
        carrierCode: '+7 •• 22',
        toPay: 0,
        paidByPoints: 0,
        total: 0,
      },
      {
        id: 'txn-004',
        purchaseAmount: 1620,
        change: 243,
        details: 'Покупка. Акция «+5% к уровню Silver на десерты».',
        datetime: new Date('2025-01-18T17:45:00Z').toISOString(),
        outlet: 'Точка у метро Чкаловская',
        rating: 5,
        receipt: '000931',
        manager: 'Мария Крылова',
        carrier: 'Мобильное приложение',
        carrierCode: 'APP-292',
        toPay: 1377,
        paidByPoints: 243,
        total: 1620,
      },
    ],
    expiry: [
      {
        id: 'exp-001',
        accrualDate: '2025-02-12',
        expiresAt: '2025-05-12',
        amount: 135,
      },
      {
        id: 'exp-002',
        accrualDate: '2025-01-30',
        expiresAt: '2025-07-30',
        amount: 500,
      },
      {
        id: 'exp-003',
        accrualDate: '2025-01-18',
        expiresAt: '2025-04-18',
        amount: 243,
      },
    ],
    reviews: [
      {
        id: 'rev-001',
        outlet: 'Кофейня на Лиговском',
        rating: 5,
        comment: 'Очень вежливый бариста и классные сезонные напитки.',
        createdAt: '2025-01-12T08:05:00Z',
      },
      {
        id: 'rev-002',
        outlet: 'Pop-up в бизнес-центре',
        rating: 4,
        comment: 'Хотелось бы больше посадочных мест, но кофе отличный.',
        createdAt: '2024-12-18T16:42:00Z',
      },
    ],
    invited: [
      {
        id: 'cust-101',
        name: 'Алина Резникова',
        login: '+7 (921) 334-45-56',
        joinedAt: '2024-11-05',
        purchases: 14,
      },
      {
        id: 'cust-102',
        name: 'Георгий Кузнецов',
        login: '+7 (981) 222-18-77',
        joinedAt: '2025-01-09',
        purchases: 4,
      },
    ],
  },
  {
    id: 'cust-002',
    login: '+7 (911) 444-55-66',
    firstName: 'Иван',
    lastName: 'Корнеев',
    email: 'ivan.korneev@example.com',
    visitFrequency: '2 визита / месяц',
    averageCheck: 1240,
    birthday: '1988-09-02',
    age: 36,
    gender: 'male',
    daysSinceLastVisit: 12,
    visitCount: 48,
    bonusBalance: 780,
    pendingBalance: 0,
    level: 'Bronze',
    spendPreviousMonth: 4800,
    spendCurrentMonth: 2480,
    spendTotal: 126500,
    stamps: 2,
    tags: ['кофе', 'take-away'],
    registeredAt: '2023-02-21T11:10:00Z',
    comment: 'Чаще всего берёт кофе навынос по пути в офис.',
    blocked: false,
    referrer: 'QR-код у кассы',
    group: 'Стандарт',
    inviteCode: 'IVAN-FRIENDS',
    customerNumber: 'CL-0002',
    deviceNumber: 'ANDROID-441',
    transactions: [
      {
        id: 'txn-101',
        purchaseAmount: 1180,
        change: 118,
        details: 'Покупка. Уровень Bronze 10% + акция «Вторая чашка -50%».',
        datetime: new Date('2025-02-10T07:45:00Z').toISOString(),
        outlet: 'Точка у метро Чкаловская',
        rating: 4,
        receipt: '000972',
        manager: 'Мария Крылова',
        carrier: 'Телефон',
        carrierCode: '+7 •• 66',
        toPay: 1062,
        paidByPoints: 118,
        total: 1180,
      },
      {
        id: 'txn-102',
        purchaseAmount: 0,
        change: 300,
        details: 'Начисление промокода «WELCOME300».',
        datetime: new Date('2025-01-14T10:20:00Z').toISOString(),
        outlet: 'Онлайн-заказ',
        rating: 0,
        receipt: 'PR-300',
        manager: 'Система',
        carrier: 'Мобильное приложение',
        carrierCode: 'APP-881',
        toPay: 0,
        paidByPoints: 0,
        total: 0,
      },
    ],
    expiry: [
      {
        id: 'exp-101',
        accrualDate: '2025-02-10',
        expiresAt: '2025-05-10',
        amount: 118,
      },
      {
        id: 'exp-102',
        accrualDate: '2025-01-14',
        expiresAt: '2025-04-14',
        amount: 300,
      },
    ],
    reviews: [
      {
        id: 'rev-101',
        outlet: 'Точка у метро Чкаловская',
        rating: 4,
        comment: 'Удобно забирать онлайн-заказы, но очередь утром.',
        createdAt: '2024-11-22T07:12:00Z',
      },
    ],
    invited: [],
  },
  {
    id: 'cust-003',
    login: '+7 (915) 777-88-99',
    firstName: 'Екатерина',
    lastName: 'Мельникова',
    email: 'ekaterina.meln@gmail.com',
    visitFrequency: '1 визит / месяц',
    averageCheck: 1560,
    birthday: '1996-12-01',
    age: 28,
    gender: 'female',
    daysSinceLastVisit: 32,
    visitCount: 22,
    bonusBalance: 320,
    pendingBalance: 80,
    level: 'Bronze',
    spendPreviousMonth: 1560,
    spendCurrentMonth: 0,
    spendTotal: 48200,
    stamps: 1,
    tags: ['десерты'],
    registeredAt: '2023-08-05T15:34:00Z',
    comment: 'Редко приходит, откликается на рассылки с десертами.',
    blocked: false,
    group: 'Новые',
    inviteCode: 'KATYA-TREATS',
    customerNumber: 'CL-0003',
    deviceNumber: 'IOS-552',
    transactions: [
      {
        id: 'txn-201',
        purchaseAmount: 1560,
        change: 156,
        details: 'Покупка. Автоматическое начисление 10% (уровень Bronze).',
        datetime: new Date('2025-01-04T13:10:00Z').toISOString(),
        outlet: 'Pop-up в бизнес-центре',
        rating: 5,
        receipt: '000901',
        manager: 'Сергей Новиков',
        carrier: 'Мобильное приложение',
        carrierCode: 'APP-552',
        toPay: 1404,
        paidByPoints: 156,
        total: 1560,
      },
    ],
    expiry: [
      {
        id: 'exp-201',
        accrualDate: '2025-01-04',
        expiresAt: '2025-04-04',
        amount: 156,
      },
    ],
    reviews: [],
    invited: [],
  },
  {
    id: 'cust-004',
    login: '+7 (917) 123-45-67',
    firstName: 'Сергей',
    lastName: 'Ким',
    email: 'sergey.kim@example.com',
    visitFrequency: 'Ежедневно (рабочие дни)',
    averageCheck: 420,
    birthday: '1990-05-18',
    age: 35,
    gender: 'male',
    daysSinceLastVisit: 1,
    visitCount: 215,
    bonusBalance: 210,
    pendingBalance: 0,
    level: 'Gold',
    spendPreviousMonth: 9800,
    spendCurrentMonth: 4200,
    spendTotal: 510000,
    stamps: 12,
    tags: ['кофе', 'обеды', 'офис'],
    registeredAt: '2021-11-12T07:55:00Z',
    comment: 'Любит простые фильтр-кофе, следит за программой антифрода.',
    blocked: true,
    referrer: 'Пришёл сам',
    group: 'VIP',
    inviteCode: 'SERGEY-OFFICE',
    customerNumber: 'CL-0004',
    deviceNumber: 'ANDROID-119',
    transactions: [
      {
        id: 'txn-301',
        purchaseAmount: 420,
        change: 42,
        details: 'Покупка. Автоматическое начисление 10%.',
        datetime: new Date('2025-02-13T06:52:00Z').toISOString(),
        outlet: 'Точка у метро Чкаловская',
        rating: 5,
        receipt: '001002',
        manager: 'Мария Крылова',
        carrier: 'Телефон',
        carrierCode: '+7 •• 67',
        toPay: 378,
        paidByPoints: 42,
        total: 420,
      },
      {
        id: 'txn-302',
        purchaseAmount: 0,
        change: -150,
        details: 'Списание по жалобе клиента (ручное).',
        datetime: new Date('2025-02-11T12:40:00Z').toISOString(),
        outlet: 'Кофейня на Лиговском',
        rating: 0,
        receipt: 'CN-150',
        manager: 'Менеджер лояльности',
        carrier: 'Телефон',
        carrierCode: '+7 •• 67',
        toPay: 0,
        paidByPoints: 150,
        total: 0,
      },
    ],
    expiry: [
      {
        id: 'exp-301',
        accrualDate: '2025-02-13',
        expiresAt: '2025-05-13',
        amount: 42,
      },
      {
        id: 'exp-302',
        accrualDate: '2024-12-01',
        expiresAt: '2025-03-01',
        amount: 120,
      },
    ],
    reviews: [
      {
        id: 'rev-301',
        outlet: 'Кофейня на Лиговском',
        rating: 5,
        comment: 'Всегда приятно, что персонал помнит мой заказ.',
        createdAt: '2024-10-01T06:20:00Z',
      },
    ],
    invited: [
      {
        id: 'cust-202',
        name: 'Михаил Ли',
        login: '+7 (999) 221-55-00',
        joinedAt: '2023-05-12',
        purchases: 75,
      },
    ],
  },
  {
    id: 'cust-005',
    login: '+7 (925) 555-44-33',
    firstName: 'Алина',
    lastName: 'Соколова',
    email: 'alina.sokolova@example.com',
    visitFrequency: 'Раз в 2 недели',
    averageCheck: 980,
    birthday: '1994-07-07',
    age: 31,
    gender: 'female',
    daysSinceLastVisit: 8,
    visitCount: 64,
    bonusBalance: 640,
    pendingBalance: 40,
    level: 'Silver',
    spendPreviousMonth: 3920,
    spendCurrentMonth: 1960,
    spendTotal: 158400,
    stamps: 4,
    tags: ['растительное молоко'],
    registeredAt: '2022-03-19T10:05:00Z',
    comment: 'Нравятся подборки фильмов в рассылках.',
    blocked: false,
    group: 'Постоянные',
    inviteCode: 'ALINA-2024',
    customerNumber: 'CL-0005',
    transactions: [],
    expiry: [],
    reviews: [],
    invited: [],
  },
  {
    id: 'cust-006',
    login: '+7 (929) 777-00-11',
    firstName: 'Дмитрий',
    lastName: 'Соколов',
    email: 'dmitry.sokolov@example.com',
    visitFrequency: '3 визита / месяц',
    averageCheck: 1120,
    birthday: '1991-10-22',
    age: 33,
    gender: 'male',
    daysSinceLastVisit: 4,
    visitCount: 92,
    bonusBalance: 980,
    pendingBalance: 60,
    level: 'Silver',
    spendPreviousMonth: 5600,
    spendCurrentMonth: 2240,
    spendTotal: 204500,
    stamps: 5,
    tags: ['кофе', 'аппликейшн'],
    registeredAt: '2021-09-01T09:00:00Z',
    comment: 'Активный пользователь мобильного приложения.',
    blocked: false,
    group: 'Постоянные',
    inviteCode: 'DMITRY-CLUB',
    customerNumber: 'CL-0006',
    transactions: [],
    expiry: [],
    reviews: [],
    invited: [],
  },
  {
    id: 'cust-007',
    login: '+7 (939) 123-00-22',
    firstName: 'Мария',
    lastName: 'Соколова',
    email: 'maria.sokolova@example.com',
    visitFrequency: 'Почти ежедневно',
    averageCheck: 640,
    birthday: '1999-04-11',
    age: 26,
    gender: 'female',
    daysSinceLastVisit: 2,
    visitCount: 180,
    bonusBalance: 350,
    pendingBalance: 20,
    level: 'Gold',
    spendPreviousMonth: 7800,
    spendCurrentMonth: 3200,
    spendTotal: 267300,
    stamps: 9,
    tags: ['реферал'],
    registeredAt: '2020-12-25T18:45:00Z',
    comment: 'Часто рассказывает друзьям о программе.',
    blocked: false,
    group: 'VIP',
    inviteCode: 'MARIA-BEST',
    customerNumber: 'CL-0007',
    transactions: [],
    expiry: [],
    reviews: [],
    invited: [],
  },
  {
    id: 'cust-008',
    login: '+7 (945) 222-33-44',
    firstName: 'Алексей',
    lastName: 'Романов',
    email: 'aleksey.romanov@example.com',
    visitFrequency: '1 визит / 2 месяца',
    averageCheck: 1780,
    birthday: '1985-01-05',
    age: 40,
    gender: 'male',
    daysSinceLastVisit: 60,
    visitCount: 15,
    bonusBalance: 120,
    pendingBalance: 0,
    level: 'Bronze',
    spendPreviousMonth: 0,
    spendCurrentMonth: 0,
    spendTotal: 28000,
    stamps: 0,
    tags: ['неактивный'],
    registeredAt: '2024-02-14T19:30:00Z',
    comment: 'Почти не активен, нужен прогрев через кампании.',
    blocked: false,
    group: 'Сонные',
    inviteCode: 'ROMANOV',
    customerNumber: 'CL-0008',
    transactions: [],
    expiry: [],
    reviews: [],
    invited: [],
  },
];

export function getCustomerById(id: string): CustomerRecord | undefined {
  return customersMock.find((customer) => customer.id === id);
}

export function getCustomerByLogin(login: string): CustomerRecord | undefined {
  return customersMock.find((customer) => customer.login === login);
}

export function getFullName(customer: CustomerRecord): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
}
