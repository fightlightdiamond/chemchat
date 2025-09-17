import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsIP,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum SecuritySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class BlockIpDto {
  @ApiProperty({
    description: 'IP address to block',
    example: '192.168.1.100',
  })
  @IsIP()
  ipAddress: string;

  @ApiProperty({
    description: 'Reason for blocking the IP',
    example: 'Suspicious activity detected',
  })
  @IsString()
  reason: string;

  @ApiProperty({
    description: 'Block duration in seconds',
    required: false,
    default: 3600,
  })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiProperty({
    enum: SecuritySeverity,
    description: 'Severity level of the threat',
    required: false,
    default: SecuritySeverity.MEDIUM,
  })
  @IsOptional()
  @IsEnum(SecuritySeverity)
  severity?: SecuritySeverity;
}

export class UnblockIpDto {
  @ApiProperty({
    description: 'Reason for unblocking the IP',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResolveAlertDto {
  @ApiProperty({
    description: 'Resolution details',
    required: false,
  })
  @IsOptional()
  @IsString()
  resolution?: string;
}

export class CreateIncidentDto {
  @ApiProperty({
    description: 'Incident title',
    example: 'Suspicious login activity detected',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Detailed incident description',
  })
  @IsString()
  description: string;

  @ApiProperty({
    enum: SecuritySeverity,
    description: 'Incident severity level',
  })
  @IsEnum(SecuritySeverity)
  severity: SecuritySeverity;

  @ApiProperty({
    description: 'Incident category',
    example: 'authentication',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'Related security event IDs',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedEventIds?: string[];
}
