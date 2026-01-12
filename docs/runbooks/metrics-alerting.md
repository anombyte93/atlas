# Atlas Metrics Alerting Runbook

**Last Updated**: 2026-01-12
**Version**: 1.0
**Owner**: Atlas Platform Team

---

## Overview

This runbook provides procedures for responding to Atlas metrics alerts. The system categorizes errors into three severity levels:

| Severity | Description | Alert Threshold | Response Time |
|----------|-------------|-----------------|---------------|
| **CRITICAL** | Systemd failures, emergency resolver, service deaths | >1000 | Immediate |
| **WARNING** | Docker port conflicts, service restarts, transient issues | Logged | Hourly digest |
| **INFO** | X11 errors, NAT-PMP failures, dev environment noise | Logged only | None |

---

## Alert Severity Reference

### 🔴 CRITICAL Alerts

**Trigger**: CRITICAL error count > threshold (default: 1000)

**Common Causes**:
- Systemd service failures (MCP daemons, dashboard services)
- Emergency fork resolver activation (resource crisis)
- Core AI service failures (Perplexity proxy, Codex CLI)
- Database or authentication failures

**Response Procedure**:
1. **Immediate** (within 5 minutes):
   ```bash
   # Check current error breakdown
   /home/anombyte/Atlas/Atlas_MCP/scripts/atlas-metrics.sh --show

   # View recent critical errors
   journalctl --since "15 minutes ago" -p err..crit --no-pager | tail -50
   ```

2. **Identify the failing service**:
   ```bash
   # Check all Atlas services
   systemctl --user list-units | grep atlas

   # Check for failed services
   systemctl --user list-units --state=failed
   ```

3. **Common Fixes**:
   - **MCP daemon failure**: Restart with `systemctl --user restart mcp-daemons.service`
   - **Perplexity proxy down**: Check port 8765, restart service
   - **Emergency resolver activated**: Check for resource exhaustion (`htop`, `docker ps -a`)
   - **Systemd failure**: Check logs with `journalctl -u <service-name> -n 50`

4. **Escalation**: If unresolvable in 15 minutes, check Atlas documentation or create issue.

---

### ⚠️ WARNING Alerts

**Trigger**: Warning-level errors detected (hourly digest only)

**Common Causes**:
- Docker port allocation conflicts
- Service restart loops
- Transient network issues

**Response Procedure**:
1. Review the hourly digest for patterns
2. If frequent (same error >10 times/hour):
   ```bash
   # Count occurrences by pattern
   journalctl --since "1 hour ago" -p warning --no-pager | grep "port.*allocated" | wc -l
   ```
3. **Port conflicts**: Check `docker ps` and adjust service ports
4. **Service restarts**: Investigate why service is failing (check logs)

**Note**: Warning alerts are for monitoring - no immediate action required unless patterns persist.

---

### ℹ️ INFO Alerts

**Trigger**: Info-level errors detected (logged only)

**Common Causes**:
- X11 display connection errors (GUI apps in headless environment)
- NAT-PMP connection failures (network configuration)
- Development environment noise

**Response Procedure**: None expected. These are logged for audit purposes but don't indicate system problems.

---

## Error Type Quick Reference

| Error Pattern | Severity | Action |
|---------------|----------|--------|
| `Bind for 0.0.0.0:8766 failed` | WARNING | Port conflict - check `docker ps` |
| `DisplayConnectionError` | INFO | X11 auth - ignore if no GUI needed |
| `EMERGENCY CLEANUP INITIATED` | CRITICAL | Resource crisis - check `htop`, kill stuck processes |
| `Failed to start.*service` | CRITICAL | Service down - restart with systemctl |
| `connection refused` | INFO | Network issue - check if service should be running |
| `upstream_registry.json not found` | CRITICAL | Run path validation: `/home/anombyte/Atlas/scripts/validate-paths.sh` |

---

## Threshold Tuning Guide

**Default Threshold**: 1000 critical errors/hour

**When to Adjust**:

| Scenario | New Threshold | Rationale |
|----------|---------------|-----------|
| Production environment | 100-500 | Lower tolerance for errors |
| Development environment | 1000-5000 | Higher noise tolerance |
| Testing/debugging | 10000+ | Focus on specific issues |

**How to Adjust**:
```bash
# Temporary (single run)
ERROR_THRESHOLD=500 /home/anombyte/Atlas/Atlas_MCP/scripts/atlas-metrics.sh

# Permanent (set in script)
# Edit ERROR_THRESHOLD in /home/anombyte/Atlas/Atlas_MCP/scripts/atlas-metrics.sh
```

---

## Maintenance Procedures

### Daily (Automated)
- Metrics collected every 5 minutes via cron
- Hourly digest sent if threshold exceeded
- Log watcher monitors `/var/log/atlas/app.log`

### Weekly (Manual)
```bash
# Run path validation
/home/anombyte/Atlas/scripts/validate-paths.sh

# Review error trends
journalctl --since "7 days ago" -p err..crit --no-pager | grep -c "error"

# Check service health
systemctl --user list-units | grep -E "(atlas|mcp)" | awk '{print $1, $4}'
```

### Monthly (Manual)
- Review and update stale path patterns
- Adjust thresholds based on error trends
- Check for obsolete services that can be disabled

---

## Troubleshooting Commands

### Quick Health Check
```bash
# One-line system health summary
/home/anombyte/Atlas/Atlas_MCP/scripts/atlas-metrics.sh --show | grep -E "critical|warning|info|proxy|watcher"
```

### Find Top Error Sources
```bash
# Count errors by systemd unit
journalctl --since "1 hour ago" -p err..crit --no-pager | \
  awk '{print $5}' | sort | uniq -c | sort -rn | head -10
```

### Monitor in Real-Time
```bash
# Watch for new critical errors
journalctl -f -p err..crit
```

### Check for Port Conflicts
```bash
# Find all Docker port conflicts in last hour
journalctl --since "1 hour ago" --no-pager | grep "port.*allocated" | \
  grep -oE "port [0-9]+" | sort | uniq -c
```

---

## Integration Points

### Metrics Files
- **Prometheus metrics**: `/tmp/atlas-metrics.prom`
- **Alert logs**: `~/.local/state/atlas/atlas-discord.log`
- **Application logs**: `/var/log/atlas/app.log`

### Related Scripts
- **Path validation**: `/home/anombyte/Atlas/scripts/validate-paths.sh`
- **Log watcher**: `/home/anombyte/Atlas/Atlas_MCP/scripts/atlas-log-watcher.sh`
- **Metrics collector**: `/home/anombyte/Atlas/Atlas_MCP/scripts/atlas-metrics.sh`

### Systemd Services
- **Log watcher**: `atlas-log-watcher.service`
- **MCP daemons**: `mcp-daemons.service`
- **MCP router**: `mcp-router.service`

---

## Escalation Paths

1. **First Responder**: Follow procedures in this runbook
2. **Atlas Documentation**: Check `/home/anombyte/Atlas/docs/`
3. **Create Issue**: Document persistent problems for future fixes
4. **Team Escalation**: Contact Atlas platform team for critical outages

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-12 | 1.0 | Initial runbook for severity-based alerting |
