import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, OutletFilters } from '../merchant-panel.service';
import {
  OutletListQueryDto,
  OutletListResponseDto,
  UpsertOutletDto,
  OutletDto,
} from '../dto/outlet.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

type PortalRequest = Request & {
  portalMerchantId?: string;
};

@ApiTags('portal-outlets')
@Controller('portal/outlets')
@UseGuards(PortalGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OutletsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  @Get()
  async list(
    @Req() req: PortalRequest,
    @Query() query: OutletListQueryDto,
  ): Promise<OutletListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: OutletFilters = {
      status: rest.status,
      search: rest.search,
    };
    const result = await this.service.listOutlets(
      this.getMerchantId(req),
      filters,
      { page, pageSize },
    );
    return plainToInstance(OutletListResponseDto, result, {
      enableImplicitConversion: true,
    });
  }

  @Post()
  async create(@Req() req: PortalRequest, @Body() body: UpsertOutletDto) {
    const outlet = await this.service.createOutlet(
      this.getMerchantId(req),
      body,
    );
    return plainToInstance(OutletDto, outlet, {
      enableImplicitConversion: true,
    });
  }

  @Get(':id')
  async get(@Req() req: PortalRequest, @Param('id') id: string) {
    const outlet = await this.service.getOutlet(this.getMerchantId(req), id);
    return plainToInstance(OutletDto, outlet, {
      enableImplicitConversion: true,
    });
  }

  @Put(':id')
  async update(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: UpsertOutletDto,
  ) {
    const outlet = await this.service.updateOutlet(
      this.getMerchantId(req),
      id,
      body,
    );
    return plainToInstance(OutletDto, outlet, {
      enableImplicitConversion: true,
    });
  }

  @Delete(':id')
  async delete(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.service.deleteOutlet(this.getMerchantId(req), id);
  }
}
