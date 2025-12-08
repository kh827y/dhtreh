import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, Min, ValidateIf } from 'class-validator';

export class UpdateRfmSettingsDto {
  @ApiProperty({
    enum: ['auto', 'manual'],
    description: 'Режим расчёта давности покупок',
    default: 'auto',
  })
  @IsIn(['auto', 'manual'])
  recencyMode!: 'auto' | 'manual';

  @ApiProperty({
    minimum: 1,
    description: 'После какого количества дней клиента считаем потерянным',
  })
  @ValidateIf((dto) => dto.recencyMode === 'manual')
  @IsInt()
  @Min(1)
  recencyDays?: number;

  @ApiProperty({
    enum: ['auto', 'manual'],
    description: 'Режим порога для частоты покупок',
  })
  @IsIn(['auto', 'manual'])
  frequencyMode!: 'auto' | 'manual';

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Порог количества покупок для сверх-лояльных при режиме manual',
  })
  @ValidateIf((dto) => dto.frequencyMode === 'manual')
  @IsInt()
  @Min(1)
  frequencyThreshold?: number;

  @ApiProperty({
    enum: ['auto', 'manual'],
    description: 'Режим порога для Money (суммы покупок)',
  })
  @IsIn(['auto', 'manual'])
  moneyMode!: 'auto' | 'manual';

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Порог суммы покупок/чека для самых крупных клиентов',
  })
  @ValidateIf((dto) => dto.moneyMode === 'manual')
  @IsInt()
  @Min(0)
  moneyThreshold?: number;
}
