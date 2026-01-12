# Task Execution API (v1)

## Submit task
POST `/tasks/submit`
```
{
  "schema_version": "1.0.0",
  "id": "task-1",
  "type": "shell",
  "command": "echo hello",
  "timeout_sec": 30,
  "required_tags": ["role:server"],
  "max_attempts": 3
}
```
Notes:
- Duplicate task IDs return 409.
- Failed tasks are re-queued with exponential backoff until `max_attempts` is reached.

## Claim task (agent)
POST `/tasks/claim`
```
{"tags": ["role:server"], "agent_id": "agent-local"}
```
Notes:
- Claims create a short lease; expired running tasks can be re-queued.

## Report result (agent)
POST `/tasks/report`
```
{
  "id": "task-1",
  "schema_version": "1.0.0",
  "claimed_by": "agent-local",
  "claim_token": "token-from-claim",
  "leader_token": 123,
  "content_hash": "<hash-from-claim>",
  "status": "completed",
  "result": {"exit_code": 0, "stdout": "hello\n", "stderr": ""}
}
```

## Renew lease (agent)
POST `/tasks/renew`
```
{"id": "task-1", "claimed_by": "agent-local", "claim_token": "token-from-claim", "leader_token": 123}
```

## Auth
- If control plane `api_token` is set, include `Authorization: Bearer <token>` for these endpoints.

## Content & leader validation
- Control plane stamps each claimed task with `content_hash` (type, command/script path, timeout, tags, max_attempts, and script bytes when available) and `leader_token` when leader election is enabled.
- Agents must echo both values on `report` and `renew`. When leader is disabled, `leader_token` may be omitted. Missing or stale leader tokens are rejected when leader mode is on.
- Script tasks require `world_repo` to hash bytes; absolute paths or unreadable scripts are rejected at submit time.
- Agents refuse to run script tasks if their locally computed `content_hash` differs from the control-plane hash and will report the task as failed instead of executing.
