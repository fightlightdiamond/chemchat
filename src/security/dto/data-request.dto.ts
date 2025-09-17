import { IsEnum, IsOptional, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DataRequestType {
  EXPORT = 'EXPORT',
  DELETION = 'DELETION',
  RECTIFICATION = 'RECTIFICATION',
  PORTABILITY = 'PORTABILITY',
  RESTRICTION = 'RESTRICTION',
}

export class CreateDataRequestDto {
  @ApiProperty({
    enum: DataRequestType,
    description: 'Type of data subject request',
  })
  @IsEnum(DataRequestType)
  requestType: DataRequestType;

  @ApiProperty({
    description: 'Additional data for the request (e.g., rectification data)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  data?: any;

  @ApiProperty({
    description: 'Request metadata and context',
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateConsentDto {
  @ApiProperty({
    description: 'Consent preferences by type',
    example: {
      DATA_PROCESSING: true,
      MARKETING: false,
      ANALYTICS: true,
      THIRD_PARTY_SHARING: false,
      NOTIFICATIONS: true,
      COOKIES: true,
    },
  })
  @IsObject()
  consent: Record<string, boolean>;

  @ApiProperty({
    description: 'Consent version',
    required: false,
    default: '1.0',
  })
  @IsOptional()
  @IsString()
  version?: string;
}
