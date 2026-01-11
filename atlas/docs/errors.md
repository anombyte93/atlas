# API Error Responses

All error responses are JSON:
```
{
  "error": "code",
  "message": "human readable message"
}
```

Common codes:
- `unauthorized`
- `validation`
- `schema_version`
- `invalid_json`
- `conflict`
- `lease_expired`
- `state_conflict`
- `not_found`
