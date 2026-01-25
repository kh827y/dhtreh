import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalPromocodesUseCase } from '../use-cases/portal-promocodes.use-case';
import {
  PortalPromoCodePayloadDto,
  PortalPromoCodeStatusDto,
} from '../dto/promocodes.dto';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalPromocodesController {
  constructor(private readonly useCase: PortalPromocodesUseCase) {}

  @Get('promocodes')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  promocodesList(
    @Req() req: PortalRequest,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    return this.useCase.promocodesList(req, status, limitStr, offsetStr);
  }

  @Post('promocodes/issue')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, promoCodeId: { type: 'string' } },
    },
  })
  promocodesIssue(
    @Req() req: PortalRequest,
    @Body() body: PortalPromoCodePayloadDto,
  ) {
    return this.useCase.promocodesIssue(req, body);
  }

  @Post('promocodes/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesDeactivate(
    @Req() req: PortalRequest,
    @Body() body: PortalPromoCodeStatusDto,
  ) {
    return this.useCase.promocodesDeactivate(req, body);
  }

  @Post('promocodes/activate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesActivate(
    @Req() req: PortalRequest,
    @Body() body: PortalPromoCodeStatusDto,
  ) {
    return this.useCase.promocodesActivate(req, body);
  }

  @Put('promocodes/:promoCodeId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  promocodesUpdate(
    @Req() req: PortalRequest,
    @Param('promoCodeId') promoCodeId: string,
    @Body() body: PortalPromoCodePayloadDto,
  ) {
    return this.useCase.promocodesUpdate(req, promoCodeId, body);
  }
}
