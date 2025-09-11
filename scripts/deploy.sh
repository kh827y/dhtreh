#!/bin/bash

# Deployment Script for Loyalty Program
# Usage: ./deploy.sh [environment] [action]
# Environments: staging, production
# Actions: deploy, rollback, status, backup

set -e

# Configuration
ENVIRONMENT=${1:-staging}
ACTION=${2:-deploy}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROJECT_DIR="/opt/loyalty"
BACKUP_DIR="/opt/backups/loyalty"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check environment
check_environment() {
    case $ENVIRONMENT in
        staging|production)
            log "Environment: $ENVIRONMENT"
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
            ;;
    esac
}

# Load environment variables
load_env() {
    if [ -f ".env.$ENVIRONMENT" ]; then
        log "Loading environment variables from .env.$ENVIRONMENT"
        export $(cat .env.$ENVIRONMENT | grep -v '^#' | xargs)
    else
        error "Environment file .env.$ENVIRONMENT not found"
    fi
}

# Backup current deployment
backup() {
    log "Creating backup..."
    mkdir -p $BACKUP_DIR
    
    # Backup database
    log "Backing up database..."
    docker exec postgres pg_dump -U loyalty loyalty | gzip > "$BACKUP_DIR/db_${ENVIRONMENT}_${TIMESTAMP}.sql.gz"
    
    # Backup uploaded files if any
    if [ -d "$PROJECT_DIR/uploads" ]; then
        tar -czf "$BACKUP_DIR/uploads_${ENVIRONMENT}_${TIMESTAMP}.tar.gz" -C "$PROJECT_DIR" uploads/
    fi
    
    # Keep only last 7 backups
    ls -t $BACKUP_DIR/db_${ENVIRONMENT}_*.sql.gz | tail -n +8 | xargs -r rm
    ls -t $BACKUP_DIR/uploads_${ENVIRONMENT}_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm
    
    log "Backup completed: $BACKUP_DIR/*_${TIMESTAMP}.*"
}

# Deploy application
deploy() {
    log "Starting deployment for $ENVIRONMENT..."
    
    # Pull latest code
    log "Pulling latest code..."
    git fetch origin
    git checkout main
    git pull origin main
    
    # Build and deploy with Docker Compose
    log "Building Docker images..."
    docker compose -f docker-compose.$ENVIRONMENT.yml build
    
    # Run database migrations
    log "Running database migrations..."
    docker compose -f docker-compose.$ENVIRONMENT.yml run --rm api pnpm prisma migrate deploy
    
    # Start services with zero-downtime deployment
    log "Starting services..."
    if [ "$ENVIRONMENT" = "production" ]; then
        # Production: rolling update with multiple replicas
        docker compose -f docker-compose.$ENVIRONMENT.yml up -d --scale api=2 --scale miniapp=2 --no-recreate
        sleep 10
        docker compose -f docker-compose.$ENVIRONMENT.yml up -d --scale api=2 --scale miniapp=2 --force-recreate
    else
        # Staging: simple restart
        docker compose -f docker-compose.$ENVIRONMENT.yml up -d
    fi
    
    # Clean up old images
    log "Cleaning up old Docker images..."
    docker image prune -f
    
    log "Deployment completed successfully!"
}

# Rollback to previous version
rollback() {
    log "Starting rollback for $ENVIRONMENT..."
    
    # Get previous commit
    PREVIOUS_COMMIT=$(git rev-parse HEAD~1)
    log "Rolling back to commit: $PREVIOUS_COMMIT"
    
    # Checkout previous version
    git checkout $PREVIOUS_COMMIT
    
    # Rebuild and deploy
    docker compose -f docker-compose.$ENVIRONMENT.yml build
    docker compose -f docker-compose.$ENVIRONMENT.yml up -d
    
    warning "Rollback completed. Manual database rollback may be required!"
}

# Check deployment status
status() {
    log "Checking deployment status..."
    
    # Check Docker containers
    echo -e "\n${GREEN}Docker Containers:${NC}"
    docker compose -f docker-compose.$ENVIRONMENT.yml ps
    
    # Check service health
    echo -e "\n${GREEN}Service Health:${NC}"
    
    # API health check
    API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
    if [ "$API_HEALTH" = "200" ]; then
        echo "✅ API: Healthy"
    else
        echo "❌ API: Unhealthy (HTTP $API_HEALTH)"
    fi
    
    # Admin health check
    ADMIN_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 || echo "000")
    if [ "$ADMIN_HEALTH" = "200" ] || [ "$ADMIN_HEALTH" = "302" ]; then
        echo "✅ Admin: Healthy"
    else
        echo "❌ Admin: Unhealthy (HTTP $ADMIN_HEALTH)"
    fi
    
    # Database check
    if docker exec postgres pg_isready -U loyalty > /dev/null 2>&1; then
        echo "✅ Database: Healthy"
    else
        echo "❌ Database: Unhealthy"
    fi
    
    # Redis check
    if docker exec redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis: Healthy"
    else
        echo "❌ Redis: Unhealthy"
    fi
    
    # Check disk usage
    echo -e "\n${GREEN}Disk Usage:${NC}"
    df -h | grep -E '^/dev/' | head -5
    
    # Check memory usage
    echo -e "\n${GREEN}Memory Usage:${NC}"
    free -h
    
    # Recent logs
    echo -e "\n${GREEN}Recent API Logs:${NC}"
    docker compose -f docker-compose.$ENVIRONMENT.yml logs --tail=10 api
}

# Run tests before deployment
run_tests() {
    log "Running tests..."
    
    # Run unit tests
    docker compose -f docker-compose.test.yml run --rm api pnpm test
    
    # Run E2E tests
    docker compose -f docker-compose.test.yml run --rm api pnpm test:e2e
    
    log "All tests passed!"
}

# Send deployment notification
notify() {
    local STATUS=$1
    local MESSAGE=$2
    
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=🚀 *Deployment $STATUS*%0A%0AEnvironment: $ENVIRONMENT%0ATimestamp: $TIMESTAMP%0A$MESSAGE" \
            -d "parse_mode=Markdown" > /dev/null
    fi
}

# Main execution
main() {
    check_environment
    load_env
    
    case $ACTION in
        deploy)
            backup
            if [ "$ENVIRONMENT" = "production" ]; then
                run_tests
            fi
            deploy
            status
            notify "SUCCESS" "Deployment completed successfully!"
            ;;
        rollback)
            backup
            rollback
            status
            notify "ROLLBACK" "Rollback completed. Check services!"
            ;;
        status)
            status
            ;;
        backup)
            backup
            ;;
        test)
            run_tests
            ;;
        *)
            error "Invalid action: $ACTION. Use 'deploy', 'rollback', 'status', 'backup', or 'test'"
            ;;
    esac
}

# Run main function
main
