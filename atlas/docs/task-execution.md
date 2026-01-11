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
  "status": "completed",
  "result": {"exit_code": 0, "stdout": "hello\n", "stderr": ""}
}
```

## Renew lease (agent)
POST `/tasks/renew`
```
{"id": "task-1", "claimed_by": "agent-local"}
```

## Auth
- If control plane `api_token` is set, include `Authorization: Bearer <token>` for these endpoints.
