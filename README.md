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

## Basic API Usage

### AbstractJSONTable

Store typed JSON content while keeping `id`, `priority`, and `type` columns.

```ts
class DashboardTable extends AbstractJSONTable<'dashboard_configuration', Dashboard> {
  constructor(db: Kysely<DatabaseSchema>) {
    super(db, 'dashboard_configuration', ['DASHBOARD'])
  }
}

const repo = new DashboardTable(db)
await repo.ensureSchema()
const created = await repo.createWithContent({type: 'DASHBOARD', title: 'Main'})
const fetched = await repo.getByIdWithContent(created.id!)
```

### JSONTableDataHandler

Next.js handler that wraps an `AbstractJSONTable` and exposes CRUD endpoints.

```ts
class DashboardHandler extends JSONTableDataHandler<'dashboard_configuration', Dashboard> {
  protected getDb() { return db }
  protected async getTable() { return new DashboardTable(db) }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  new DashboardHandler(req, res).handle()
```

### AbstractCacheTable

Simple cache table with TTL helpers.

```ts
class RequestCache extends AbstractCacheTable<'request_data_cache'> {
  constructor(db: Kysely<DatabaseSchema>) {
    super(db, 'request_data_cache')
  }
}

const cache = new RequestCache(db)
await cache.save({type: 'SESSION'}, {userId: 1})
const data = await cache.get<{userId: number}>({type: 'SESSION'}, TTL.ONE_DAY)
```

## Known Issues
- priority does not properly work, do not fix it right now, it will be fixed later

## Development
Install dependencies:
```bash
npm install -g npm-check-updates
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

## Maintenance

```bash
# Check for outdated dependencies
ncu

# Update dependencies
ncu -u
```
