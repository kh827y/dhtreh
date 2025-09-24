import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, OutletFilters } from '../merchant-panel.service';
import { OutletListQueryDto, OutletListResponseDto, UpsertOutletDto, OutletDto } from '../dto/outlet.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('portal-outlets')
@Controller('portal/outlets')
@UseGuards(PortalGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class OutletsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(@Req() req: any, @Query() query: OutletListQueryDto): Promise<OutletListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: OutletFilters = {
      status: rest.status ? (rest.status as any) : undefined,
      hidden: rest.hidden,
      search: rest.search,
    };
    const result = await this.service.listOutlets(this.getMerchantId(req), filters, { page, pageSize });
    return plainToInstance(OutletListResponseDto, result, { enableImplicitConversion: true });
  }

  @Post()
  async create(@Req() req: any, @Body() body: UpsertOutletDto) {
    const outlet = await this.service.createOutlet(this.getMerchantId(req), body);
    return plainToInstance(OutletDto, outlet, { enableImplicitConversion: true });
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpsertOutletDto) {
    const outlet = await this.service.updateOutlet(this.getMerchantId(req), id, body);
    return plainToInstance(OutletDto, outlet, { enableImplicitConversion: true });
  }
}
