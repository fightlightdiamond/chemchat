export interface SecurityConfig {
  encryption: EncryptionConfig;
  rateLimit: RateLimitConfig;
  cors: CorsConfig;
  headers: SecurityHeadersConfig;
  compliance: ComplianceConfig;
  audit: AuditConfig;
}

export interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  saltRounds: number;
  dataAtRest: boolean;
  dataInTransit: boolean;
  fieldLevelEncryption: string[];
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  keyGenerator: (req: any) => string;
  ddosProtection: DdosProtectionConfig;
}

export interface DdosProtectionConfig {
  enabled: boolean;
  threshold: number;
  windowMs: number;
  blockDurationMs: number;
  whitelistIps: string[];
  adaptiveThrottling: boolean;
}

export interface CorsConfig {
  origin: string[] | boolean;
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface SecurityHeadersConfig {
  contentSecurityPolicy: string;
  strictTransportSecurity: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
  referrerPolicy: string;
  permissionsPolicy: string;
}

export interface ComplianceConfig {
  gdpr: GdprConfig;
  soc2: Soc2Config;
  hipaa: HipaaConfig;
  dataRetention: DataRetentionConfig;
}

export interface GdprConfig {
  enabled: boolean;
  consentRequired: boolean;
  rightToErasure: boolean;
  dataPortability: boolean;
  privacyByDesign: boolean;
  dataProcessingPurposes: string[];
}

export interface Soc2Config {
  enabled: boolean;
  securityPrinciples: string[];
  availabilityPrinciples: string[];
  processingIntegrityPrinciples: string[];
  confidentialityPrinciples: string[];
  privacyPrinciples: string[];
}

export interface HipaaConfig {
  enabled: boolean;
  encryptionRequired: boolean;
  accessLogging: boolean;
  auditTrail: boolean;
  minimumNecessary: boolean;
}

export interface DataRetentionConfig {
  defaultRetentionDays: number;
  messageRetentionDays: number;
  auditLogRetentionDays: number;
  userDataRetentionDays: number;
  automaticDeletion: boolean;
}

export interface AuditConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  includeRequestBody: boolean;
  includeResponseBody: boolean;
  sensitiveFields: string[];
  retentionDays: number;
}

export interface SecurityViolation {
  id: string;
  type: SecurityViolationType;
  severity: SecuritySeverity;
  description: string;
  source: string;
  timestamp: Date;
  metadata: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export enum SecurityViolationType {
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  MALICIOUS_INPUT = 'malicious_input',
  DDOS_ATTACK = 'ddos_attack',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  COMPLIANCE_VIOLATION = 'compliance_violation',
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface VulnerabilityReport {
  id: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  cveId?: string;
  affectedComponents: string[];
  discoveredAt: Date;
  status: VulnerabilityStatus;
  remediation: string;
  estimatedFixTime: number;
}

export enum VulnerabilityStatus {
  DISCOVERED = 'discovered',
  ANALYZING = 'analyzing',
  CONFIRMED = 'confirmed',
  FIXING = 'fixing',
  FIXED = 'fixed',
  WONT_FIX = 'wont_fix',
}

export interface ComplianceReport {
  id: string;
  framework: ComplianceFramework;
  status: ComplianceStatus;
  score: number;
  findings: ComplianceFinding[];
  generatedAt: Date;
  validUntil: Date;
}

export enum ComplianceFramework {
  GDPR = 'gdpr',
  SOC2 = 'soc2',
  HIPAA = 'hipaa',
  ISO27001 = 'iso27001',
  PCI_DSS = 'pci_dss',
}

export enum ComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  PARTIALLY_COMPLIANT = 'partially_compliant',
  UNDER_REVIEW = 'under_review',
}

export interface ComplianceFinding {
  id: string;
  requirement: string;
  status: ComplianceStatus;
  description: string;
  evidence: string[];
  remediation: string;
  priority: SecuritySeverity;
}

export interface DataProcessingRecord {
  id: string;
  userId: string;
  tenantId: string;
  dataType: string;
  purpose: string;
  legalBasis: string;
  processingDate: Date;
  retentionPeriod: number;
  consentGiven: boolean;
  consentDate?: Date;
  dataSubject: string;
}

export interface SecurityMetrics {
  timestamp: Date;
  activeUsers: number;
  failedLogins: number;
  successfulLogins: number;
  rateLimitViolations: number;
  securityViolations: number;
  vulnerabilities: number;
  complianceScore: number;
  encryptedDataPercentage: number;
  auditLogCount: number;
}

export interface EncryptedField {
  field: string;
  algorithm: string;
  keyId: string;
  iv: string;
  encryptedValue: string;
  createdAt: Date;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  type: SecurityPolicyType;
  rules: SecurityRule[];
  enabled: boolean;
  isEnabled?: boolean; // Alias for enabled for backward compatibility
  priority?: number;
  conditions?: Record<string, any>;
  actions?: string[];
  tenantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum SecurityPolicyType {
  PASSWORD_POLICY = 'password_policy',
  ACCESS_CONTROL = 'access_control',
  DATA_CLASSIFICATION = 'data_classification',
  ENCRYPTION_POLICY = 'encryption_policy',
  AUDIT_POLICY = 'audit_policy',
}

export interface SecurityRule {
  id: string;
  condition: string;
  action: SecurityAction;
  parameters: Record<string, any>;
  enabled: boolean;
}

export enum SecurityAction {
  ALLOW = 'allow',
  DENY = 'deny',
  LOG = 'log',
  FINAL = 'final',
  ALERT = 'alert',
  BLOCK = 'block',
  QUARANTINE = 'quarantine',
}
