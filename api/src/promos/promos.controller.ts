import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PromosService } from './promos.service';

@ApiTags('promos')
@Controller('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Post('preview')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        canApply: { type: 'boolean' },
        discount: { type: 'number' },
        name: { type: 'string', nullable: true },
      },
    },
  })
  @ApiBadRequestResponse({
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async preview(
    @Body()
    body: {
      merchantId: string;
      customerId?: string;
      eligibleTotal: number;
      category?: string;
    },
  ) {
    const { merchantId, customerId, eligibleTotal, category } =
      body || ({} as any);
    return this.promos.preview(
      merchantId,
      customerId,
      Number(eligibleTotal),
      category,
    );
  }
}
