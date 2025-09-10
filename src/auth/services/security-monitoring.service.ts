import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  timestamp: number;
  details: Record<string, any>;
  severity: SecuritySeverity;
}

export enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  SUCCESSFUL_LOGIN = 'successful_login',
  MULTIPLE_FAILED_LOGINS = 'multiple_failed_logins',
  SUSPICIOUS_LOCATION = 'suspicious_location',
  UNUSUAL_DEVICE = 'unusual_device',
  TOKEN_THEFT_SUSPECTED = 'token_theft_suspected',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  ACCOUNT_LOCKED = 'account_locked',
  MFA_BYPASS_ATTEMPT = 'mfa_bypass_attempt',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface SuspiciousActivityResult {
  isSuspicious: boolean;
  riskScore: number;
  reasons: string[];
  recommendedActions: string[];
}

@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly maxFailedAttempts: number;
  private readonly suspiciousLocationThreshold: number;
  private readonly unusualDeviceThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.maxFailedAttempts = this.configService.get<number>(
      'MAX_FAILED_LOGIN_ATTEMPTS',
      5,
    );
    this.suspiciousLocationThreshold = this.configService.get<number>(
      'SUSPICIOUS_LOCATION_THRESHOLD',
      1000,
    ); // km
    this.unusualDeviceThreshold = this.configService.get<number>(
      'UNUSUAL_DEVICE_THRESHOLD',
      30,
    ); // days
  }

  /**
   * Log a security event
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    // Store event in database/logging system
    this.securityEvents.push({ ...event, timestamp: Date.now() });

    // Log based on severity
    const logMessage = `Security Event: ${event.type} - IP: ${event.ipAddress} - User: ${event.userId || 'unknown'}`;

    switch (event.severity) {
      case SecuritySeverity.CRITICAL:
        this.logger.error(logMessage, event.details);
        break;
      case SecuritySeverity.HIGH:
        this.logger.warn(logMessage, event.details);
        break;
      case SecuritySeverity.MEDIUM:
        this.logger.log(logMessage, event.details);
        break;
      case SecuritySeverity.LOW:
        this.logger.debug(logMessage, event.details);
        break;
    }

    // Trigger automated responses for high-severity events
    if (
      event.severity === SecuritySeverity.HIGH ||
      event.severity === SecuritySeverity.CRITICAL
    ) {
      this.handleHighSeverityEvent(event as SecurityEvent);
    }
  }

  /**
   * Analyze login attempt for suspicious activity
   */
  analyzeLoginAttempt(
    userId: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    location?: { latitude: number; longitude: number },
  ): SuspiciousActivityResult {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check failed login attempts
    const recentFailedAttempts = this.getRecentFailedAttempts(
      userId,
      ipAddress,
    );
    if (recentFailedAttempts >= this.maxFailedAttempts) {
      reasons.push(`Multiple failed login attempts: ${recentFailedAttempts}`);
      riskScore += 30;
    }

    // Check for unusual location
    if (location && userId) {
      const isUnusualLocation = this.isUnusualLocation(userId, location);
      if (isUnusualLocation) {
        reasons.push('Login from unusual geographic location');
        riskScore += 25;
      }
    }

    // Check for unusual device
    const isUnusualDevice = this.isUnusualDevice(userId, userAgent);
    if (isUnusualDevice) {
      reasons.push('Login from unusual device/browser');
      riskScore += 20;
    }

    // Check for rapid login attempts from different IPs
    const rapidAttempts = this.hasRapidLoginAttempts(userId);
    if (rapidAttempts) {
      reasons.push('Rapid login attempts from multiple IP addresses');
      riskScore += 35;
    }

    // Check for suspicious IP patterns
    const isSuspiciousIP = this.isSuspiciousIP(ipAddress);
    if (isSuspiciousIP) {
      reasons.push('Login from suspicious IP address');
      riskScore += 40;
    }

    const isSuspicious = riskScore >= 50;
    const recommendedActions = this.getRecommendedActions(riskScore, reasons);

    // Log the analysis
    this.logSecurityEvent({
      type: success
        ? SecurityEventType.SUCCESSFUL_LOGIN
        : SecurityEventType.FAILED_LOGIN,
      userId,
      ipAddress,
      userAgent,
      details: {
        riskScore,
        reasons,
        location,
        isSuspicious,
      },
      severity: this.getSeverityFromRiskScore(riskScore),
    });

    return {
      isSuspicious,
      riskScore,
      reasons,
      recommendedActions,
    };
  }

  /**
   * Detect brute force attack patterns
   */
  detectBruteForceAttack(ipAddress: string): boolean {
    const timeWindow = 300000; // 5 minutes
    const threshold = 20; // attempts
    const now = Date.now();

    const recentAttempts = this.securityEvents.filter(
      (event) =>
        event.ipAddress === ipAddress &&
        event.type === SecurityEventType.FAILED_LOGIN &&
        now - event.timestamp < timeWindow,
    );

    if (recentAttempts.length >= threshold) {
      this.logSecurityEvent({
        type: SecurityEventType.BRUTE_FORCE_ATTACK,
        ipAddress,
        details: {
          attemptCount: recentAttempts.length,
          timeWindow: timeWindow / 1000,
        },
        severity: SecuritySeverity.HIGH,
      });

      return true;
    }

    return false;
  }

  /**
   * Detect potential token theft
   */
  detectTokenTheft(
    userId: string,
    currentIP: string,
    currentUserAgent: string,
    tokenIssuedAt: number,
  ): boolean {
    const suspiciousIndicators: string[] = [];

    // Check for simultaneous usage from different locations
    const recentLogins = this.getRecentLogins(userId, 3600000); // 1 hour
    const uniqueIPs = new Set(recentLogins.map((login) => login.ipAddress));

    if (uniqueIPs.size > 3) {
      suspiciousIndicators.push(
        'Multiple simultaneous sessions from different IPs',
      );
    }

    // Check for usage from previously unseen device after token issuance
    const deviceFirstSeen = this.getDeviceFirstSeen(userId, currentUserAgent);
    if (deviceFirstSeen && deviceFirstSeen > tokenIssuedAt) {
      suspiciousIndicators.push('Token used from new device after issuance');
    }

    if (suspiciousIndicators.length > 0) {
      this.logSecurityEvent({
        type: SecurityEventType.TOKEN_THEFT_SUSPECTED,
        userId,
        ipAddress: currentIP,
        userAgent: currentUserAgent,
        details: {
          riskScore: 50,
          reasons: suspiciousIndicators,
          recommendedActions: this.getRecommendedActions(
            50,
            suspiciousIndicators,
          ),
        },
        severity: SecuritySeverity.MEDIUM,
      });

      return true;
    }

    return false;
  }

  /**
   * Get security events for user
   */
  getUserSecurityEvents(
    userId: string,
    limit: number = 50,
    eventTypes?: SecurityEventType[],
  ): SecurityEvent[] {
    return this.securityEvents
      .filter(
        (event) =>
          event.userId === userId &&
          (!eventTypes || eventTypes.includes(event.type)),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(timeWindow: number = 86400000): Record<string, number> {
    const now = Date.now();
    const recentEvents = this.securityEvents.filter(
      (event) => now - event.timestamp < timeWindow,
    );

    const stats: Record<string, number> = {};

    for (const eventType of Object.values(SecurityEventType)) {
      stats[eventType] = recentEvents.filter(
        (event) => event.type === eventType,
      ).length;
    }

    return stats;
  }

  private getRecentFailedAttempts(userId: string, ipAddress: string): number {
    const timeWindow = 300000; // 5 minutes
    const now = Date.now();

    return this.securityEvents.filter(
      (event) =>
        event.userId === userId &&
        event.ipAddress === ipAddress &&
        event.type === SecurityEventType.FAILED_LOGIN &&
        now - event.timestamp < timeWindow,
    ).length;
  }

  private isUnusualLocation(
    userId: string,
    location: { latitude: number; longitude: number },
  ): boolean {
    // In a real implementation, this would check against user's historical locations
    // For now, we'll simulate by checking if it's far from a "home" location
    const homeLocation = this.userHomeLocations.get(userId);
    if (!homeLocation) {
      // First time login location - not suspicious
      this.userHomeLocations.set(userId, location);
      return false;
    }

    const distance = this.calculateDistance(location, homeLocation);
    return distance > this.suspiciousLocationThreshold;
  }

  private isUnusualDevice(userId: string, userAgent: string): boolean {
    const userDevices = this.userDevices.get(userId) || [];
    const deviceExists = userDevices.some(
      (device) => device.userAgent === userAgent,
    );

    if (!deviceExists) {
      // New device
      userDevices.push({
        userAgent,
        firstSeen: Date.now(),
      });
      this.userDevices.set(userId, userDevices);

      // Consider it unusual if user has been active for a while
      const oldestDevice = userDevices.reduce((oldest, device) =>
        device.firstSeen < oldest.firstSeen ? device : oldest,
      );

      const daysSinceFirstDevice =
        (Date.now() - oldestDevice.firstSeen) / (1000 * 60 * 60 * 24);
      return daysSinceFirstDevice > this.unusualDeviceThreshold;
    }

    return false;
  }

  private hasRapidLoginAttempts(userId: string): boolean {
    const timeWindow = 300000; // 5 minutes
    const now = Date.now();

    const recentLogins = this.securityEvents.filter(
      (event) =>
        event.userId === userId &&
        (event.type === SecurityEventType.SUCCESSFUL_LOGIN ||
          event.type === SecurityEventType.FAILED_LOGIN) &&
        now - event.timestamp < timeWindow,
    );

    const uniqueIPs = new Set(recentLogins.map((login) => login.ipAddress));
    return uniqueIPs.size > 3; // More than 3 different IPs in 5 minutes
  }

  private isSuspiciousIP(ipAddress: string): boolean {
    // In a real implementation, this would check against threat intelligence feeds
    // For now, we'll use a simple heuristic

    // Check if IP has been associated with many failed attempts
    const recentFailures = this.securityEvents.filter(
      (event) =>
        event.ipAddress === ipAddress &&
        event.type === SecurityEventType.FAILED_LOGIN &&
        Date.now() - event.timestamp < 3600000, // 1 hour
    );

    return recentFailures.length > 10;
  }

  private getRecentLogins(userId: string, timeWindow: number): SecurityEvent[] {
    const now = Date.now();
    return this.securityEvents.filter(
      (event) =>
        event.userId === userId &&
        event.type === SecurityEventType.SUCCESSFUL_LOGIN &&
        now - event.timestamp < timeWindow,
    );
  }

  private getDeviceFirstSeen(userId: string, userAgent: string): number | null {
    const userDevices = this.userDevices.get(userId) || [];
    const device = userDevices.find((d) => d.userAgent === userAgent);
    return device ? device.firstSeen : null;
  }

  private getRecommendedActions(
    riskScore: number,
    reasons: string[],
  ): string[] {
    const actions: string[] = [];

    if (riskScore >= 70) {
      actions.push('Block login attempt');
      actions.push('Require additional verification');
      actions.push('Notify security team');
    } else if (riskScore >= 50) {
      actions.push('Require MFA verification');
      actions.push('Send security alert to user');
      actions.push('Monitor subsequent activity');
    } else if (riskScore >= 30) {
      actions.push('Log security event');
      actions.push('Consider MFA prompt');
    }

    if (reasons.some((r) => r.includes('Multiple failed'))) {
      actions.push('Implement temporary rate limiting');
    }

    if (reasons.some((r) => r.includes('unusual location'))) {
      actions.push('Send location verification email');
    }

    return actions;
  }

  private getSeverityFromRiskScore(riskScore: number): SecuritySeverity {
    if (riskScore >= 80) return SecuritySeverity.CRITICAL;
    if (riskScore >= 60) return SecuritySeverity.HIGH;
    if (riskScore >= 40) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  private handleHighSeverityEvent(event: SecurityEvent): void {
    // In a real implementation, this would:
    // 1. Send alerts to security team
    // 2. Trigger automated blocking rules
    // 3. Update threat intelligence feeds
    // 4. Initiate incident response procedures

    this.logger.warn(
      `High severity security event detected: ${event.type}`,
      event,
    );
  }

  private calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number },
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.latitude - point1.latitude);
    const dLon = this.toRadians(point2.longitude - point1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.latitude)) *
        Math.cos(this.toRadians(point2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // In-memory storage (use database/Redis in production)
  private readonly securityEvents: SecurityEvent[] = [];
  private readonly userHomeLocations = new Map<
    string,
    { latitude: number; longitude: number }
  >();
  private readonly userDevices = new Map<
    string,
    Array<{ userAgent: string; firstSeen: number }>
  >();
}
