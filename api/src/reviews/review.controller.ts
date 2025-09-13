import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import type { CreateReviewDto, CreateReviewResponseDto } from './review.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Customer Reviews')
@Controller('reviews')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * Создать отзыв
   */
  @Post()
  @ApiOperation({ summary: 'Создать новый отзыв' })
  @ApiResponse({ status: 201, description: 'Отзыв создан' })
  async createReview(@Body() dto: CreateReviewDto) {
    return this.reviewService.createReview(dto);
  }

  /**
   * Ответить на отзыв
   */
  @Post('response')
  @ApiOperation({ summary: 'Ответить на отзыв от имени мерчанта' })
  async createResponse(@Body() dto: CreateReviewResponseDto) {
    return this.reviewService.createReviewResponse(dto);
  }

  /**
   * Модерация отзыва
   */
  @Put(':reviewId/moderate')
  @ApiOperation({ summary: 'Модерировать отзыв (одобрить/отклонить)' })
  async moderateReview(
    @Param('reviewId') reviewId: string,
    @Body() dto: {
      status: 'APPROVED' | 'REJECTED';
      reason?: string;
    },
  ) {
    return this.reviewService.moderateReview(reviewId, dto.status, dto.reason);
  }

  /**
   * Получить отзывы мерчанта
   */
  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Получить отзывы мерчанта с фильтрацией' })
  async getMerchantReviews(
    @Param('merchantId') merchantId: string,
    @Query('rating') rating?: string,
    @Query('status') status?: string,
    @Query('hasPhotos') hasPhotos?: string,
    @Query('hasResponse') hasResponse?: string,
    @Query('customerId') customerId?: string,
    @Query('sortBy') sortBy?: 'date' | 'rating' | 'helpful',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reviewService.getMerchantReviews(merchantId, {
      rating: rating ? parseInt(rating) : undefined,
      status,
      hasPhotos: hasPhotos === 'true',
      hasResponse: hasResponse === 'true',
      customerId,
      sortBy,
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  /**
   * Получить статистику отзывов
   */
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику отзывов мерчанта' })
  async getReviewStats(@Param('merchantId') merchantId: string) {
    return this.reviewService.getReviewStats(merchantId);
  }

  /**
   * Получить отзыв по ID
   */
  @Get(':reviewId')
  @ApiOperation({ summary: 'Получить детальную информацию об отзыве' })
  async getReview(@Param('reviewId') reviewId: string) {
    return this.reviewService.getReview(reviewId);
  }

  /**
   * Реакция на отзыв
   */
  @Post(':reviewId/react')
  @ApiOperation({ summary: 'Отметить отзыв как полезный/бесполезный' })
  async reactToReview(
    @Param('reviewId') reviewId: string,
    @Body() dto: {
      customerId: string;
      type: 'HELPFUL' | 'NOT_HELPFUL';
    },
  ) {
    return this.reviewService.reactToReview(reviewId, dto.customerId, dto.type);
  }

  /**
   * Удалить отзыв
   */
  @Delete(':reviewId')
  @ApiOperation({ summary: 'Удалить свой отзыв' })
  async deleteReview(
    @Param('reviewId') reviewId: string,
    @Body() dto: { customerId: string },
  ) {
    return this.reviewService.deleteReview(reviewId, dto.customerId);
  }

  /**
   * Популярные отзывы
   */
  @Get('popular/:merchantId')
  @ApiOperation({ summary: 'Получить самые полезные отзывы' })
  async getPopularReviews(
    @Param('merchantId') merchantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewService.getPopularReviews(merchantId, limit ? parseInt(limit) : 5);
  }

  /**
   * Шаблоны ответов на отзывы
   */
  @Get('templates/responses')
  @ApiOperation({ summary: 'Получить шаблоны ответов на отзывы' })
  async getResponseTemplates() {
    return [
      {
        id: 'positive_thanks',
        rating: [4, 5],
        title: 'Благодарность за положительный отзыв',
        template: 'Спасибо за ваш отзыв! Мы рады, что вам понравилось. Ждем вас снова!',
      },
      {
        id: 'positive_detailed',
        rating: [4, 5],
        title: 'Развернутая благодарность',
        template: 'Благодарим за высокую оценку и подробный отзыв! Ваше мнение очень важно для нас. Будем рады видеть вас снова!',
      },
      {
        id: 'negative_apology',
        rating: [1, 2],
        title: 'Извинение за негативный опыт',
        template: 'Приносим извинения за неудобства. Мы обязательно разберемся в ситуации и примем меры. Свяжитесь с нами для решения вопроса.',
      },
      {
        id: 'negative_improvement',
        rating: [1, 2, 3],
        title: 'Обещание улучшений',
        template: 'Спасибо за обратную связь. Мы учтем ваши замечания и постараемся улучшить качество обслуживания.',
      },
      {
        id: 'neutral_thanks',
        rating: [3],
        title: 'Благодарность за нейтральный отзыв',
        template: 'Спасибо за ваш отзыв! Мы постоянно работаем над улучшением и учтем ваши пожелания.',
      },
    ];
  }
}
