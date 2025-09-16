import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import cors from 'cors';

@Injectable()
export class SecurityHardeningService {
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
  }

  getHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: this.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: this.isProduction,
      crossOriginOpenerPolicy: this.isProduction,
      crossOriginResourcePolicy: { policy: 'same-site' },
      dnsPrefetchControl: { allow: true },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 15552000, // 180 days in seconds
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true,
    });
  }

  getRateLimitMiddleware() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later',
    });
  }

  getHppMiddleware() {
    return hpp({
      whitelist: ['sort', 'page', 'limit', 'fields'],
    });
  }

  getXssMiddleware() {
    return xss();
  }

  getMongoSanitizeMiddleware() {
    return mongoSanitize({
      replaceWith: '_',
      onSanitize: ({ key }) => {
        console.warn(`Sanitized request ${key}`);
      },
    });
  }

  getCompressionMiddleware() {
    return compression({
      level: 6,
      threshold: '1kb',
    });
  }

  getCorsMiddleware() {
    const whitelist = this.configService.get('CORS_WHITELIST', '').split(',');

    return cors({
      origin: (origin, callback) => {
        if (!origin || whitelist.includes(origin) || !this.isProduction) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Forwarded-For',
        'X-Forwarded-Proto',
        'X-Real-IP',
        'X-Forwarded-Host',
        'X-Forwarded-Port',
        'X-Forwarded-Prefix',
      ],
      exposedHeaders: ['Content-Disposition'],
    });
  }

  getSecurityMiddlewares() {
    return [
      this.getCorsMiddleware(),
      this.getHelmetMiddleware(),
      this.getRateLimitMiddleware(),
      this.getCompressionMiddleware(),
      this.getHppMiddleware(),
      this.getXssMiddleware(),
      this.getMongoSanitizeMiddleware(),
    ];
  }
}
