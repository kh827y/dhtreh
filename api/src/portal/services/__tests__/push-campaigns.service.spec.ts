import { PushCampaignsService } from '../push-campaigns.service';

const futureDate = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe('PushCampaignsService', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    pushCampaign: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;

  let service: PushCampaignsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushCampaignsService(prisma);
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', plan: { features: { pushNotifications: true } } });
    prisma.pushCampaign.create.mockResolvedValue({ id: 'c1' });
  });

  it('rejects creation when text is empty', async () => {
    await expect(
      service.create('m1', { text: '   ', audience: 'all', scheduledAt: futureDate() }),
    ).rejects.toThrow('Текст уведомления обязателен');
  });

  it('rejects creation when push feature is disabled', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', plan: { features: { pushNotifications: false } } });

    await expect(
      service.create('m1', { text: 'Напоминание', audience: 'all', scheduledAt: futureDate() }),
    ).rejects.toThrow('Текущий тариф не поддерживает push-рассылки');
    expect(prisma.pushCampaign.create).not.toHaveBeenCalled();
  });

  it('creates campaign with normalized payload', async () => {
    const scheduledAt = futureDate();
    await service.create('m1', {
      text: 'Новое предложение',
      audience: 'loyal',
      scheduledAt,
      timezone: 'Europe/Moscow',
    });

    expect(prisma.pushCampaign.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'm1',
        text: 'Новое предложение',
        audience: 'loyal',
        scheduledAt: new Date(scheduledAt),
        timezone: 'Europe/Moscow',
        status: 'SCHEDULED',
      },
    });
  });
});
