#!/bin/bash
# Track API activity by updating timestamp file
# Called by Nginx on each request

ACTIVITY_FILE="/tmp/last_activity"
date +%s > "$ACTIVITY_FILE"

