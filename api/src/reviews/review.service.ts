import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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

export interface CreateReviewResponseDto {
  reviewId: string;
  merchantId: string;
  staffId?: string;
  message: string;
}

export interface CreateReviewOptions {
  autoApprove?: boolean;
  metadata?: Record<string, any> | null;
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  recommendationRate: number;
  responseRate: number;
  averageResponseTime: number;
  topTags: Array<{ tag: string; count: number }>;
  recentReviews: any[];
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

    const transactionIdRaw = typeof dto.transactionId === 'string' ? dto.transactionId.trim() : '';
    const orderIdRaw = typeof dto.orderId === 'string' ? dto.orderId.trim() : '';
    const transactionId = transactionIdRaw || undefined;
    const orderId = orderIdRaw || undefined;

    if (!transactionId && !orderId) {
      throw new BadRequestException('Укажите транзакцию или заказ, к которому относится отзыв');
    }

    let anchorTransaction = null as Awaited<ReturnType<typeof this.prisma.transaction.findUnique>> | null;

    if (transactionId) {
      anchorTransaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
      if (
        !anchorTransaction ||
        anchorTransaction.merchantId !== dto.merchantId ||
        anchorTransaction.customerId !== dto.customerId
      ) {
        throw new BadRequestException('Транзакция не найдена или не принадлежит клиенту');
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
        throw new BadRequestException('По указанному заказу не найдено покупок');
      }
    }

    if (!anchorTransaction) {
      throw new BadRequestException('Не удалось сопоставить отзыв с покупкой');
    }

    if (anchorTransaction.type !== 'EARN' && anchorTransaction.type !== 'REDEEM') {
      throw new BadRequestException('Отзыв можно оставить только по совершённой покупке');
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

      await this.updateMerchantRating(dto.merchantId);

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

  /**
   * Ответить на отзыв от имени мерчанта
   */
  async createReviewResponse(dto: CreateReviewResponseDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: dto.reviewId },
    });

    if (!review) {
      throw new NotFoundException('Отзыв не найден');
    }

    if (review.merchantId !== dto.merchantId) {
      throw new BadRequestException('Вы не можете ответить на этот отзыв');
    }

    // Проверяем, нет ли уже ответа
    const existingResponse = await this.prisma.reviewResponse.findFirst({
      where: { reviewId: dto.reviewId },
    });

    if (existingResponse) {
      throw new BadRequestException('На этот отзыв уже есть ответ');
    }

    const response = await this.prisma.reviewResponse.create({
      data: {
        reviewId: dto.reviewId,
        merchantId: dto.merchantId,
        staffId: dto.staffId,
        message: dto.message,
      },
    });

    // Отправляем уведомление клиенту
    // TODO: Implement notification

    return response;
  }

  /**
   * Модерация отзыва
   */
  async moderateReview(reviewId: string, status: 'APPROVED' | 'REJECTED', reason?: string) {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status,
        moderatedAt: new Date(),
        moderationReason: reason,
      },
      include: {
        customer: true,
      },
    });

    // Если отзыв одобрен, обновляем рейтинг
    if (status === 'APPROVED') {
      await this.updateMerchantRating(review.merchantId);
    }

    // Уведомляем клиента о результате модерации
    // TODO: Implement notification

    return review;
  }

  /**
   * Получить отзывы мерчанта
   */
  async getMerchantReviews(
    merchantId: string,
    filters?: {
      rating?: number;
      status?: string;
      hasPhotos?: boolean;
      hasResponse?: boolean;
      customerId?: string;
      sortBy?: 'date' | 'rating' | 'helpful';
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = {
      merchantId,
      status: filters?.status || 'APPROVED',
    };

    if (filters?.rating) {
      where.rating = filters.rating;
    }

    if (filters?.hasPhotos) {
      where.photos = { isEmpty: false };
    }

    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }

    const orderBy: any = {};
    switch (filters?.sortBy) {
      case 'rating':
        orderBy.rating = 'desc';
        break;
      case 'helpful':
        orderBy.helpfulCount = 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
          response: true,
          reactions: true,
        },
        orderBy,
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      }),
      this.prisma.review.count({ where }),
    ]);

    // Скрываем имена для анонимных отзывов
    const processedReviews = reviews.map(review => ({
      ...review,
      customer: review.isAnonymous 
        ? { id: review.customer.id, name: 'Анонимный покупатель' }
        : review.customer,
    }));

    return {
      reviews: processedReviews,
      total,
      page: Math.floor((filters?.offset || 0) / (filters?.limit || 20)) + 1,
      pages: Math.ceil(total / (filters?.limit || 20)),
    };
  }

  /**
   * Получить статистику отзывов
   */
  async getReviewStats(merchantId: string): Promise<ReviewStats> {
    const reviews = await this.prisma.review.findMany({
      where: {
        merchantId,
        status: 'APPROVED',
      },
      include: {
        response: true,
      },
    });

    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recommendationRate: 0,
        responseRate: 0,
        averageResponseTime: 0,
        topTags: [],
        recentReviews: [],
      };
    }

    // Расчет среднего рейтинга
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / reviews.length;

    // Распределение по рейтингам
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => {
      ratingDistribution[r.rating]++;
    });

    // Процент рекомендаций (4-5 звезд)
    const positiveReviews = reviews.filter(r => r.rating >= 4).length;
    const recommendationRate = (positiveReviews / reviews.length) * 100;

    // Процент ответов
    const reviewsWithResponse = reviews.filter(r => r.response).length;
    const responseRate = (reviewsWithResponse / reviews.length) * 100;

    // Среднее время ответа
    let totalResponseTime = 0;
    let responseCount = 0;
    reviews.forEach(r => {
      if (r.response) {
        const responseTime = r.response.createdAt.getTime() - r.createdAt.getTime();
        totalResponseTime += responseTime;
        responseCount++;
      }
    });
    const averageResponseTime = responseCount > 0 
      ? totalResponseTime / responseCount / (1000 * 60 * 60) // В часах
      : 0;

    // Топ тегов
    const tagCount = new Map<string, number>();
    reviews.forEach(r => {
      r.tags?.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });
    const topTags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Последние отзывы
    const recentReviews = reviews
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment.substring(0, 100),
        createdAt: r.createdAt,
      }));

    return {
      totalReviews: reviews.length,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
      recommendationRate: Math.round(recommendationRate),
      responseRate: Math.round(responseRate),
      averageResponseTime: Math.round(averageResponseTime * 10) / 10,
      topTags,
      recentReviews,
    };
  }

  /**
   * Отметить отзыв как полезный/неполезный
   */
  async reactToReview(reviewId: string, customerId: string, type: 'HELPFUL' | 'NOT_HELPFUL') {
    // Проверяем, не голосовал ли уже
    const existingReaction = await this.prisma.reviewReaction.findFirst({
      where: {
        reviewId,
        customerId,
      },
    });

    if (existingReaction) {
      // Обновляем реакцию
      if (existingReaction.type === type) {
        // Удаляем реакцию если она такая же
        await this.prisma.reviewReaction.delete({
          where: { id: existingReaction.id },
        });
        
        // Обновляем счетчики
        await this.updateReviewCounters(reviewId, type, -1);
        
        return { action: 'removed' };
      } else {
        // Меняем реакцию
        await this.prisma.reviewReaction.update({
          where: { id: existingReaction.id },
          data: { type },
        });
        
        // Обновляем счетчики
        await this.updateReviewCounters(reviewId, existingReaction.type as 'HELPFUL' | 'NOT_HELPFUL', -1);
        await this.updateReviewCounters(reviewId, type, 1);
        
        return { action: 'changed' };
      }
    } else {
      // Создаем новую реакцию
      await this.prisma.reviewReaction.create({
        data: {
          reviewId,
          customerId,
          type,
        },
      });
      
      // Обновляем счетчики
      await this.updateReviewCounters(reviewId, type, 1);
      
      return { action: 'added' };
    }
  }

  /**
   * Получить отзыв по ID
   */
  async getReview(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
          },
        },
        response: {
          include: {
            staff: {
              select: {
                id: true,
                login: true,
                email: true,
              },
            },
          },
        },
        reactions: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Отзыв не найден');
    }

    // Скрываем имя для анонимных отзывов
    if (review.isAnonymous) {
      review.customer.name = 'Анонимный покупатель';
    }

    return review;
  }

  /**
   * Удалить отзыв (мягкое удаление)
   */
  async deleteReview(reviewId: string, customerId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Отзыв не найден');
    }

    if (review.customerId !== customerId) {
      throw new BadRequestException('Вы не можете удалить чужой отзыв');
    }

    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    // Обновляем рейтинг мерчанта
    await this.updateMerchantRating(review.merchantId);

    return { success: true };
  }

  /**
   * Получить популярные отзывы
   */
  async getPopularReviews(merchantId: string, limit: number = 5) {
    return this.prisma.review.findMany({
      where: {
        merchantId,
        status: 'APPROVED',
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        response: true,
      },
      orderBy: {
        helpfulCount: 'desc',
      },
      take: limit,
    });
  }

  // Вспомогательные методы
  private async updateMerchantRating(merchantId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        merchantId,
        status: 'APPROVED',
      },
      select: {
        rating: true,
      },
    });

    if (reviews.length === 0) {
      return;
    }

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / reviews.length;

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        rating: Math.round(averageRating * 10) / 10,
        reviewCount: reviews.length,
      },
    });
  }

  private async updateReviewCounters(reviewId: string, type: 'HELPFUL' | 'NOT_HELPFUL', delta: number) {
    const field = type === 'HELPFUL' ? 'helpfulCount' : 'notHelpfulCount';
    
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        [field]: {
          increment: delta,
        },
      },
    });
  }
}
