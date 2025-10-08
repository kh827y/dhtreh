import { Controller, Get, Param } from '@nestjs/common';
import { LevelsService } from './levels.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('levels')
@Controller('levels')
export class LevelsController {
  constructor(private readonly levels: LevelsService) {}

  @Get(':merchantId/:customerId')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        customerId: { type: 'string' },
        metric: { type: 'string', enum: ['earn', 'redeem', 'transactions'] },
        periodDays: { type: 'number' },
        value: { type: 'number' },
        current: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            threshold: { type: 'number' },
          },
        },
        next: {
          type: 'object',
          nullable: true,
          properties: {
            name: { type: 'string' },
            threshold: { type: 'number' },
          },
        },
        progressToNext: { type: 'number' },
      },
    },
  })
  async current(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.levels.getLevel(merchantId, customerId);
  }
}
