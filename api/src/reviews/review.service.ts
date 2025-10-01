import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReviewSettings as ReviewSettingsModel } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

export interface CreateReviewDto {
  merchantId: string;
  customerId: string;
  orderId?: string;
  rating: number; // 1-5
  title?: string;
  comment?: string;
  photos?: string[];
  tags?: string[];
  isAnonymous?: boolean;
  transactionId?: string;
  staffId?: string;
  outletId?: string;
  source?: 'miniapp' | 'portal' | 'api' | string;
}

export interface CreateReviewResponseDto {
  reviewId: string;
  merchantId: string;
  staffId?: string;
  message: string;
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

export interface ReviewSettingsInput {
  notifyEnabled?: boolean;
  notifyThreshold?: number;
  emailEnabled?: boolean;
  emailRecipients?: string[];
  telegramEnabled?: boolean;
  shareEnabled?: boolean;
  shareThreshold?: number;
  shareYandex?: { enabled?: boolean; url?: string | null };
  shareTwoGis?: { enabled?: boolean; url?: string | null };
  shareGoogle?: { enabled?: boolean; url?: string | null };
}

export interface ReviewSettingsDto {
  merchantId: string;
  notifyEnabled: boolean;
  notifyThreshold: number;
  emailEnabled: boolean;
  emailRecipients: string[];
  telegramEnabled: boolean;
  shareEnabled: boolean;
  shareThreshold: number;
  sharePlatforms: {
    yandex: { enabled: boolean; url: string | null };
    twoGis: { enabled: boolean; url: string | null };
    google: { enabled: boolean; url: string | null };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicReviewSettingsDto {
  shareEnabled: boolean;
  shareThreshold: number;
  sharePlatforms: {
    yandex?: { enabled: boolean; url: string | null };
    twoGis?: { enabled: boolean; url: string | null };
    google?: { enabled: boolean; url: string | null };
  };
}

export interface PortalReviewFilters {
  withCommentOnly?: boolean;
  ratingGte?: number;
  staffId?: string;
  outletId?: string;
  limit?: number;
  offset?: number;
}

export interface PortalReviewListItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  orderId?: string | null;
  customer: { id: string; name: string | null; phone: string | null };
  staff: { id: string; name: string | null } | null;
  outlet: { id: string; name: string | null } | null;
  hasResponse: boolean;
}

export interface PortalReviewListResponse {
  items: PortalReviewListItem[];
  total: number;
  hasMore: boolean;
  stats: ReviewStats;
  filters: {
    outlets: Array<{ id: string; name: string | null }>;
    staff: Array<{ id: string; name: string | null }>;
  };
}

@Injectable()
export class ReviewService {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

  /**
   * Создать отзыв
   */
  async createReview(dto: CreateReviewDto) {
    const rating = Math.round(dto.rating);
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Рейтинг должен быть от 1 до 5');
    }

    const comment = (dto.comment ?? '').trim();
    const photos = Array.isArray(dto.photos) ? dto.photos.filter((item) => typeof item === 'string' && item.length > 0) : [];
    const tags = Array.isArray(dto.tags) ? dto.tags.filter((item) => typeof item === 'string' && item.length > 0) : [];

    const relatedTxn = await this.resolveRelatedTransaction(
      dto.merchantId,
      dto.customerId,
      dto.transactionId,
      dto.orderId,
    );

    if (!relatedTxn) {
      const hasPurchase = await this.prisma.transaction.findFirst({
        where: {
          customerId: dto.customerId,
          merchantId: dto.merchantId,
        },
      });
      if (!hasPurchase) {
        throw new BadRequestException('Вы можете оставить отзыв только после покупки');
      }
    }

    const orderIdToStore = dto.orderId || relatedTxn?.orderId || dto.transactionId || undefined;

    if (orderIdToStore) {
      const existingReviewByOrder = await this.prisma.review.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: dto.customerId,
          orderId: orderIdToStore,
        },
      });
      if (existingReviewByOrder) {
        throw new BadRequestException('Вы уже оставили отзыв на этот заказ');
      }
    }

    const transactionIdForCheck = dto.transactionId || relatedTxn?.id;
    if (transactionIdForCheck) {
      const existingReviewByTxn = await this.prisma.review.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: dto.customerId,
          metadata: {
            path: ['transactionId'],
            equals: transactionIdForCheck,
          },
        },
      });
      if (existingReviewByTxn) {
        throw new BadRequestException('Вы уже оставили отзыв на эту покупку');
      }
    }

    const rewardPoints = this.calculateReviewReward(rating, comment.length, photos.length);

    const metadata: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      source: dto.source || 'api',
      userAgent: dto.source || 'api',
    };

    if (relatedTxn) {
      metadata.transactionId = relatedTxn.id;
      metadata.transactionType = relatedTxn.type;
      metadata.amount = relatedTxn.amount;
      if (relatedTxn.staffId) metadata.staffId = relatedTxn.staffId;
      if (relatedTxn.outletId) metadata.outletId = relatedTxn.outletId;
    } else {
      if (dto.transactionId) metadata.transactionId = dto.transactionId;
      if (dto.staffId) metadata.staffId = dto.staffId;
      if (dto.outletId) metadata.outletId = dto.outletId;
    }

    const review = await this.prisma.review.create({
      data: {
        merchantId: dto.merchantId,
        customerId: dto.customerId,
        orderId: orderIdToStore,
        rating,
        title: dto.title?.trim() || null,
        comment,
        photos,
        tags,
        isAnonymous: dto.isAnonymous || false,
        status: 'PENDING',
        rewardPoints,
        metadata: metadata as Prisma.InputJsonValue,
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

    if (rewardPoints > 0) {
      await this.loyaltyService.earn({
        customerId: dto.customerId,
        merchantId: dto.merchantId,
        amount: rewardPoints,
        orderId: `review_${review.id}`,
      });
    }

    await this.updateMerchantRating(dto.merchantId);

    return {
      id: review.id,
      rating: review.rating,
      rewardPoints,
      status: review.status,
      message: 'Спасибо за ваш отзыв! Он появится после модерации.',
    };
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

  async getReviewSettings(merchantId: string): Promise<ReviewSettingsDto> {
    const record = await this.prisma.reviewSettings.findUnique({ where: { merchantId } }).catch(() => null);
    return this.mapReviewSettingsDto(merchantId, record ?? undefined);
  }

  async updateReviewSettings(merchantId: string, input: ReviewSettingsInput): Promise<ReviewSettingsDto> {
    const payload = this.prepareSettingsPayload(input);
    const record = await this.prisma.reviewSettings.upsert({
      where: { merchantId },
      update: payload,
      create: { merchantId, ...payload },
    });
    return this.mapReviewSettingsDto(merchantId, record);
  }

  async getPublicReviewSettings(merchantId: string): Promise<PublicReviewSettingsDto> {
    const settings = await this.getReviewSettings(merchantId);
    const sharePlatforms: PublicReviewSettingsDto['sharePlatforms'] = {};
    if (settings.sharePlatforms.yandex.enabled && settings.sharePlatforms.yandex.url) {
      sharePlatforms.yandex = {
        enabled: true,
        url: settings.sharePlatforms.yandex.url,
      };
    }
    if (settings.sharePlatforms.twoGis.enabled && settings.sharePlatforms.twoGis.url) {
      sharePlatforms.twoGis = {
        enabled: true,
        url: settings.sharePlatforms.twoGis.url,
      };
    }
    if (settings.sharePlatforms.google.enabled && settings.sharePlatforms.google.url) {
      sharePlatforms.google = {
        enabled: true,
        url: settings.sharePlatforms.google.url,
      };
    }
    return {
      shareEnabled: settings.shareEnabled,
      shareThreshold: settings.shareThreshold,
      sharePlatforms,
    };
  }

  async listPortalReviews(
    merchantId: string,
    filters: PortalReviewFilters = {},
  ): Promise<PortalReviewListResponse> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const offset = Math.max(filters.offset ?? 0, 0);

    const where: Prisma.ReviewWhereInput = {
      merchantId,
      deletedAt: null,
      status: 'APPROVED',
    };

    const andConditions: Prisma.ReviewWhereInput[] = [];
    if (filters.withCommentOnly) {
      andConditions.push({ comment: { not: '' } });
    }
    if (filters.ratingGte) {
      andConditions.push({ rating: { gte: filters.ratingGte } });
    }
    if (filters.staffId) {
      andConditions.push({
        metadata: {
          path: ['staffId'],
          equals: filters.staffId,
        },
      });
    }
    if (filters.outletId) {
      andConditions.push({
        metadata: {
          path: ['outletId'],
          equals: filters.outletId,
        },
      });
    }
    if (andConditions.length) {
      where.AND = andConditions;
    }

    const [rawItems, total, stats, metadataPool] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          response: {
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.review.count({ where }),
      this.getReviewStats(merchantId),
      this.prisma.review.findMany({
        where: { merchantId, status: 'APPROVED', deletedAt: null },
        select: { metadata: true },
      }),
    ]);

    const staffIds = new Set<string>();
    const outletIds = new Set<string>();
    for (const entry of metadataPool) {
      const meta = this.extractReviewMeta(entry.metadata);
      if (meta.staffId) staffIds.add(meta.staffId);
      if (meta.outletId) outletIds.add(meta.outletId);
    }

    const [staffRecords, outletRecords] = await Promise.all([
      staffIds.size
        ? this.prisma.staff.findMany({
            where: { merchantId, id: { in: Array.from(staffIds) } },
            select: { id: true, firstName: true, lastName: true, login: true },
          })
        : [],
      outletIds.size
        ? this.prisma.outlet.findMany({
            where: { merchantId, id: { in: Array.from(outletIds) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const staffMap = new Map<string, { id: string; name: string | null }>();
    for (const staff of staffRecords) {
      const name = `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim() || staff.login || staff.id;
      staffMap.set(staff.id, { id: staff.id, name });
    }

    const outletMap = new Map<string, { id: string; name: string | null }>();
    for (const outlet of outletRecords) {
      outletMap.set(outlet.id, { id: outlet.id, name: outlet.name ?? outlet.id });
    }

    const items: PortalReviewListItem[] = rawItems.map((review) => {
      const meta = this.extractReviewMeta(review.metadata as Prisma.JsonValue | null);
      const staff = meta.staffId
        ? staffMap.get(meta.staffId) ?? { id: meta.staffId, name: 'Сотрудник удалён' }
        : null;
      const outlet = meta.outletId
        ? outletMap.get(meta.outletId) ?? { id: meta.outletId, name: 'Точка удалена' }
        : null;

      return {
        id: review.id,
        rating: review.rating,
        comment: review.comment || null,
        createdAt: review.createdAt,
        orderId: review.orderId ?? null,
        customer: {
          id: review.customer?.id ?? review.customerId,
          name: review.customer?.name ?? null,
          phone: review.customer?.phone ?? null,
        },
        staff,
        outlet,
        hasResponse: !!review.response,
      };
    });

    const outletOptions = Array.from(outletIds).map((id) => outletMap.get(id) ?? { id, name: 'Точка удалена' });
    outletOptions.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const staffOptions = Array.from(staffIds).map((id) => staffMap.get(id) ?? { id, name: 'Сотрудник удалён' });
    staffOptions.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return {
      items,
      total,
      hasMore: offset + rawItems.length < total,
      stats,
      filters: {
        outlets: outletOptions,
        staff: staffOptions,
      },
    };
  }

  // Вспомогательные методы

  private async resolveRelatedTransaction(
    merchantId: string,
    customerId: string,
    transactionId?: string,
    orderId?: string,
  ) {
    if (transactionId) {
      const txn = await this.prisma.transaction.findFirst({
        where: { id: transactionId, merchantId, customerId },
      });
      if (txn) return txn;
    }

    if (orderId) {
      const txn = await this.prisma.transaction.findFirst({
        where: { merchantId, customerId, orderId },
        orderBy: { createdAt: 'desc' },
      });
      if (txn) return txn;
    }

    return null;
  }

  private prepareSettingsPayload(input: ReviewSettingsInput) {
    const notifyThreshold = this.clampThreshold(input.notifyThreshold, 5);
    const shareThreshold = this.clampThreshold(input.shareThreshold, 5);
    const emailRecipients = Array.isArray(input.emailRecipients)
      ? input.emailRecipients
          .map((email) => (typeof email === 'string' ? email.trim() : ''))
          .filter((email, index, self) => email.length > 0 && self.indexOf(email) === index)
      : [];

    return {
      notifyEnabled: !!input.notifyEnabled,
      notifyThreshold,
      emailEnabled: !!input.emailEnabled,
      emailRecipients,
      telegramEnabled: !!input.telegramEnabled,
      shareEnabled: !!input.shareEnabled,
      shareThreshold,
      shareYandex: !!input.shareYandex?.enabled,
      shareTwoGis: !!input.shareTwoGis?.enabled,
      shareGoogle: !!input.shareGoogle?.enabled,
      shareYandexUrl: this.sanitizeUrl(input.shareYandex?.url),
      shareTwoGisUrl: this.sanitizeUrl(input.shareTwoGis?.url),
      shareGoogleUrl: this.sanitizeUrl(input.shareGoogle?.url),
    } satisfies Omit<Prisma.ReviewSettingsUncheckedCreateInput, 'merchantId'>;
  }

  private sanitizeUrl(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
  }

  private clampThreshold(value: number | undefined, fallback: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.min(5, Math.max(1, Math.round(value)));
  }

  private mapReviewSettingsDto(
    merchantId: string,
    record?: ReviewSettingsModel | null,
  ): ReviewSettingsDto {
    const createdAt = record?.createdAt ?? new Date();
    const updatedAt = record?.updatedAt ?? createdAt;
    return {
      merchantId,
      notifyEnabled: record?.notifyEnabled ?? false,
      notifyThreshold: record?.notifyThreshold ?? 5,
      emailEnabled: record?.emailEnabled ?? false,
      emailRecipients: record?.emailRecipients ?? [],
      telegramEnabled: record?.telegramEnabled ?? false,
      shareEnabled: record?.shareEnabled ?? false,
      shareThreshold: record?.shareThreshold ?? 5,
      sharePlatforms: {
        yandex: {
          enabled: record?.shareYandex ?? false,
          url: record?.shareYandexUrl ?? null,
        },
        twoGis: {
          enabled: record?.shareTwoGis ?? false,
          url: record?.shareTwoGisUrl ?? null,
        },
        google: {
          enabled: record?.shareGoogle ?? false,
          url: record?.shareGoogleUrl ?? null,
        },
      },
      createdAt,
      updatedAt,
    };
  }

  private extractReviewMeta(meta: Prisma.JsonValue | null | undefined): {
    staffId?: string;
    outletId?: string;
    transactionId?: string;
  } {
    if (!meta || typeof meta !== 'object') return {};
    const value = meta as Record<string, unknown>;
    const staffId = typeof value.staffId === 'string' ? value.staffId : undefined;
    const outletId = typeof value.outletId === 'string' ? value.outletId : undefined;
    const transactionId = typeof value.transactionId === 'string' ? value.transactionId : undefined;
    return { staffId, outletId, transactionId };
  }

  private calculateReviewReward(rating: number, commentLength: number, photoCount: number): number {
    let points = 0;

    // Баллы за рейтинг
    if (rating >= 4) {
      points += 50;
    } else if (rating === 3) {
      points += 30;
    } else {
      points += 20; // Даже за негативный отзыв даем баллы за обратную связь
    }

    // Баллы за подробный комментарий
    if (commentLength >= 100) {
      points += 30;
    } else if (commentLength >= 50) {
      points += 15;
    }

    // Баллы за фото
    points += photoCount * 20;

    return Math.min(points, 200); // Максимум 200 баллов за отзыв
  }

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
