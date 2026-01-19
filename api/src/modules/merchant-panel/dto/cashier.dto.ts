import { StaffOutletAccessStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CashierCredentialsDto {
  @ApiPropertyOptional({ description: 'Логин кассира (slug мерчанта)' })
  login?: string | null;
}

export class CashierRotationResultDto {
  @ApiProperty({ description: 'Новый логин кассира' })
  login!: string;
}

export class RotateCashierInput {
  @ApiPropertyOptional({ description: 'Перегенерировать логин' })
  @IsOptional()
  @IsBoolean()
  regenerateLogin?: boolean;
}

export class RotateCashierDto extends RotateCashierInput {}

export class IssueCashierActivationCodesInput {
  @ApiProperty({ description: 'Количество кодов', minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;
}

export class IssueCashierActivationCodesDto extends IssueCashierActivationCodesInput {}

export class CashierPinDto {
  @ApiProperty({ description: 'Идентификатор доступа' })
  id!: string;

  @ApiProperty({ description: 'Идентификатор сотрудника' })
  staffId!: string;

  @ApiPropertyOptional({ description: 'Имя сотрудника' })
  staffName?: string | null;

  @ApiProperty({ description: 'Идентификатор точки' })
  outletId!: string;

  @ApiPropertyOptional({ description: 'Название точки' })
  outletName?: string | null;

  @ApiPropertyOptional({ description: 'PIN-код', minLength: 4, maxLength: 4 })
  pinCode?: string | null;

  @ApiProperty({ enum: StaffOutletAccessStatus })
  status!: StaffOutletAccessStatus;

  @ApiProperty({ description: 'Дата обновления PIN', format: 'date-time' })
  updatedAt!: Date;
}
