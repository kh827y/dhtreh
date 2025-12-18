import { StaffOutletAccessStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

registerEnumType(StaffOutletAccessStatus, { name: 'StaffOutletAccessStatus' });

@ObjectType()
export class CashierCredentialsDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Логин кассира (slug мерчанта)' })
  login?: string | null;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Установлен ли пароль' })
  hasPassword!: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Текущий 9-значный пароль',
    minLength: 9,
    maxLength: 9,
  })
  password?: string | null;
}

@ObjectType()
export class CashierRotationResultDto {
  @Field(() => String)
  @ApiProperty({ description: 'Новый логин кассира' })
  login!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Новый пароль' })
  password!: string;
}

@InputType()
export class RotateCashierInput {
  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Перегенерировать логин' })
  @IsOptional()
  @IsBoolean()
  regenerateLogin?: boolean;
}

export class RotateCashierDto extends RotateCashierInput {}

@InputType()
export class IssueCashierActivationCodesInput {
  @Field(() => Number)
  @ApiProperty({ description: 'Количество кодов', minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;
}

export class IssueCashierActivationCodesDto extends IssueCashierActivationCodesInput {}

@ObjectType()
export class CashierPinDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор доступа' })
  id!: string;

  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор сотрудника' })
  staffId!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Имя сотрудника' })
  staffName?: string | null;

  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор точки' })
  outletId!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Название точки' })
  outletName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'PIN-код', minLength: 4, maxLength: 4 })
  pinCode?: string | null;

  @Field(() => StaffOutletAccessStatus)
  @ApiProperty({ enum: StaffOutletAccessStatus })
  status!: StaffOutletAccessStatus;

  @Field(() => GraphQLISODateTime)
  @ApiProperty({ description: 'Дата обновления PIN' })
  updatedAt!: Date;
}
