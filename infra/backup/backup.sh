#!/usr/bin/env bash

# Backup script for Loyalty Program Database
# Run as cron job: 0 3 * * * /opt/loyalty/infra/backup/backup.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="loyalty"
DB_USER="loyalty"
DB_HOST="${DB_HOST:-postgres}"
PGPASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"

# S3 Configuration (optional)
S3_BUCKET=${S3_BUCKET:-""}
S3_ENDPOINT=${S3_ENDPOINT:-"https://s3.amazonaws.com"}
S3_ACCESS_KEY=${S3_ACCESS_KEY:-""}
S3_SECRET_KEY=${S3_SECRET_KEY:-""}
S3_REGION=${S3_REGION:-${AWS_DEFAULT_REGION:-"us-east-1"}}

# Telegram notification (optional)
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-""}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-""}

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

send_telegram() {
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=$1" \
            -d "parse_mode=Markdown" > /dev/null 2>&1
    fi
}

if [ -z "$PGPASSWORD" ]; then
    log "ERROR: DB_PASSWORD is not set"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Start backup
log "Starting database backup..."
BACKUP_FILE="$BACKUP_DIR/loyalty_${TIMESTAMP}.sql.gz"

# Perform backup with error handling
if PGPASSWORD="$PGPASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE (Size: $SIZE)"
    
    # Verify backup integrity
    if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        log "Backup integrity verified"
    else
        log "ERROR: Backup file is corrupted!"
        send_telegram "⚠️ *Backup Error*: Corrupted backup file for loyalty database"
        exit 1
    fi
    
    # Upload to S3 if configured
    if [ -n "$S3_BUCKET" ] && [ -n "$S3_ACCESS_KEY" ] && [ -n "$S3_SECRET_KEY" ]; then
        if ! command -v aws >/dev/null 2>&1; then
            log "WARNING: aws-cli not installed, skipping S3 upload"
        else
        log "Uploading to S3 bucket: $S3_BUCKET"
        
        # Configure AWS CLI
        export AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY
        export AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY
        export AWS_DEFAULT_REGION=$S3_REGION
        export AWS_EC2_METADATA_DISABLED=true
        
        if aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/backups/" --endpoint-url=$S3_ENDPOINT; then
            log "Successfully uploaded to S3"
            
            # Verify S3 upload
            if aws s3 ls "s3://$S3_BUCKET/backups/loyalty_${TIMESTAMP}.sql.gz" --endpoint-url=$S3_ENDPOINT > /dev/null 2>&1; then
                log "S3 upload verified"
            else
                log "WARNING: Could not verify S3 upload"
            fi
        else
            log "ERROR: Failed to upload to S3"
            send_telegram "⚠️ *Backup Warning*: Failed to upload backup to S3"
        fi
        fi
    fi
    
    # Clean old local backups
    log "Cleaning old backups (keeping last $RETENTION_DAYS days)..."
    find "$BACKUP_DIR" -name "loyalty_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
    
    # Clean old S3 backups if configured
    if [ -n "$S3_BUCKET" ] && [ -n "$S3_ACCESS_KEY" ] && [ -n "$S3_SECRET_KEY" ] && command -v aws >/dev/null 2>&1; then
        log "Cleaning old S3 backups..."
        CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        
        aws s3 ls "s3://$S3_BUCKET/backups/" --endpoint-url=$S3_ENDPOINT | \
        while read -r line; do
            FILE_DATE=$(echo $line | awk '{print $1}')
            FILE_NAME=$(echo $line | awk '{print $4}')
            
            if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]] && [[ "$FILE_NAME" == loyalty_*.sql.gz ]]; then
                log "Deleting old S3 backup: $FILE_NAME"
                aws s3 rm "s3://$S3_BUCKET/backups/$FILE_NAME" --endpoint-url=$S3_ENDPOINT
            fi
        done
    fi
    
    # Send success notification
    send_telegram "✅ *Backup Success*
Database: loyalty
Size: $SIZE
Location: ${S3_BUCKET:-local}
Timestamp: $TIMESTAMP"
    
    log "Backup process completed successfully"
    exit 0
else
    log "ERROR: Backup failed!"
    send_telegram "❌ *Backup Failed*: Could not create database backup for loyalty"
    exit 1
fi
