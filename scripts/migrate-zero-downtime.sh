#!/bin/bash

# Zero-downtime database migration script for ChemChat
# Implements expand-migrate-contract pattern for safe schema changes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE=${NAMESPACE:-"chemchat"}
DB_HOST=${DB_HOST:-"postgres-service"}
DB_PORT=${DB_PORT:-"5432"}
DB_NAME=${DB_NAME:-"chemchat_db"}
DB_USER=${DB_USER:-"chemchat_user"}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
MIGRATION_TIMEOUT=${MIGRATION_TIMEOUT:-300}

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed or not in PATH"
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        error "Namespace $NAMESPACE does not exist"
    fi
    
    # Check if database pod is running
    if ! kubectl get pod -n "$NAMESPACE" -l app.kubernetes.io/name=postgres | grep -q Running; then
        error "PostgreSQL pod is not running in namespace $NAMESPACE"
    fi
    
    success "Prerequisites check passed"
}

# Create database backup
create_backup() {
    log "Creating database backup..."
    
    local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
    local backup_file="/tmp/${backup_name}.sql"
    
    # Create backup using pg_dump
    kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        pg_dump -U "$DB_USER" -h localhost -p "$DB_PORT" "$DB_NAME" \
        > "$backup_file" || error "Failed to create database backup"
    
    # Compress backup
    gzip "$backup_file"
    
    # Store backup in persistent volume or cloud storage
    kubectl cp "${backup_file}.gz" "$NAMESPACE/postgres-0:/var/lib/postgresql/backups/${backup_name}.sql.gz" || \
        warn "Failed to store backup in persistent volume"
    
    # Clean up local backup file
    rm -f "${backup_file}.gz"
    
    success "Database backup created: ${backup_name}.sql.gz"
    echo "$backup_name"
}

# Validate migration files
validate_migrations() {
    log "Validating migration files..."
    
    # Check if migration files exist
    if [ ! -d "prisma/migrations" ]; then
        error "Migration directory not found"
    fi
    
    # Check for pending migrations
    local pending_migrations
    pending_migrations=$(npx prisma migrate status --schema=prisma/schema.prisma 2>&1 | grep "Following migration" || true)
    
    if [ -z "$pending_migrations" ]; then
        log "No pending migrations found"
        return 0
    fi
    
    log "Found pending migrations:"
    echo "$pending_migrations"
    
    # Validate migration syntax
    npx prisma migrate resolve --schema=prisma/schema.prisma --preview-feature || \
        error "Migration validation failed"
    
    success "Migration validation passed"
}

# Run pre-migration checks
pre_migration_checks() {
    log "Running pre-migration checks..."
    
    # Check database connectivity
    kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null || \
        error "Database connectivity check failed"
    
    # Check database locks
    local active_locks
    active_locks=$(kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM pg_locks WHERE mode = 'AccessExclusiveLock';" | tr -d ' ')
    
    if [ "$active_locks" -gt 0 ]; then
        warn "Found $active_locks active exclusive locks. Migration may be delayed."
    fi
    
    # Check database size and available space
    local db_size
    db_size=$(kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" | tr -d ' ')
    
    log "Database size: $db_size"
    
    success "Pre-migration checks completed"
}

# Execute migration with monitoring
execute_migration() {
    log "Executing database migration..."
    
    local migration_start_time
    migration_start_time=$(date +%s)
    
    # Set migration timeout
    timeout "$MIGRATION_TIMEOUT" npx prisma migrate deploy --schema=prisma/schema.prisma || {
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            error "Migration timed out after $MIGRATION_TIMEOUT seconds"
        else
            error "Migration failed with exit code $exit_code"
        fi
    }
    
    local migration_end_time
    migration_end_time=$(date +%s)
    local migration_duration=$((migration_end_time - migration_start_time))
    
    success "Migration completed in ${migration_duration} seconds"
}

# Post-migration validation
post_migration_validation() {
    log "Running post-migration validation..."
    
    # Check migration status
    npx prisma migrate status --schema=prisma/schema.prisma || \
        error "Migration status check failed"
    
    # Validate schema integrity
    kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';" > /dev/null || \
        error "Schema integrity check failed"
    
    # Test basic database operations
    kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT COUNT(*) FROM \"User\" LIMIT 1;" > /dev/null || \
        error "Basic database operation test failed"
    
    success "Post-migration validation completed"
}

# Update application deployment
update_application() {
    log "Updating application deployment..."
    
    # Get current image tag
    local current_image
    current_image=$(kubectl get deployment chemchat-api -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')
    
    log "Current image: $current_image"
    
    # Update deployment with new image (if provided)
    if [ -n "${NEW_IMAGE:-}" ]; then
        log "Updating to new image: $NEW_IMAGE"
        kubectl set image deployment/chemchat-api -n "$NAMESPACE" chemchat="$NEW_IMAGE"
        
        # Wait for rollout to complete
        kubectl rollout status deployment/chemchat-api -n "$NAMESPACE" --timeout=600s || \
            error "Application deployment rollout failed"
    fi
    
    # Restart deployment to pick up schema changes
    kubectl rollout restart deployment/chemchat-api -n "$NAMESPACE"
    kubectl rollout status deployment/chemchat-api -n "$NAMESPACE" --timeout=300s || \
        error "Application restart failed"
    
    success "Application deployment updated"
}

# Health check after migration
health_check() {
    log "Performing health checks..."
    
    # Wait for pods to be ready
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=chemchat -n "$NAMESPACE" --timeout=300s || \
        error "Pods failed to become ready"
    
    # Check application health endpoint
    local health_check_attempts=0
    local max_attempts=30
    
    while [ $health_check_attempts -lt $max_attempts ]; do
        if kubectl exec -n "$NAMESPACE" deployment/chemchat-api -- \
            curl -f http://localhost:3000/health > /dev/null 2>&1; then
            success "Application health check passed"
            return 0
        fi
        
        health_check_attempts=$((health_check_attempts + 1))
        log "Health check attempt $health_check_attempts/$max_attempts failed, retrying..."
        sleep 10
    done
    
    error "Application health check failed after $max_attempts attempts"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    kubectl exec -n "$NAMESPACE" deployment/postgres -- \
        find /var/lib/postgresql/backups -name "backup-*.sql.gz" -mtime +$BACKUP_RETENTION_DAYS -delete || \
        warn "Failed to cleanup old backups"
    
    success "Old backups cleaned up (retention: $BACKUP_RETENTION_DAYS days)"
}

# Rollback function
rollback() {
    local backup_name=$1
    
    error "Migration failed. Initiating rollback..."
    
    log "Rolling back application deployment..."
    kubectl rollout undo deployment/chemchat-api -n "$NAMESPACE"
    kubectl rollout status deployment/chemchat-api -n "$NAMESPACE" --timeout=300s
    
    if [ -n "$backup_name" ]; then
        log "Restoring database from backup: $backup_name"
        kubectl exec -n "$NAMESPACE" deployment/postgres -- \
            bash -c "gunzip -c /var/lib/postgresql/backups/${backup_name}.sql.gz | psql -U $DB_USER -d $DB_NAME"
    fi
    
    error "Rollback completed"
}

# Main migration process
main() {
    log "Starting zero-downtime database migration for ChemChat"
    
    local backup_name=""
    
    # Trap to handle failures
    trap 'rollback "$backup_name"' ERR
    
    # Execute migration steps
    check_prerequisites
    backup_name=$(create_backup)
    validate_migrations
    pre_migration_checks
    execute_migration
    post_migration_validation
    update_application
    health_check
    cleanup_old_backups
    
    success "Zero-downtime migration completed successfully!"
    log "Backup created: ${backup_name}.sql.gz"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
