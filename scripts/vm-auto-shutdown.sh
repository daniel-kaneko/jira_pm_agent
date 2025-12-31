#!/bin/bash
# VM Auto-Shutdown Script
# Deallocates the VM if no activity for IDLE_TIMEOUT seconds
# Uses Nginx access log timestamp to detect activity
# 
# Setup on VM:
# 1. Install Azure CLI: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
# 2. Login with Managed Identity: az login --identity
# 3. Copy this script to /home/azureuser/auto-shutdown.sh
# 4. Make executable: chmod +x /home/azureuser/auto-shutdown.sh
# 5. Run every 5 seconds with a loop:
#    nohup bash -c 'while true; do /home/azureuser/auto-shutdown.sh; sleep 5; done' &
#    Or add to systemd service

# ========== CONFIGURATION ==========
IDLE_TIMEOUT=10  # seconds (10 for testing, use 300 for 5 minutes in production)
NGINX_LOG="/var/log/nginx/access.log"
RESOURCE_GROUP="rg-ollama"  # Your Azure resource group
VM_NAME="ollama-vm"  # Your VM name
LOG_FILE="/var/log/auto-shutdown.log"

# ========== FUNCTIONS ==========
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ========== MAIN ==========
# Check if Nginx log exists
if [ ! -f "$NGINX_LOG" ]; then
    log "Nginx log not found: $NGINX_LOG"
    exit 1
fi

# Get last modification time of Nginx access log
LAST_ACTIVITY=$(stat -c %Y "$NGINX_LOG" 2>/dev/null || echo 0)
CURRENT_TIME=$(date +%s)
IDLE_TIME=$((CURRENT_TIME - LAST_ACTIVITY))

log "Idle time: ${IDLE_TIME}s (timeout: ${IDLE_TIMEOUT}s)"

# Check if we should deallocate
if [ "$IDLE_TIME" -ge "$IDLE_TIMEOUT" ]; then
    log "VM idle for ${IDLE_TIME}s, deallocating..."
    
    # Deallocate the VM (--no-wait so script completes before VM shuts down)
    az vm deallocate \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VM_NAME" \
        --no-wait 2>> "$LOG_FILE"
    
    if [ $? -eq 0 ]; then
        log "Deallocation command sent successfully"
    else
        log "ERROR: Failed to deallocate VM"
    fi
fi

