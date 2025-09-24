-- CreateEnum
CREATE TYPE "public"."ConversationType" AS ENUM ('dm', 'group');

-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('text', 'image', 'file', 'system');

-- CreateEnum
CREATE TYPE "public"."DevicePlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('new_message', 'mention', 'conversation_invite', 'user_joined', 'user_left', 'message_reaction', 'system_announcement');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('push', 'email', 'sms');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('pending', 'scheduled', 'sent', 'delivered', 'read', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."MediaUploadStatus" AS ENUM ('pending', 'uploading', 'uploaded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."MediaProcessingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "public"."MediaProcessingType" AS ENUM ('thumbnail_generation', 'image_resize', 'video_transcode', 'audio_transcode', 'exif_strip', 'watermark', 'virus_scan', 'content_moderation');

-- CreateEnum
CREATE TYPE "public"."ProcessingPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "public"."VirusScanStatus" AS ENUM ('pending', 'scanning', 'clean', 'infected', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "public"."SubscriptionTier" AS ENUM ('free', 'basic', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "public"."AdminRoleType" AS ENUM ('super_admin', 'tenant_admin', 'moderator', 'support');

-- CreateEnum
CREATE TYPE "public"."ModerationTargetType" AS ENUM ('user', 'message', 'conversation', 'attachment');

-- CreateEnum
CREATE TYPE "public"."ModerationActionType" AS ENUM ('warn', 'mute', 'kick', 'ban', 'delete', 'edit', 'quarantine', 'restore');

-- CreateEnum
CREATE TYPE "public"."ReportType" AS ENUM ('spam', 'harassment', 'hate_speech', 'violence', 'inappropriate_content', 'copyright', 'impersonation', 'other');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('pending', 'investigating', 'resolved', 'dismissed', 'escalated');

-- CreateEnum
CREATE TYPE "public"."ReportPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "public"."AutoModerationRuleType" AS ENUM ('spam_detection', 'profanity_filter', 'rate_limiting', 'content_similarity', 'link_filter', 'caps_filter', 'mention_spam', 'image_moderation');

-- CreateEnum
CREATE TYPE "public"."RuleSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "public"."ReviewStatus" AS ENUM ('pending', 'approved', 'rejected', 'escalated');

-- CreateEnum
CREATE TYPE "public"."BanType" AS ENUM ('temporary', 'permanent', 'shadow');

-- CreateEnum
CREATE TYPE "public"."DataType" AS ENUM ('user_profile', 'messages', 'conversations', 'attachments', 'notifications', 'audit_logs', 'device_tokens', 'session_data');

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'admin_action', 'permission_change', 'configuration_change');

-- CreateEnum
CREATE TYPE "public"."AuditResource" AS ENUM ('user', 'message', 'conversation', 'attachment', 'notification', 'admin_role', 'tenant', 'system');

-- CreateEnum
CREATE TYPE "public"."AuditSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "public"."AuditOutcome" AS ENUM ('success', 'failure', 'partial');

-- CreateEnum
CREATE TYPE "public"."DataSubjectRequestType" AS ENUM ('export', 'deletion', 'rectification', 'portability', 'restriction');

-- CreateEnum
CREATE TYPE "public"."DataSubjectRequestStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."ConsentType" AS ENUM ('data_processing', 'marketing', 'analytics', 'third_party_sharing', 'notifications', 'cookies');

-- CreateEnum
CREATE TYPE "public"."SecurityEventType" AS ENUM ('authentication_failure', 'authentication_success', 'password_change', 'mfa_enabled', 'mfa_disabled', 'authorization_failure', 'permission_granted', 'permission_revoked', 'role_assigned', 'role_revoked', 'suspicious_login', 'brute_force_attempt', 'rate_limit_exceeded', 'geo_blocked', 'policy_created', 'policy_updated', 'policy_deleted', 'policy_evaluation', 'vulnerability_found', 'vulnerability_fixed', 'scan_started', 'scan_completed', 'scan_failed', 'data_access', 'data_modification', 'data_deletion', 'data_export', 'data_retention_process', 'user_data_deleted', 'consent_updated', 'unusual_access_pattern', 'privilege_escalation', 'data_exfiltration', 'malicious_payload', 'system_intrusion', 'policy_violation', 'anomalous_behavior');

-- CreateEnum
CREATE TYPE "public"."SecuritySeverity" AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "public"."AnomalyType" AS ENUM ('unusual_login_time', 'unusual_location', 'excessive_api_calls', 'unusual_data_access', 'suspicious_user_agent', 'rapid_permission_changes', 'bulk_data_operations', 'unusual_device');

-- CreateEnum
CREATE TYPE "public"."AnomalySeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "public"."IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "public"."IncidentStatus" AS ENUM ('open', 'investigating', 'contained', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "public"."IncidentCategory" AS ENUM ('authentication', 'authorization', 'data_breach', 'malware', 'phishing', 'ddos', 'insider_threat', 'system_compromise', 'policy_violation', 'other');

-- CreateEnum
CREATE TYPE "public"."ActionType" AS ENUM ('block_ip', 'block_user', 'revoke_session', 'send_alert', 'create_incident', 'escalate', 'quarantine', 'collect_evidence', 'notify_admin', 'disable_account');

-- CreateEnum
CREATE TYPE "public"."ActionResult" AS ENUM ('success', 'failure', 'partial', 'pending');

-- CreateTable
CREATE TABLE "public"."tenants" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "subscription_tier" "public"."SubscriptionTier" NOT NULL DEFAULT 'free',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_settings" (
    "tenant_id" TEXT NOT NULL,
    "allow_file_uploads" BOOLEAN NOT NULL DEFAULT true,
    "max_file_size" INTEGER NOT NULL,
    "allowed_file_types" TEXT[],
    "retention_days" INTEGER NOT NULL DEFAULT 30,
    "enable_notifications" BOOLEAN NOT NULL DEFAULT true,
    "enable_search" BOOLEAN NOT NULL DEFAULT true,
    "custom_branding" BOOLEAN NOT NULL DEFAULT false,
    "sso_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "public"."tenant_quotas" (
    "tenant_id" TEXT NOT NULL,
    "max_users" INTEGER NOT NULL,
    "max_conversations" INTEGER NOT NULL,
    "max_messages_per_day" INTEGER NOT NULL,
    "max_storage_bytes" BIGINT NOT NULL,
    "max_connections_per_user" INTEGER NOT NULL,
    "max_api_requests_per_hour" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_quotas_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "public"."tenant_usage" (
    "tenant_id" TEXT NOT NULL,
    "current_users" INTEGER NOT NULL DEFAULT 0,
    "current_conversations" INTEGER NOT NULL DEFAULT 0,
    "messages_used_today" INTEGER NOT NULL DEFAULT 0,
    "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "current_connections" INTEGER NOT NULL DEFAULT 0,
    "api_requests_this_hour" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" TEXT NOT NULL,
    "type" "public"."ConversationType" NOT NULL,
    "name" VARCHAR(100),
    "owner_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_members" (
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL DEFAULT 'member',
    "last_read_message_id" TEXT,
    "last_read_sequence" BIGINT NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "client_message_id" VARCHAR(100),
    "sequence_number" BIGINT NOT NULL,
    "message_type" "public"."MessageType" NOT NULL DEFAULT 'text',
    "content" JSONB NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."message_reactions" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id","user_id","emoji")
);

-- CreateTable
CREATE TABLE "public"."conversation_state" (
    "conversation_id" TEXT NOT NULL,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_state_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "public"."attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "storage_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "preview_url" TEXT,
    "upload_status" "public"."MediaUploadStatus" NOT NULL DEFAULT 'pending',
    "processing_status" "public"."MediaProcessingStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "virus_scan_status" "public"."VirusScanStatus" NOT NULL DEFAULT 'pending',
    "virus_scan_result" TEXT,
    "content_safety" JSONB,
    "cdn_url" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "tenant_id" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_processing" (
    "id" TEXT NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "job_type" "public"."MediaProcessingType" NOT NULL,
    "status" "public"."MediaProcessingStatus" NOT NULL DEFAULT 'pending',
    "priority" "public"."ProcessingPriority" NOT NULL DEFAULT 'normal',
    "input_url" TEXT NOT NULL,
    "output_url" TEXT,
    "parameters" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "tenant_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_quotas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "storage_used" BIGINT NOT NULL DEFAULT 0,
    "storage_limit" BIGINT NOT NULL,
    "upload_count" INTEGER NOT NULL DEFAULT 0,
    "upload_limit" INTEGER NOT NULL,
    "bandwidth_used" BIGINT NOT NULL DEFAULT 0,
    "bandwidth_limit" BIGINT NOT NULL,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_id" TEXT,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."outbox_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "mention_notifications" BOOLEAN NOT NULL DEFAULT true,
    "dm_notifications" BOOLEAN NOT NULL DEFAULT true,
    "group_notifications" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "device_id" VARCHAR(255) NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" "public"."DevicePlatform" NOT NULL,
    "app_version" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "notification_type" "public"."NotificationType" NOT NULL,
    "delivery_channel" "public"."NotificationChannel" NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "device_token_id" TEXT,
    "external_id" VARCHAR(255),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "subject" VARCHAR(255),
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."admin_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "role" "public"."AdminRoleType" NOT NULL,
    "permissions" TEXT[],
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."moderation_actions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "moderator_id" TEXT NOT NULL,
    "target_type" "public"."ModerationTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "action_type" "public"."ModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "duration" INTEGER,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."content_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "reporter_id" TEXT NOT NULL,
    "target_type" "public"."ModerationTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "report_type" "public"."ReportType" NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'pending',
    "priority" "public"."ReportPriority" NOT NULL DEFAULT 'medium',
    "assigned_to" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auto_moderation_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "rule_type" "public"."AutoModerationRuleType" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" "public"."RuleSeverity" NOT NULL DEFAULT 'medium',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auto_moderation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auto_moderation_violations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "rule_id" TEXT NOT NULL,
    "target_type" "public"."ModerationTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "user_id" TEXT,
    "severity" "public"."RuleSeverity" NOT NULL,
    "content" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "action_taken" JSONB,
    "review_status" "public"."ReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_moderation_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_bans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "banned_by" TEXT NOT NULL,
    "banType" "public"."BanType" NOT NULL,
    "reason" TEXT NOT NULL,
    "duration" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."data_retention_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "data_type" "public"."DataType" NOT NULL,
    "retention_period_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_delete" BOOLEAN NOT NULL DEFAULT false,
    "notify_before_deletion" BOOLEAN NOT NULL DEFAULT true,
    "notification_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."security_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_type" "public"."SecurityEventType" NOT NULL,
    "severity" "public"."SecuritySeverity" NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "user_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "details" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" TEXT,
    "tags" TEXT[],

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."anomaly_detections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "anomaly_type" "public"."AnomalyType" NOT NULL,
    "severity" "public"."AnomalySeverity" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "investigated" BOOLEAN NOT NULL DEFAULT false,
    "false_positive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "anomaly_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."geo_access_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rule_type" TEXT NOT NULL,
    "countries" TEXT[],
    "regions" TEXT[],
    "cities" TEXT[],
    "ip_ranges" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "geo_access_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."security_incidents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "public"."IncidentSeverity" NOT NULL,
    "status" "public"."IncidentStatus" NOT NULL,
    "category" "public"."IncidentCategory" NOT NULL,
    "assigned_to" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "events" TEXT[],
    "anomalies" TEXT[],
    "metadata" JSONB,

    CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."incident_actions" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "action_type" "public"."ActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_by" TEXT NOT NULL,
    "result" "public"."ActionResult" NOT NULL,
    "details" JSONB,

    CONSTRAINT "incident_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."automation_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "triggers" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."security_policies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(50) NOT NULL DEFAULT 'access_control',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "tenant_id" TEXT,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."data_subject_requests" (
    "id" TEXT NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "request_type" "public"."DataSubjectRequestType" NOT NULL,
    "status" "public"."DataSubjectRequestStatus" NOT NULL DEFAULT 'pending',
    "data" JSONB,
    "metadata" JSONB,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."data_processing_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "data_type" "public"."DataType" NOT NULL,
    "purpose" VARCHAR(255) NOT NULL,
    "legal_basis" VARCHAR(100) NOT NULL,
    "processing_date" TIMESTAMPTZ(6) NOT NULL,
    "retention_period" INTEGER NOT NULL,
    "consent_given" BOOLEAN NOT NULL,
    "consent_date" TIMESTAMPTZ(6),
    "data_subject" VARCHAR(255) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "data_processing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."consent_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "consent_type" "public"."ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "version" VARCHAR(20) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vulnerability_scans" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "tenant_id" TEXT,
    "initiated_by" VARCHAR(36),

    CONSTRAINT "vulnerability_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "public"."tenants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "public"."conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_sequence_number_idx" ON "public"."messages"("conversation_id", "sequence_number" DESC);

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "public"."messages"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sequence_number_key" ON "public"."messages"("conversation_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_client_message_id_sender_id_key" ON "public"."messages"("conversation_id", "client_message_id", "sender_id");

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "public"."attachments"("message_id");

-- CreateIndex
CREATE INDEX "attachments_uploaded_by_idx" ON "public"."attachments"("uploaded_by");

-- CreateIndex
CREATE INDEX "attachments_tenant_id_idx" ON "public"."attachments"("tenant_id");

-- CreateIndex
CREATE INDEX "attachments_file_hash_idx" ON "public"."attachments"("file_hash");

-- CreateIndex
CREATE INDEX "attachments_upload_status_idx" ON "public"."attachments"("upload_status");

-- CreateIndex
CREATE INDEX "attachments_virus_scan_status_idx" ON "public"."attachments"("virus_scan_status");

-- CreateIndex
CREATE INDEX "media_processing_attachment_id_idx" ON "public"."media_processing"("attachment_id");

-- CreateIndex
CREATE INDEX "media_processing_status_idx" ON "public"."media_processing"("status");

-- CreateIndex
CREATE INDEX "media_processing_job_type_idx" ON "public"."media_processing"("job_type");

-- CreateIndex
CREATE INDEX "media_processing_priority_idx" ON "public"."media_processing"("priority");

-- CreateIndex
CREATE INDEX "media_processing_scheduled_at_idx" ON "public"."media_processing"("scheduled_at");

-- CreateIndex
CREATE INDEX "media_processing_tenant_id_idx" ON "public"."media_processing"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_quotas_tenant_id_key" ON "public"."media_quotas"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "public"."audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "public"."outbox_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_tenant_id_key" ON "public"."notification_preferences"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_is_active_idx" ON "public"."device_tokens"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_user_id_device_id_tenant_id_key" ON "public"."device_tokens"("user_id", "device_id", "tenant_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_user_id_status_created_at_idx" ON "public"."notification_deliveries"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_tenant_id_status_created_at_idx" ON "public"."notification_deliveries"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_scheduled_at_idx" ON "public"."notification_deliveries"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_name_type_channel_key" ON "public"."notification_templates"("tenant_id", "name", "type", "channel");

-- CreateIndex
CREATE INDEX "admin_roles_user_id_is_active_idx" ON "public"."admin_roles"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "admin_roles_tenant_id_role_idx" ON "public"."admin_roles"("tenant_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_user_id_tenant_id_role_key" ON "public"."admin_roles"("user_id", "tenant_id", "role");

-- CreateIndex
CREATE INDEX "moderation_actions_target_type_target_id_idx" ON "public"."moderation_actions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "moderation_actions_moderator_id_created_at_idx" ON "public"."moderation_actions"("moderator_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_actions_tenant_id_action_type_idx" ON "public"."moderation_actions"("tenant_id", "action_type");

-- CreateIndex
CREATE INDEX "moderation_actions_expires_at_idx" ON "public"."moderation_actions"("expires_at");

-- CreateIndex
CREATE INDEX "content_reports_reporter_id_idx" ON "public"."content_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "content_reports_target_type_target_id_idx" ON "public"."content_reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "content_reports_status_priority_idx" ON "public"."content_reports"("status", "priority");

-- CreateIndex
CREATE INDEX "content_reports_tenant_id_status_idx" ON "public"."content_reports"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "content_reports_assigned_to_idx" ON "public"."content_reports"("assigned_to");

-- CreateIndex
CREATE INDEX "auto_moderation_rules_tenant_id_is_enabled_idx" ON "public"."auto_moderation_rules"("tenant_id", "is_enabled");

-- CreateIndex
CREATE INDEX "auto_moderation_rules_rule_type_idx" ON "public"."auto_moderation_rules"("rule_type");

-- CreateIndex
CREATE UNIQUE INDEX "auto_moderation_rules_tenant_id_name_key" ON "public"."auto_moderation_rules"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "auto_moderation_violations_rule_id_idx" ON "public"."auto_moderation_violations"("rule_id");

-- CreateIndex
CREATE INDEX "auto_moderation_violations_target_type_target_id_idx" ON "public"."auto_moderation_violations"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "auto_moderation_violations_user_id_created_at_idx" ON "public"."auto_moderation_violations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auto_moderation_violations_tenant_id_review_status_idx" ON "public"."auto_moderation_violations"("tenant_id", "review_status");

-- CreateIndex
CREATE INDEX "auto_moderation_violations_severity_created_at_idx" ON "public"."auto_moderation_violations"("severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_bans_user_id_is_active_idx" ON "public"."user_bans"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "user_bans_tenant_id_is_active_idx" ON "public"."user_bans"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "user_bans_expires_at_idx" ON "public"."user_bans"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_bans_user_id_tenant_id_banType_key" ON "public"."user_bans"("user_id", "tenant_id", "banType");

-- CreateIndex
CREATE INDEX "data_retention_policies_tenant_id_is_active_idx" ON "public"."data_retention_policies"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "data_retention_policies_data_type_idx" ON "public"."data_retention_policies"("data_type");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_tenant_id_name_key" ON "public"."data_retention_policies"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "security_events_tenant_id_timestamp_idx" ON "public"."security_events"("tenant_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "security_events_event_type_timestamp_idx" ON "public"."security_events"("event_type", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "security_events_severity_timestamp_idx" ON "public"."security_events"("severity", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "security_events_resolved_timestamp_idx" ON "public"."security_events"("resolved", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "security_events_user_id_timestamp_idx" ON "public"."security_events"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "anomaly_detections_tenant_id_timestamp_idx" ON "public"."anomaly_detections"("tenant_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "anomaly_detections_user_id_timestamp_idx" ON "public"."anomaly_detections"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "anomaly_detections_anomaly_type_timestamp_idx" ON "public"."anomaly_detections"("anomaly_type", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "anomaly_detections_severity_timestamp_idx" ON "public"."anomaly_detections"("severity", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "anomaly_detections_investigated_idx" ON "public"."anomaly_detections"("investigated");

-- CreateIndex
CREATE INDEX "geo_access_rules_tenant_id_is_active_idx" ON "public"."geo_access_rules"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "geo_access_rules_priority_idx" ON "public"."geo_access_rules"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "geo_access_rules_tenant_id_name_key" ON "public"."geo_access_rules"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "security_incidents_tenant_id_status_created_at_idx" ON "public"."security_incidents"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "security_incidents_severity_created_at_idx" ON "public"."security_incidents"("severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "security_incidents_assigned_to_idx" ON "public"."security_incidents"("assigned_to");

-- CreateIndex
CREATE INDEX "security_incidents_category_status_idx" ON "public"."security_incidents"("category", "status");

-- CreateIndex
CREATE INDEX "incident_actions_incident_id_executed_at_idx" ON "public"."incident_actions"("incident_id", "executed_at" DESC);

-- CreateIndex
CREATE INDEX "incident_actions_action_type_idx" ON "public"."incident_actions"("action_type");

-- CreateIndex
CREATE INDEX "incident_actions_executed_by_idx" ON "public"."incident_actions"("executed_by");

-- CreateIndex
CREATE INDEX "automation_rules_tenant_id_is_active_idx" ON "public"."automation_rules"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "automation_rules_priority_idx" ON "public"."automation_rules"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_tenant_id_name_key" ON "public"."automation_rules"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "data_subject_requests_request_id_key" ON "public"."data_subject_requests"("request_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_user_id_status_idx" ON "public"."data_subject_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenant_id_status_idx" ON "public"."data_subject_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "data_subject_requests_request_type_status_idx" ON "public"."data_subject_requests"("request_type", "status");

-- CreateIndex
CREATE INDEX "data_subject_requests_created_at_idx" ON "public"."data_subject_requests"("created_at" DESC);

-- CreateIndex
CREATE INDEX "data_processing_records_user_id_data_type_idx" ON "public"."data_processing_records"("user_id", "data_type");

-- CreateIndex
CREATE INDEX "data_processing_records_tenant_id_data_type_idx" ON "public"."data_processing_records"("tenant_id", "data_type");

-- CreateIndex
CREATE INDEX "data_processing_records_processing_date_idx" ON "public"."data_processing_records"("processing_date" DESC);

-- CreateIndex
CREATE INDEX "data_processing_records_consent_given_idx" ON "public"."data_processing_records"("consent_given");

-- CreateIndex
CREATE INDEX "consent_records_user_id_granted_idx" ON "public"."consent_records"("user_id", "granted");

-- CreateIndex
CREATE INDEX "consent_records_tenant_id_consent_type_idx" ON "public"."consent_records"("tenant_id", "consent_type");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_user_id_tenant_id_consent_type_key" ON "public"."consent_records"("user_id", "tenant_id", "consent_type");

-- AddForeignKey
ALTER TABLE "public"."tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_quotas" ADD CONSTRAINT "tenant_quotas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_usage" ADD CONSTRAINT "tenant_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_members" ADD CONSTRAINT "conversation_members_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."message_reactions" ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_state" ADD CONSTRAINT "conversation_state_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_processing" ADD CONSTRAINT "media_processing_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_token_id_fkey" FOREIGN KEY ("device_token_id") REFERENCES "public"."device_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_roles" ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_roles" ADD CONSTRAINT "admin_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_reports" ADD CONSTRAINT "content_reports_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auto_moderation_rules" ADD CONSTRAINT "auto_moderation_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auto_moderation_violations" ADD CONSTRAINT "auto_moderation_violations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."auto_moderation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auto_moderation_violations" ADD CONSTRAINT "auto_moderation_violations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auto_moderation_violations" ADD CONSTRAINT "auto_moderation_violations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_bans" ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_bans" ADD CONSTRAINT "user_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_retention_policies" ADD CONSTRAINT "data_retention_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."incident_actions" ADD CONSTRAINT "incident_actions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."security_policies" ADD CONSTRAINT "security_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_processing_records" ADD CONSTRAINT "data_processing_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_processing_records" ADD CONSTRAINT "data_processing_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consent_records" ADD CONSTRAINT "consent_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vulnerability_scans" ADD CONSTRAINT "vulnerability_scans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vulnerability_scans" ADD CONSTRAINT "vulnerability_scans_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
