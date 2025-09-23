import { ActionsService } from '../actions.service';

describe('ActionsService', () => {
  const prisma = {
    campaign: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  let service: ActionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActionsService(prisma);
  });

  it('validates product selection', async () => {
    await expect(
      service.createProductBonus('m1', {
        name: 'Акция',
        productIds: [],
        rule: { mode: 'FIXED', value: 10 },
        usageLimit: 'UNLIMITED',
        schedule: { startEnabled: false, endEnabled: false },
        enabled: true,
      } as any),
    ).rejects.toThrow('Выберите хотя бы один товар для акции');
  });

  it('creates scheduled action with correct status and badges', async () => {
    const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    prisma.campaign.create.mockResolvedValue({
      id: 'a1',
      merchantId: 'm1',
      name: 'Двойные баллы',
      type: 'PRODUCT_BONUS',
      status: 'SCHEDULED',
      content: { kind: 'PRODUCT_BONUS', usageLimit: { type: 'UNLIMITED' } },
      metrics: { revenue: 0, expenses: 0, purchases: 0, roi: 0 },
      startDate: new Date(startDate),
      endDate: null,
      targetSegmentId: null,
      notificationChannels: [],
      archivedAt: null,
      startAt: null,
      endAt: null,
    });

    const result = await service.createProductBonus('m1', {
      name: 'Двойные баллы',
      productIds: ['sku-1'],
      rule: { mode: 'MULTIPLIER', value: 2 },
      usageLimit: 'UNLIMITED',
      schedule: { startEnabled: true, startDate, endEnabled: false },
      enabled: true,
    });

    expect(prisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SCHEDULED', merchantId: 'm1' }),
      }),
    );
    expect(result.status).toBe('SCHEDULED');
    expect(result.badges).toContain('Акционные баллы на товары');
  });
});
