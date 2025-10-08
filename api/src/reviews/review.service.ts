import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateReviewDto {
  merchantId: string;
  customerId: string;
  orderId?: string;
  transactionId?: string;
  rating: number; // 1-5
  title?: string;
  comment: string;
  photos?: string[];
  tags?: string[];
  isAnonymous?: boolean;
}

export interface CreateReviewOptions {
  autoApprove?: boolean;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  /**
   * Создать отзыв
   */
  async createReview(dto: CreateReviewDto, options?: CreateReviewOptions) {
    const rating = Number(dto.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Рейтинг должен быть от 1 до 5');
    }

    const transactionIdRaw =
      typeof dto.transactionId === 'string' ? dto.transactionId.trim() : '';
    const orderIdRaw =
      typeof dto.orderId === 'string' ? dto.orderId.trim() : '';
    const transactionId = transactionIdRaw || undefined;
    const orderId = orderIdRaw || undefined;

    if (!transactionId && !orderId) {
      throw new BadRequestException(
        'Укажите транзакцию или заказ, к которому относится отзыв',
      );
    }

    let anchorTransaction = null as Awaited<
      ReturnType<typeof this.prisma.transaction.findUnique>
    > | null;

    if (transactionId) {
      anchorTransaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
      });
      if (
        !anchorTransaction ||
        anchorTransaction.merchantId !== dto.merchantId ||
        anchorTransaction.customerId !== dto.customerId
      ) {
        throw new BadRequestException(
          'Транзакция не найдена или не принадлежит клиенту',
        );
      }
    }

    if (!anchorTransaction && orderId) {
      anchorTransaction = await this.prisma.transaction.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: dto.customerId,
          orderId,
          type: { in: ['EARN', 'REDEEM'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!anchorTransaction) {
        throw new BadRequestException(
          'По указанному заказу не найдено покупок',
        );
      }
    }

    if (!anchorTransaction) {
      throw new BadRequestException('Не удалось сопоставить отзыв с покупкой');
    }

    if (
      anchorTransaction.type !== 'EARN' &&
      anchorTransaction.type !== 'REDEEM'
    ) {
      throw new BadRequestException(
        'Отзыв можно оставить только по совершённой покупке',
      );
    }

    const finalOrderId = orderId ?? anchorTransaction.orderId ?? undefined;

    const existingByTransaction = await this.prisma.review.findFirst({
      where: { transactionId: anchorTransaction.id },
    });
    if (existingByTransaction) {
      throw new BadRequestException('Вы уже оставили отзыв по этой покупке');
    }

    if (finalOrderId) {
      const existingByOrder = await this.prisma.review.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: dto.customerId,
          orderId: finalOrderId,
        },
      });

      if (existingByOrder) {
        throw new BadRequestException('Вы уже оставили отзыв по этой покупке');
      }
    }

    const autoApprove = Boolean(options?.autoApprove);
    const metadata: Record<string, any> = {
      userAgent: 'api',
      timestamp: new Date(),
      ...(options?.metadata ?? {}),
      transactionId: anchorTransaction.id,
      ...(finalOrderId ? { orderId: finalOrderId } : {}),
    };

    try {
      const review = await this.prisma.review.create({
        data: {
          merchantId: dto.merchantId,
          customerId: dto.customerId,
          orderId: finalOrderId,
          transactionId: anchorTransaction.id,
          rating,
          title: dto.title,
          comment: dto.comment,
          photos: dto.photos || [],
          tags: dto.tags || [],
          isAnonymous: dto.isAnonymous || false,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          moderatedAt: autoApprove ? new Date() : undefined,
          metadata,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      return {
        id: review.id,
        rating: review.rating,
        rewardPoints: 0,
        status: review.status,
        message: autoApprove
          ? 'Спасибо за ваш отзыв! Он опубликован.'
          : 'Спасибо за ваш отзыв! Он появится после модерации.',
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Вы уже оставили отзыв по этой покупке');
      }
      throw error;
    }
  }
}
