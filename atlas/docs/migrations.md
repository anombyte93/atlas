# Schema & Migration Policy (v1)

## Versioning
- All config and log schemas include `schema_version`.
- Breaking changes require a new major version and a migration script.

## Migrations
- Store migration scripts under `atlas/scripts/migrations/`.
- Migrations must be reversible or provide a rollback note.
- Control plane should reject unknown major versions.

## Compatibility
- Agents must support current and previous minor versions.
- Logs should be parsed by a version-aware reader.
