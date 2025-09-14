# Admin Module Migration Guide

## Current Status
The admin and moderation features have been implemented but require database migration to be fully functional. The Prisma schema includes all admin models, but they haven't been migrated to the database yet.

## Steps to Complete Admin Module Setup

### 1. Start Database Services
First, ensure your database is running. You can use Docker:

```bash
# Start Docker Desktop first, then:
docker-compose up -d postgres redis

# Or start all services:
./scripts/docker-dev.sh start
```

### 2. Run Database Migration
Once the database is running, apply the admin schema changes:

```bash
# Create and apply migration
npx prisma migrate dev --name add-admin-moderation-models

# Regenerate Prisma client
npx prisma generate
```

### 3. Restore Admin Module
After successful migration, uncomment the admin module in `src/app.module.ts`:

```typescript
// Change this:
// import { AdminModule } from './admin/admin.module'; // Temporarily commented out until Prisma migration

// To this:
import { AdminModule } from './admin/admin.module';

// And in the imports array:
// AdminModule, // Temporarily commented out until Prisma migration
AdminModule,
```

### 4. Verify Build
Run the build to ensure everything works:

```bash
npm run build
npm run lint
```

## Admin Models Included
- **AdminRole**: Role management with permissions and expiration
- **ModerationAction**: Tracking of all moderation actions with metadata  
- **ContentReport**: User reporting system with assignment and resolution tracking
- **AutoModerationRule**: Configurable automated moderation rules
- **AutoModerationViolation**: Violation tracking with review workflow
- **UserBan**: Comprehensive ban management with different ban types

## Admin Enums Available
- AdminRoleType: SUPER_ADMIN, TENANT_ADMIN, MODERATOR
- ModerationActionType: WARN, MUTE, KICK, BAN, DELETE_MESSAGE, etc.
- ModerationTargetType: USER, MESSAGE, CONVERSATION
- BanType: TEMPORARY, PERMANENT, IP_BAN
- ReportStatus: PENDING, IN_REVIEW, RESOLVED, DISMISSED
- ReportPriority: LOW, MEDIUM, HIGH, CRITICAL
- ReportType: SPAM, HARASSMENT, INAPPROPRIATE_CONTENT, etc.
- AutoModerationRuleType: SPAM_DETECTION, PROFANITY_FILTER, RATE_LIMITING, etc.
- RuleSeverity: LOW, MEDIUM, HIGH, CRITICAL
- ReviewStatus: PENDING, APPROVED, REJECTED

## Troubleshooting

### If migration fails:
1. Check database connection in `.env`
2. Ensure PostgreSQL is running
3. Check for any schema conflicts

### If Prisma client doesn't include admin models:
1. Run `npx prisma generate` again
2. Clear node_modules and reinstall if needed
3. Restart TypeScript server in your IDE

### If build still fails after migration:
1. Check that all admin model properties exist on PrismaService
2. Verify enum imports are correct
3. Run `npm run build` to see specific errors

## Current Build Status
❌ Admin module temporarily disabled to allow core build to pass
✅ All admin code implemented and ready
✅ Prisma schema includes all admin models
⏳ Waiting for database migration to enable admin features
