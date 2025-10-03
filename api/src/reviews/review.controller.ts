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
  NotFoundException,
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
    throw new NotFoundException('Endpoint removed');
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
    throw new NotFoundException('Endpoint removed');
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
    throw new NotFoundException('Endpoint removed');
  }

  /**
   * Получить статистику отзывов
   */
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику отзывов мерчанта' })
  async getReviewStats(@Param('merchantId') merchantId: string) {
    throw new NotFoundException('Endpoint removed');
  }

  /**
   * Получить отзыв по ID
   */
  @Get(':reviewId')
  @ApiOperation({ summary: 'Получить детальную информацию об отзыве' })
  async getReview(@Param('reviewId') reviewId: string) {
    throw new NotFoundException('Endpoint removed');
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
    throw new NotFoundException('Endpoint removed');
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
    throw new NotFoundException('Endpoint removed');
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
    throw new NotFoundException('Endpoint removed');
  }

  /**
   * Шаблоны ответов на отзывы
   */
  @Get('templates/responses')
  @ApiOperation({ summary: 'Получить шаблоны ответов на отзывы' })
  async getResponseTemplates() {
    throw new NotFoundException('Endpoint removed');
  }
}
