# Hardening & Recovery (v1)

## Key Management
- Generate device keys per node
- Store in OS keychain or encrypted file
- Rotate quarterly; revoke on device loss

## Secure Registration Checklist
- Control plane behind firewall
- Require mTLS or token auth
- Verify device ID is unique

## Recovery Runbook
- Reinstall agent
- Re-issue device ID if compromised
- Re-register with control plane

## Security Hardening Steps
- Least privilege service accounts
- Audit logs enabled
- Lock down config writes

## Troubleshooting
- Check control plane `/health`
- Verify device config in `atlas/config/devices`
- Inspect `atlas/logs/ai.jsonl`
