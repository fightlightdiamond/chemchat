import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly csp: string;
  private readonly featurePolicy: string;
  private readonly permissionsPolicy: string;
  private readonly reportTo: string;
  private readonly expectCt: string;
  private readonly xssProtection: string;
  private readonly xFrameOptions: string;
  private readonly xContentTypeOptions: string;
  private readonly referrerPolicy: string;
  private readonly strictTransportSecurity: string;
  private readonly crossOriginEmbedderPolicy: string;
  private readonly crossOriginOpenerPolicy: string;
  private readonly crossOriginResourcePolicy: string;
  private readonly originAgentCluster: string;
  private readonly xPermittedCrossDomainPolicies: string;

  constructor(private readonly configService: ConfigService) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const appUrl = this.configService.get('APP_URL', 'https://chemchat.example.com');
    const reportUri = this.configService.get('SECURITY_REPORT_URI', 'https://chemchat.example.com/report-endpoint');
    
    // Content Security Policy
    this.csp = [
      "default-src 'self'",
      "connect-src 'self' https://*.sentry.io wss://*",
      `frame-src 'self' ${appUrl}`,  
      `img-src 'self' data: blob: ${appUrl}`,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      `form-action 'self' ${appUrl}`,
      "frame-ancestors 'self'",
      `report-uri ${reportUri}`,
      isProduction ? "upgrade-insecure-requests" : "",
      "block-all-mixed-content"
    ].filter(Boolean).join('; ');

    // Feature Policy (legacy)
    this.featurePolicy = [
      "accelerometer 'none'",
      "camera 'none'",
      "geolocation 'self'",
      "gyroscope 'none'",
      "magnetometer 'none'",
      "microphone 'none'",
      "payment 'none'",
      "usb 'none'"
    ].join('; ');

    // Permissions Policy (replaces Feature Policy)
    this.permissionsPolicy = [
      'camera=()',
      'geolocation=(self)',
      'microphone=()',
      'payment=()',
      'usb=()',
      'fullscreen=(self)',
      'display-capture=()',
      'web-share=()'
    ].join(', ');

    // Report-To header for reporting API
    this.reportTo = JSON.stringify({
      group: 'default',
      max_age: 31536000,
      endpoints: [{ url: reportUri }],
      include_subdomains: true
    });

    // Expect-CT header
    this.expectCt = `max-age=86400, enforce, report-uri="${reportUri}"`;
    
    // Other security headers
    this.xssProtection = '1; mode=block';
    this.xFrameOptions = 'SAMEORIGIN';
    this.xContentTypeOptions = 'nosniff';
    this.referrerPolicy = 'strict-origin-when-cross-origin';
    this.strictTransportSecurity = 'max-age=31536000; includeSubDomains; preload';
    this.crossOriginEmbedderPolicy = 'require-corp';
    this.crossOriginOpenerPolicy = 'same-origin';
    this.crossOriginResourcePolicy = 'same-origin';
    this.originAgentCluster = '?1';
    this.xPermittedCrossDomainPolicies = 'none';
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Set security headers
    res.setHeader('Content-Security-Policy', this.csp);
    res.setHeader('Feature-Policy', this.featurePolicy);
    res.setHeader('Permissions-Policy', this.permissionsPolicy);
    res.setHeader('Report-To', this.reportTo);
    res.setHeader('Expect-CT', this.expectCt);
    res.setHeader('X-Content-Type-Options', this.xContentTypeOptions);
    res.setHeader('X-Frame-Options', this.xFrameOptions);
    res.setHeader('X-XSS-Protection', this.xssProtection);
    res.setHeader('Referrer-Policy', this.referrerPolicy);
    res.setHeader('Strict-Transport-Security', this.strictTransportSecurity);
    res.setHeader('Cross-Origin-Embedder-Policy', this.crossOriginEmbedderPolicy);
    res.setHeader('Cross-Origin-Opener-Policy', this.crossOriginOpenerPolicy);
    res.setHeader('Cross-Origin-Resource-Policy', this.crossOriginResourcePolicy);
    res.setHeader('Origin-Agent-Cluster', this.originAgentCluster);
    res.setHeader('X-Permitted-Cross-Domain-Policies', this.xPermittedCrossDomainPolicies);
    
    // Remove X-Powered-By header if present
    res.removeHeader('X-Powered-By');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    next();
  }
}
