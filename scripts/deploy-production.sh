#!/bin/bash

# Production deployment script for ChemChat
# Implements zero-downtime deployment with service mesh and monitoring

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE=${NAMESPACE:-"chemchat"}
STAGING_NAMESPACE=${STAGING_NAMESPACE:-"chemchat-staging"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
REGISTRY=${REGISTRY:-"ghcr.io"}
IMAGE_NAME=${IMAGE_NAME:-"chemchat"}
DEPLOYMENT_TIMEOUT=${DEPLOYMENT_TIMEOUT:-600}
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-300}

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
    log "Checking deployment prerequisites..."
    
    # Check required tools
    for tool in kubectl helm istioctl; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is not installed or not in PATH"
        fi
    done
    
    # Check Kubernetes connectivity
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster"
    fi
    
    # Check if Istio is installed
    if ! kubectl get namespace istio-system &> /dev/null; then
        warn "Istio system namespace not found. Service mesh features may not work."
    fi
    
    success "Prerequisites check passed"
}

# Deploy infrastructure components
deploy_infrastructure() {
    log "Deploying infrastructure components..."
    
    # Create namespaces
    kubectl apply -f k8s/namespace.yaml
    
    # Deploy secrets and config
    kubectl apply -f k8s/secrets.yaml
    kubectl apply -f k8s/configmap.yaml
    
    # Deploy databases and services
    kubectl apply -f k8s/postgres.yaml
    kubectl apply -f k8s/redis.yaml
    kubectl apply -f k8s/elasticsearch.yaml
    kubectl apply -f k8s/kafka.yaml
    
    # Wait for infrastructure to be ready
    log "Waiting for infrastructure components to be ready..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgres -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=redis -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=elasticsearch -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=kafka -n "$NAMESPACE" --timeout=300s
    
    success "Infrastructure components deployed successfully"
}

# Deploy service mesh configuration
deploy_service_mesh() {
    log "Deploying service mesh configuration..."
    
    # Check if Istio is available
    if kubectl get namespace istio-system &> /dev/null; then
        # Enable Istio injection for namespace
        kubectl label namespace "$NAMESPACE" istio-injection=enabled --overwrite
        
        # Deploy service mesh configuration
        kubectl apply -f k8s/service-mesh.yaml
        
        # Wait for gateway to be ready
        kubectl wait --for=condition=ready gateway chemchat-gateway -n "$NAMESPACE" --timeout=60s || \
            warn "Service mesh gateway not ready"
        
        success "Service mesh configuration deployed"
    else
        warn "Istio not available, skipping service mesh deployment"
    fi
}

# Run database migration
run_migration() {
    log "Running zero-downtime database migration..."
    
    # Update migration job with current image
    sed -i.bak "s|image: chemchat:latest|image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG|g" k8s/migration-job.yaml
    
    # Deploy migration job
    kubectl apply -f k8s/migration-job.yaml
    
    # Wait for migration to complete
    kubectl wait --for=condition=complete job/chemchat-migration -n "$NAMESPACE" --timeout=600s || {
        log "Migration job failed, checking logs..."
        kubectl logs job/chemchat-migration -n "$NAMESPACE"
        error "Database migration failed"
    }
    
    # Clean up migration job
    kubectl delete job chemchat-migration -n "$NAMESPACE" --ignore-not-found=true
    
    # Restore original migration job file
    mv k8s/migration-job.yaml.bak k8s/migration-job.yaml
    
    success "Database migration completed successfully"
}

# Deploy application with canary strategy
deploy_application() {
    log "Deploying application with canary strategy..."
    
    # Update deployment with new image
    sed -i.bak "s|image: chemchat:latest|image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG|g" k8s/chemchat-deployment.yaml
    
    # Get current replica count
    local current_replicas
    current_replicas=$(kubectl get deployment chemchat-api -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "3")
    
    # Scale down to 1 replica for canary
    kubectl patch deployment chemchat-api -n "$NAMESPACE" -p '{"spec":{"replicas":1}}' || true
    
    # Deploy new version
    kubectl apply -f k8s/chemchat-deployment.yaml
    
    # Wait for canary pod to be ready
    kubectl rollout status deployment/chemchat-api -n "$NAMESPACE" --timeout="$DEPLOYMENT_TIMEOUT"
    
    # Health check canary
    log "Performing canary health checks..."
    local health_check_attempts=0
    local max_attempts=10
    
    while [ $health_check_attempts -lt $max_attempts ]; do
        if kubectl exec -n "$NAMESPACE" deployment/chemchat-api -- \
            curl -f http://localhost:3000/health > /dev/null 2>&1; then
            success "Canary health check passed"
            break
        fi
        
        health_check_attempts=$((health_check_attempts + 1))
        log "Canary health check attempt $health_check_attempts/$max_attempts failed, retrying..."
        sleep 10
    done
    
    if [ $health_check_attempts -eq $max_attempts ]; then
        error "Canary health check failed, rolling back"
        kubectl rollout undo deployment/chemchat-api -n "$NAMESPACE"
        exit 1
    fi
    
    # Scale up to full replicas
    log "Scaling up to $current_replicas replicas..."
    kubectl patch deployment chemchat-api -n "$NAMESPACE" -p "{\"spec\":{\"replicas\":$current_replicas}}"
    kubectl rollout status deployment/chemchat-api -n "$NAMESPACE" --timeout="$DEPLOYMENT_TIMEOUT"
    
    # Restore original deployment file
    mv k8s/chemchat-deployment.yaml.bak k8s/chemchat-deployment.yaml
    
    success "Application deployed successfully"
}

# Deploy monitoring and autoscaling
deploy_monitoring() {
    log "Deploying monitoring and autoscaling configuration..."
    
    # Deploy HPA with custom metrics
    kubectl apply -f k8s/hpa.yaml
    
    # Deploy monitoring configuration
    kubectl apply -f k8s/monitoring/
    
    # Wait for HPA to be ready
    kubectl wait --for=condition=ready hpa chemchat-hpa -n "$NAMESPACE" --timeout=60s || \
        warn "HPA not ready"
    
    success "Monitoring and autoscaling deployed"
}

# Deploy ingress and networking
deploy_networking() {
    log "Deploying ingress and networking configuration..."
    
    # Deploy ingress
    kubectl apply -f k8s/ingress.yaml
    
    # Wait for ingress to get an IP
    local ingress_attempts=0
    local max_ingress_attempts=30
    
    while [ $ingress_attempts -lt $max_ingress_attempts ]; do
        local ingress_ip
        ingress_ip=$(kubectl get ingress chemchat-ingress -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        
        if [ -n "$ingress_ip" ]; then
            log "Ingress IP: $ingress_ip"
            break
        fi
        
        ingress_attempts=$((ingress_attempts + 1))
        log "Waiting for ingress IP... ($ingress_attempts/$max_ingress_attempts)"
        sleep 10
    done
    
    success "Networking configuration deployed"
}

# Run comprehensive health checks
run_health_checks() {
    log "Running comprehensive health checks..."
    
    # Wait for all pods to be ready
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=chemchat -n "$NAMESPACE" --timeout="$HEALTH_CHECK_TIMEOUT"
    
    # Test API endpoints
    local api_url="https://api.chemchat.com"
    local ws_url="https://ws.chemchat.com"
    
    # Health endpoint
    if curl -f "$api_url/health" > /dev/null 2>&1; then
        success "API health check passed"
    else
        error "API health check failed"
    fi
    
    # API documentation
    if curl -f "$api_url/api/docs" > /dev/null 2>&1; then
        success "API documentation accessible"
    else
        warn "API documentation not accessible"
    fi
    
    # WebSocket connection test
    log "Testing WebSocket connection..."
    node -e "
        const io = require('socket.io-client');
        const socket = io('$ws_url');
        socket.on('connect', () => {
            console.log('WebSocket connection successful');
            socket.disconnect();
            process.exit(0);
        });
        socket.on('connect_error', (err) => {
            console.error('WebSocket connection failed:', err);
            process.exit(1);
        });
        setTimeout(() => {
            console.error('WebSocket connection timeout');
            process.exit(1);
        }, 10000);
    " || warn "WebSocket connection test failed"
    
    success "Health checks completed"
}

# Update deployment annotations
update_deployment_metadata() {
    log "Updating deployment metadata..."
    
    local deployment_time
    deployment_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    kubectl annotate deployment chemchat-api -n "$NAMESPACE" \
        deployment.kubernetes.io/revision-history-limit=10 \
        deployment.kubernetes.io/last-deployed="$deployment_time" \
        deployment.kubernetes.io/image-tag="$IMAGE_TAG" \
        --overwrite
    
    success "Deployment metadata updated"
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    rm -f k8s/*.bak
}

# Main deployment process
main() {
    log "Starting production deployment for ChemChat"
    log "Image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    log "Namespace: $NAMESPACE"
    
    # Trap to handle cleanup
    trap cleanup EXIT
    
    # Execute deployment steps
    check_prerequisites
    deploy_infrastructure
    deploy_service_mesh
    run_migration
    deploy_application
    deploy_monitoring
    deploy_networking
    run_health_checks
    update_deployment_metadata
    
    success "Production deployment completed successfully!"
    log "Application is available at:"
    log "  - API: https://api.chemchat.com"
    log "  - WebSocket: https://ws.chemchat.com"
    log "  - Documentation: https://api.chemchat.com/api/docs"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
