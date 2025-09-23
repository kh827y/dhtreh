import { TelegramCampaignsService } from '../telegram-campaigns.service';

const futureDate = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();

describe('TelegramCampaignsService', () => {
  const prisma = {
    merchant: { findUnique: jest.fn() },
    telegramCampaign: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;

  let service: TelegramCampaignsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramCampaignsService(prisma);
    prisma.merchant.findUnique.mockResolvedValue({ telegramBotEnabled: true });
    prisma.telegramCampaign.create.mockResolvedValue({ id: 'tg1' });
  });

  it('rejects when merchant has no Telegram bot', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ telegramBotEnabled: false });

    await expect(
      service.create('m1', { text: 'Сообщение', scheduledAt: futureDate() }),
    ).rejects.toThrow('Подключите Telegram-бота');
  });

  it('rejects when image has unsupported format', async () => {
    await expect(
      service.create('m1', { text: 'Привет', scheduledAt: futureDate(), imageUrl: 'https://cdn/img.gif' }),
    ).rejects.toThrow('Разрешены изображения только в форматах JPG или PNG');
  });

  it('creates campaign with defaults', async () => {
    const scheduledAt = futureDate();
    await service.create('m1', {
      text: 'Сообщение для клиентов',
      scheduledAt,
      audienceId: 'segment-1',
      audienceName: 'Сегмент',
    });

    expect(prisma.telegramCampaign.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'm1',
        audienceId: 'segment-1',
        audienceName: 'Сегмент',
        text: 'Сообщение для клиентов',
        imageUrl: null,
        scheduledAt: new Date(scheduledAt),
        timezone: null,
        status: 'SCHEDULED',
      },
    });
  });
});
