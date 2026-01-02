#!/bin/bash
# VM Auto-Shutdown Script
# Deallocates the VM if no API activity for IDLE_TIMEOUT seconds
#
# HOW IT WORKS:
# - Nginx calls track-activity.sh on each request (updates /tmp/last_activity)
# - This script checks the activity file every 5 seconds
# - If idle for IDLE_TIMEOUT, it deallocates the VM
#
# SETUP ON VM:
# 1. SSH into VM: ssh azureuser@<VM_IP>
# 2. Install Azure CLI:
#    curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
# 3. Login with Managed Identity:
#    az login --identity
# 4. Create the scripts:
#    sudo nano /home/azureuser/auto-shutdown.sh   (paste this file)
#    sudo nano /home/azureuser/track-activity.sh  (paste track-activity.sh)
#    chmod +x /home/azureuser/*.sh
# 5. Configure Nginx to track activity (add to location block):
#    post_action @track_activity;
#    location @track_activity { internal; content_by_lua_block { os.execute("/home/azureuser/track-activity.sh") } }
#    OR simpler: just use access_log with a custom format that triggers the script
# 6. Create systemd service:
#    sudo nano /etc/systemd/system/auto-shutdown.service (see below)
#    sudo systemctl enable auto-shutdown
#    sudo systemctl start auto-shutdown
# 7. Initialize activity file:
#    /home/azureuser/track-activity.sh

# ========== CONFIGURATION ==========
IDLE_TIMEOUT=10              # seconds (10 for testing, 300 for 5 min, 900 for 15 min)
ACTIVITY_FILE="/tmp/last_activity"
NGINX_LOG="/var/log/nginx/access.log"
RESOURCE_GROUP="ollama-rg"   # Your Azure resource group
VM_NAME="ollama-vm"          # Your VM name
LOG_FILE="/var/log/auto-shutdown.log"
CHECK_INTERVAL=5             # How often to check (seconds)

# ========== FUNCTIONS ==========
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_last_activity() {
    local activity_time=0
    local nginx_time=0
    
    # Check activity file (if track-activity.sh is being used)
    if [ -f "$ACTIVITY_FILE" ]; then
        activity_time=$(cat "$ACTIVITY_FILE" 2>/dev/null || echo 0)
    fi
    
    # Check nginx log for legitimate requests only
    # Filter: authenticated requests (user "ollama") with success status (200, 201, etc.)
    if [ -f "$NGINX_LOG" ]; then
        # Get last legitimate request (authenticated + success)
        local last_legitimate=$(grep -E 'ollama.*" (200|201|202|204)' "$NGINX_LOG" 2>/dev/null | tail -1)
        if [ -n "$last_legitimate" ]; then
            # Extract timestamp: [02/Jan/2026:04:23:06 +0000]
            local log_timestamp=$(echo "$last_legitimate" | grep -oP '\[\K[^\]]+')
            if [ -n "$log_timestamp" ]; then
                # Convert nginx format to epoch: 02/Jan/2026:04:23:06 +0000 -> epoch
                # Use date command with proper format
                local date_str=$(echo "$log_timestamp" | sed 's|\([0-9][0-9]\)/\([A-Za-z][A-Za-z][A-Za-z]\)/\([0-9][0-9][0-9][0-9]\):\([0-9][0-9]\):\([0-9][0-9]\):\([0-9][0-9]\)|\3-\2-\1 \4:\5:\6|')
                # Convert month name to number
                date_str=$(echo "$date_str" | sed -e 's/Jan/01/' -e 's/Feb/02/' -e 's/Mar/03/' -e 's/Apr/04/' \
                    -e 's/May/05/' -e 's/Jun/06/' -e 's/Jul/07/' -e 's/Aug/08/' \
                    -e 's/Sep/09/' -e 's/Oct/10/' -e 's/Nov/11/' -e 's/Dec/12/')
                nginx_time=$(date -d "$date_str" "+%s" 2>/dev/null || echo 0)
            fi
        fi
    fi
    
    # Return the most recent activity
    if [ "$activity_time" -gt "$nginx_time" ]; then
        echo "$activity_time"
    else
        echo "$nginx_time"
    fi
}

# ========== MAIN ==========
log "Auto-shutdown started (timeout: ${IDLE_TIMEOUT}s)"
log "Monitoring: $ACTIVITY_FILE and $NGINX_LOG"

# Track when script started (VM boot time or script start time)
SCRIPT_START_TIME=$(date +%s)
VM_BOOT_TIME=$(uptime -s 2>/dev/null | xargs -I {} date -d "{}" +%s 2>/dev/null || echo "$SCRIPT_START_TIME")
# Use the more recent of the two (in case VM was already running)
START_TIME=$((VM_BOOT_TIME > SCRIPT_START_TIME ? VM_BOOT_TIME : SCRIPT_START_TIME))
log "Tracking activity since: $(date -d "@$START_TIME" '+%Y-%m-%d %H:%M:%S')"

# Initialize activity file with current time if it doesn't exist or is too old
if [ ! -f "$ACTIVITY_FILE" ] || [ "$(cat "$ACTIVITY_FILE" 2>/dev/null || echo 0)" -lt "$START_TIME" ]; then
    echo "$START_TIME" > "$ACTIVITY_FILE"
    log "Initialized activity file"
fi

# Main loop
while true; do
    LAST_ACTIVITY=$(get_last_activity)
    CURRENT_TIME=$(date +%s)
    
    # Only count activity after VM/script start - ignore old log entries
    if [ "$LAST_ACTIVITY" -lt "$START_TIME" ]; then
        LAST_ACTIVITY=$START_TIME
    fi
    
    IDLE_TIME=$((CURRENT_TIME - LAST_ACTIVITY))

    # Only log every 30 seconds to avoid spam (unless close to timeout)
    if [ $((IDLE_TIME % 30)) -lt $CHECK_INTERVAL ] || [ "$IDLE_TIME" -ge $((IDLE_TIMEOUT - 10)) ]; then
        log "Idle: ${IDLE_TIME}s / ${IDLE_TIMEOUT}s"
    fi

    if [ "$IDLE_TIME" -ge "$IDLE_TIMEOUT" ]; then
        log "🛑 VM idle for ${IDLE_TIME}s - DEALLOCATING..."
        
        # Login with managed identity
        az login --identity --output none 2>> "$LOG_FILE"
        
        az vm deallocate \
            --resource-group "$RESOURCE_GROUP" \
            --name "$VM_NAME" \
            --no-wait 2>> "$LOG_FILE"
        
        if [ $? -eq 0 ]; then
            log "✅ Deallocation command sent"
        else
            log "❌ Failed to deallocate"
        fi
        
        # Exit after deallocation (VM is shutting down anyway)
        exit 0
    fi

    sleep $CHECK_INTERVAL
done

