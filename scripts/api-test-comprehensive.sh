#!/bin/bash

# Comprehensive API Testing Script for ChemChat
# Tests all API endpoints systematically

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="TestPassword123!"
ACCESS_TOKEN=""
WS_TOKEN=""
TENANT_ID="test-tenant"

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

test_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local headers=$4
    local data=$5
    local description=$6
    
    ((TOTAL_TESTS++))
    
    log_info "Testing: $description"
    
    local curl_cmd="curl -s -w '%{http_code}' -X $method"
    
    if [ ! -z "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    if [ ! -z "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi
    
    curl_cmd="$curl_cmd $BASE_URL$endpoint"
    
    local response=$(eval $curl_cmd)
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
        log_success "$method $endpoint - Status: $status_code"
        if [ ! -z "$body" ] && [ "$body" != "null" ]; then
            echo "Response: $(echo $body | jq . 2>/dev/null || echo $body)"
        fi
    else
        log_error "$method $endpoint - Expected: $expected_status, Got: $status_code"
        echo "Response: $body"
    fi
    
    echo ""
}

# Start testing
echo "=================================================="
echo "ChemChat API Comprehensive Testing"
echo "=================================================="
echo ""

# 1. Basic Health Check (Public endpoints)
log_info "=== 1. BASIC HEALTH CHECKS ==="

test_endpoint "GET" "/" "200" "" "" "Root endpoint health check"

test_endpoint "GET" "/health" "401" "" "" "Health endpoint (should require auth)"

# 2. Authentication APIs
log_info "=== 2. AUTHENTICATION APIs ==="

# Test login with invalid credentials
test_endpoint "POST" "/auth/login" "401" "-H 'Content-Type: application/json'" \
    '{"email":"invalid@test.com","password":"wrong","deviceFingerprint":{"browser":"test","os":"test"}}' \
    "Login with invalid credentials"

# Test login with valid credentials (if user exists)
test_endpoint "POST" "/auth/login" "200" "-H 'Content-Type: application/json'" \
    "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"deviceFingerprint\":{\"browser\":\"test\",\"os\":\"test\"}}" \
    "Login with test credentials"

# Extract token from successful login (if any)
login_response=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"deviceFingerprint\":{\"browser\":\"test\",\"os\":\"test\"}}" \
    $BASE_URL/auth/login 2>/dev/null || echo '{}')

ACCESS_TOKEN=$(echo $login_response | jq -r '.accessToken // empty' 2>/dev/null || echo "")

if [ ! -z "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
    log_success "Successfully extracted access token"
    
    # Test authenticated endpoints
    AUTH_HEADER="-H 'Authorization: Bearer $ACCESS_TOKEN'"
    
    test_endpoint "GET" "/auth/me" "200" "$AUTH_HEADER" "" "Get user profile"
    
    test_endpoint "POST" "/auth/websocket-token" "200" "$AUTH_HEADER -H 'Content-Type: application/json'" "" "Get WebSocket token"
    
    test_endpoint "POST" "/auth/mfa/setup" "200" "$AUTH_HEADER" "" "MFA setup"
    
    test_endpoint "GET" "/auth/security/events" "200" "$AUTH_HEADER" "" "Get security events"
    
else
    log_warning "No access token available - skipping authenticated tests"
    AUTH_HEADER=""
fi

# 3. Health and Observability APIs
log_info "=== 3. HEALTH & OBSERVABILITY APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "GET" "/health" "200" "$AUTH_HEADER" "" "Health check (authenticated)"
    
    test_endpoint "GET" "/observability/health/detailed" "200" "$AUTH_HEADER" "" "Detailed health check"
    
    test_endpoint "GET" "/observability/info" "200" "$AUTH_HEADER" "" "Application info"
    
    test_endpoint "GET" "/observability/trace/correlation" "200" "$AUTH_HEADER" "" "Generate correlation ID"
fi

# 4. Tenant Management APIs
log_info "=== 4. TENANT MANAGEMENT APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "GET" "/tenant/current" "200" "$AUTH_HEADER" "" "Get current tenant"
    
    test_endpoint "GET" "/tenant/quota/info" "200" "$AUTH_HEADER" "" "Get tenant quota info"
    
    test_endpoint "GET" "/tenant/usage/summary" "200" "$AUTH_HEADER" "" "Get usage summary"
    
    test_endpoint "GET" "/tenant/settings" "200" "$AUTH_HEADER" "" "Get tenant settings"
fi

# 5. Search APIs
log_info "=== 5. SEARCH APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "GET" "/search/messages?q=test" "200" "$AUTH_HEADER" "" "Search messages"
    
    test_endpoint "GET" "/search/suggestions?q=test" "200" "$AUTH_HEADER" "" "Get search suggestions"
    
    test_endpoint "GET" "/search/health" "200" "$AUTH_HEADER" "" "Search service health"
fi

# 6. Notification APIs
log_info "=== 6. NOTIFICATION APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "GET" "/notification/preferences" "200" "$AUTH_HEADER" "" "Get notification preferences"
    
    test_endpoint "GET" "/notification/devices" "200" "$AUTH_HEADER" "" "Get registered devices"
    
    test_endpoint "GET" "/notification/templates" "200" "$AUTH_HEADER" "" "Get notification templates"
    
    test_endpoint "GET" "/notification/delivery/history" "200" "$AUTH_HEADER" "" "Get delivery history"
fi

# 7. Media APIs
log_info "=== 7. MEDIA APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "POST" "/media/upload/url" "200" "$AUTH_HEADER -H 'Content-Type: application/json'" \
        '{"fileName":"test.jpg","fileSize":1024,"mimeType":"image/jpeg","conversationId":"test-conv"}' \
        "Generate upload URL"
    
    test_endpoint "GET" "/media" "200" "$AUTH_HEADER" "" "List media files"
    
    test_endpoint "GET" "/media/quota/info" "200" "$AUTH_HEADER" "" "Get media quota info"
    
    test_endpoint "GET" "/media/stats/summary" "200" "$AUTH_HEADER" "" "Get media statistics"
fi

# 8. Synchronization APIs
log_info "=== 8. SYNCHRONIZATION APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "POST" "/sync/delta" "200" "$AUTH_HEADER -H 'Content-Type: application/json'" \
        '{"lastSequenceNumber":0,"deviceId":"test-device"}' \
        "Delta synchronization"
    
    test_endpoint "GET" "/sync/state/test-device" "200" "$AUTH_HEADER" "" "Get client state"
    
    test_endpoint "GET" "/sync/conflicts" "200" "$AUTH_HEADER" "" "Get conflicts"
    
    test_endpoint "GET" "/sync/queue/test-device/status" "200" "$AUTH_HEADER" "" "Get queue status"
fi

# 9. Security and Compliance APIs
log_info "=== 9. SECURITY & COMPLIANCE APIs ==="

if [ ! -z "$AUTH_HEADER" ]; then
    test_endpoint "GET" "/security/events" "200" "$AUTH_HEADER" "" "Get security events"
    
    test_endpoint "GET" "/security/sessions" "200" "$AUTH_HEADER" "" "Get active sessions"
    
    test_endpoint "GET" "/compliance/audit-logs" "200" "$AUTH_HEADER" "" "Get audit logs"
    
    test_endpoint "POST" "/data-protection/export" "200" "$AUTH_HEADER -H 'Content-Type: application/json'" \
        '{"dataTypes":["messages","profile"]}' \
        "Request data export"
fi

# 10. Metrics endpoint (usually public)
log_info "=== 10. METRICS ENDPOINT ==="

test_endpoint "GET" "/metrics" "200" "" "" "Prometheus metrics endpoint"

# Summary
echo "=================================================="
echo "TEST SUMMARY"
echo "=================================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    log_success "All tests passed!"
    exit 0
else
    log_error "$FAILED_TESTS tests failed"
    exit 1
fi
