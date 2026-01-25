import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { PortalPermissionsHandled } from '../../portal-auth/portal-permissions.util';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { AllowInactiveSubscription } from '../../../core/guards/subscription.guard';
import { PortalAccountUseCase } from '../use-cases/portal-account.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalAccountController {
  constructor(private readonly useCase: PortalAccountUseCase) {}

  @Get('subscription')
  @AllowInactiveSubscription()
  async subscription(@Req() req: PortalRequest) {
    return this.useCase.subscription(req);
  }

  @Get('reviews')
  async listReviews(
    @Req() req: PortalRequest,
    @Query('withCommentOnly') withCommentOnly?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.useCase.listReviews(
      req,
      withCommentOnly,
      outletId,
      staffId,
      deviceId,
      limit,
      offset,
    );
  }

  @Get('me')
  @PortalPermissionsHandled()
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        role: { type: 'string' },
        actor: { type: 'string' },
        adminImpersonation: { type: 'boolean' },
        staff: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            role: { type: 'string', nullable: true },
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scope: { type: 'string' },
                },
              },
            },
          },
        },
        permissions: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  })
  me(@Req() req: PortalRequest) {
    return this.useCase.me(req);
  }
}
