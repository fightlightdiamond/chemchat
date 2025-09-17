import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DataType } from '@prisma/client';

export class CreateRetentionPolicyDto {
  @ApiProperty({
    description: 'Policy name',
    example: 'Message Retention Policy',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Policy description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: DataType,
    description: 'Type of data this policy applies to',
  })
  @IsEnum(DataType)
  dataType: DataType;

  @ApiProperty({
    description: 'Retention period in days',
    minimum: 1,
    maximum: 3650,
  })
  @IsNumber()
  @Min(1)
  @Max(3650)
  retentionPeriodDays: number;

  @ApiProperty({
    description: 'Whether the policy is active',
    default: true,
  })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    description:
      'Whether to automatically delete data when retention period expires',
    default: false,
  })
  @IsBoolean()
  autoDelete: boolean;

  @ApiProperty({
    description: 'Whether to anonymize data before deletion',
    default: true,
  })
  @IsBoolean()
  anonymizeFirst: boolean;

  @ApiProperty({
    description: 'Whether to notify before deletion',
    default: true,
  })
  @IsBoolean()
  notifyBeforeDeletion: boolean;

  @ApiProperty({
    description: 'Number of days before deletion to send notification',
    default: 7,
  })
  @IsNumber()
  @Min(1)
  @Max(30)
  notificationDays: number;
}

export class UpdateRetentionPolicyDto {
  @ApiProperty({
    description: 'Policy name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Policy description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Retention period in days',
    required: false,
    minimum: 1,
    maximum: 3650,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3650)
  retentionPeriodDays?: number;

  @ApiProperty({
    description: 'Whether the policy is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description:
      'Whether to automatically delete data when retention period expires',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoDelete?: boolean;

  @ApiProperty({
    description: 'Whether to anonymize data before deletion',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  anonymizeFirst?: boolean;

  @ApiProperty({
    description: 'Whether to notify before deletion',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyBeforeDeletion?: boolean;

  @ApiProperty({
    description: 'Number of days before deletion to send notification',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  notificationDays?: number;
}

export class EnforceRetentionDto {
  @ApiProperty({
    enum: DataType,
    description: 'Type of data to enforce retention on',
  })
  @IsEnum(DataType)
  dataType: DataType;

  @ApiProperty({
    description: 'Retention period in days',
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  retentionDays: number;
}

export class ProcessInactiveUsersDto {
  @ApiProperty({
    description: 'Number of days of inactivity before processing',
    minimum: 30,
  })
  @IsNumber()
  @Min(30)
  retentionDays: number;

  @ApiProperty({
    description: 'Whether to anonymize instead of delete',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  anonymize?: boolean;
}
