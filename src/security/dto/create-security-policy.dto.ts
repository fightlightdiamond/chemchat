import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
} from 'class-validator';
import { SecurityPolicyType } from '../interfaces/security.interface';

export class CreateSecurityPolicyDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: SecurityPolicyType })
  type: SecurityPolicyType;

  @ApiProperty({ type: [Object], required: false })
  @IsOptional()
  @IsArray()
  rules?: any[];

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  conditions?: Record<string, any>;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  actions?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
