import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { SecurityMonitoringService } from '../../security/services/security-monitoring.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../../test/mocks/prisma.mock';
import { TestDataFactory } from '../../../test/fixtures/test-data';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let tokenService: any;
  let securityService: any;
  let prismaService: any;

  beforeEach(async () => {
    const mockTokenService = {
      generateTokens: jest.fn(),
      validateToken: jest.fn(),
      revokeToken: jest.fn(),
    };

    const mockSecurityService = {
      recordSecurityEvent: jest.fn(),
      analyzeLoginAttempt: jest.fn(),
    };

    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TokenService, useValue: mockTokenService },
        { provide: SecurityMonitoringService, useValue: mockSecurityService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    tokenService = module.get<TokenService>(TokenService);
    securityService = module.get<SecurityMonitoringService>(SecurityMonitoringService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      const tenant = TestDataFactory.createTenant();
      const user = TestDataFactory.createUser(tenant.id, {
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
      });

      const loginDto = {
        email: 'test@example.com',
        password: 'plainPassword',
        deviceFingerprint: 'device123',
      };

      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        wsToken: 'ws-token',
      };

      prismaService.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      tokenService.generateTokens.mockResolvedValue(tokens);
      securityService.analyzeLoginAttempt.mockResolvedValue({ riskScore: 0.1, isBlocked: false });

      const result = await service.login(loginDto, 'tenant-1');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email, tenantId: 'tenant-1' },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, user.passwordHash);
      expect(tokenService.generateTokens).toHaveBeenCalledWith(user, loginDto.deviceFingerprint);
      expect(result).toEqual({
        user: expect.objectContaining({ id: user.id, email: user.email }),
        tokens,
      });
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      const loginDto = {
        email: 'invalid@example.com',
        password: 'password',
        deviceFingerprint: 'device123',
      };

      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto, 'tenant-1')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const user = TestDataFactory.createUser('tenant-1', {
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
      });

      const loginDto = {
        email: 'test@example.com',
        password: 'wrongPassword',
        deviceFingerprint: 'device123',
      };

      prismaService.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto, 'tenant-1')).rejects.toThrow(UnauthorizedException);
    });

    it('should block login for high-risk attempts', async () => {
      const user = TestDataFactory.createUser('tenant-1');
      const loginDto = {
        email: user.email,
        password: 'password',
        deviceFingerprint: 'device123',
      };

      prismaService.user.findUnique.mockResolvedValue(user);
      securityService.analyzeLoginAttempt.mockResolvedValue({ riskScore: 0.9, isBlocked: true });

      await expect(service.login(loginDto, 'tenant-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke tokens on logout', async () => {
      const userId = 'user-1';
      const deviceFingerprint = 'device123';

      tokenService.revokeToken.mockResolvedValue(true);

      await service.logout(userId, deviceFingerprint);

      expect(tokenService.revokeToken).toHaveBeenCalledWith(userId, deviceFingerprint);
      expect(securityService.recordSecurityEvent).toHaveBeenCalledWith({
        userId,
        eventType: 'LOGOUT',
        severity: 'INFO',
        metadata: { deviceFingerprint },
      });
    });
  });

  describe('validateUser', () => {
    it('should validate user from token payload', async () => {
      const user = TestDataFactory.createUser('tenant-1');
      const payload = { sub: user.id, tenantId: 'tenant-1' };

      prismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.validateUser(payload);

      expect(result).toEqual(user);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: payload.sub, tenantId: payload.tenantId },
      });
    });

    it('should return null for invalid user', async () => {
      const payload = { sub: 'invalid-user', tenantId: 'tenant-1' };

      prismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(payload);

      expect(result).toBeNull();
    });
  });
});
