# Kysely Repository Library

Reusable TypeScript repository layer built on [Kysely](https://github.com/kysely-org/kysely) with support for PostgreSQL and SQLite.

## Features / Roadmap
- [x] Base table columns: `id`, `priority`, `deleted_at`, `created_at`
- [x] CRUD operations
- [x] Soft delete, hard delete, and restore
- [x] Stable priority updates that shift other rows
- [x] Schema management via `ensureSchema()` and `syncColumns()`
- [ ] (TODO) DatabaseService that provides a single point of access to the database
- [ ] (TODO) BaseTableDataHandler that provided REST API for a given table

## Known Issues
- priority does not properly work, do not fix it right now, it will be fixed later

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

Run tests:
```bash
npm test
```
