# Task Execution API (v1)

## Submit task
POST `/tasks/submit`
```
{
  "id": "task-1",
  "type": "shell",
  "command": "echo hello",
  "timeout_sec": 30,
  "required_tags": ["role:server"]
}
```

## Claim task (agent)
POST `/tasks/claim`
```
{"tags": ["role:server"]}
```

## Report result (agent)
POST `/tasks/report`
```
{
  "id": "task-1",
  "status": "completed",
  "result": {"exit_code": 0, "stdout": "hello\n", "stderr": ""}
}
```
