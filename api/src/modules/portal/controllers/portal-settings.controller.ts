import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { PortalPermissionsHandled } from '../../portal-auth/portal-permissions.util';
import {
  MerchantSettingsRespDto,
  UpdateMerchantSettingsDto,
  UpdateMerchantNameDto,
  UpdateTimezoneDto,
} from '../../merchants/dto';
import {
  UpdateReferralProgramDto,
  UpdateSupportSettingDto,
  UpdateStaffMotivationDto,
} from '../dto/settings.dto';
import type {
  PortalRequest,
  UploadedFile as UploadedFilePayload,
} from './portal.controller-helpers';
import { TransactionItemDto, ErrorDto } from '../../loyalty/dto/dto';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_MINIAPP_LOGO_BYTES,
  PortalSettingsUseCase,
} from '../use-cases/portal-settings.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalSettingsController {
  constructor(private readonly useCase: PortalSettingsUseCase) {}

  // ===== Staff motivation =====
  @Get('staff-motivation')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        pointsForNewCustomer: { type: 'number' },
        pointsForExistingCustomer: { type: 'number' },
        leaderboardPeriod: { type: 'string' },
        customDays: { type: 'number', nullable: true },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  getStaffMotivation(@Req() req: PortalRequest) {
    return this.useCase.getStaffMotivation(req);
  }

  @Put('staff-motivation')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateStaffMotivation(
    @Req() req: PortalRequest,
    @Body() body: UpdateStaffMotivationDto,
  ) {
    return this.useCase.updateStaffMotivation(req, body);
  }

  @Get('referrals/program')
  referralProgramSettings(@Req() req: PortalRequest) {
    return this.useCase.referralProgramSettings(req);
  }

  @Put('referrals/program')
  updateReferralProgramSettings(
    @Req() req: PortalRequest,
    @Body() body: UpdateReferralProgramDto,
  ) {
    return this.useCase.updateReferralProgramSettings(req, body);
  }

  @Get('loyalty/ttl/forecast')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        daysBefore: { type: 'number' },
      },
    },
  })
  async ttlReminderForecast(
    @Req() req: PortalRequest,
    @Query('daysBefore') daysBeforeStr?: string,
  ) {
    return this.useCase.ttlReminderForecast(req, daysBeforeStr);
  }

  // Settings
  @Get('settings')
  @PortalPermissionsHandled()
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Req() req: PortalRequest) {
    return this.useCase.getSettings(req);
  }

  @Put('settings')
  @PortalPermissionsHandled()
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateSettings(
    @Req() req: PortalRequest,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    return this.useCase.updateSettings(req, dto);
  }

  @Get('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  async getMerchantName(@Req() req: PortalRequest) {
    return this.useCase.getMerchantName(req);
  }

  @Put('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateMerchantName(
    @Req() req: PortalRequest,
    @Body() dto: UpdateMerchantNameDto,
  ) {
    return this.useCase.updateMerchantName(req, dto);
  }

  @Get('settings/timezone')
  async getTimezoneSetting(@Req() req: PortalRequest) {
    return this.useCase.getTimezoneSetting(req);
  }

  @Put('settings/timezone')
  async updateTimezoneSetting(
    @Req() req: PortalRequest,
    @Body() dto: UpdateTimezoneDto,
  ) {
    return this.useCase.updateTimezoneSetting(req, dto);
  }

  @Get('settings/support')
  async getSupportSetting(@Req() req: PortalRequest) {
    return this.useCase.getSupportSetting(req);
  }

  @Put('settings/support')
  async updateSupportSetting(
    @Req() req: PortalRequest,
    @Body() body: UpdateSupportSettingDto,
  ) {
    return this.useCase.updateSupportSetting(req, body);
  }

  @Get('settings/logo')
  @PortalPermissionsHandled()
  async getMiniappLogo(@Req() req: PortalRequest) {
    return this.useCase.getMiniappLogo(req);
  }

  @Post('settings/logo')
  @PortalPermissionsHandled()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_MINIAPP_LOGO_BYTES } }),
  )
  async uploadMiniappLogo(
    @Req() req: PortalRequest,
    @UploadedFile() file: UploadedFilePayload,
  ) {
    return this.useCase.uploadMiniappLogo(req, file);
  }

  @Delete('settings/logo')
  @PortalPermissionsHandled()
  async deleteMiniappLogo(@Req() req: PortalRequest) {
    return this.useCase.deleteMiniappLogo(req);
  }
}
