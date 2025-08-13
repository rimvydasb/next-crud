# Kysely Repository Library

Reusable TypeScript repository layer built on [Kysely](https://github.com/kysely-org/kysely) with support for PostgreSQL and SQLite.

## Features
- Base table columns: `id`, `priority`, `deleted_at`, `created_at`
- CRUD operations
- Soft delete, hard delete, and restore
- Stable priority updates that shift other rows
- Schema management via `ensureSchema()` and `syncColumns()`

## Development
Install dependencies:
```bash
npm install
```

Lint and type-check:
```bash
npm run lint
npm run build
```

Run tests (none provided):
```bash
npm test
```
