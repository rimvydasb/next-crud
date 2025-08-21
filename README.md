# Kysely Repository Library

Reusable TypeScript repository layer built on [Kysely](https://github.com/kysely-org/kysely) with support for PostgreSQL and SQLite.

## Features / Roadmap
- [x] Base table columns: `id`, `priority`, `deleted_at`, `created_at`
- [x] CRUD operations
- [x] Soft delete, hard delete, and restore
- [x] Stable priority updates that shift other rows
- [x] Schema management via `ensureSchema()` and `syncColumns()`
- [x] `BaseTable` abstract class for shared table utilities
- [x] `AbstractJSONTable` for storing typed JSON content
- [x] `AbstractCacheTable` for simple cache management with TTL
- [x] `AbstractKeyValueTable` for simple key/value storage

## API Usage

### Repository layer

#### AbstractJSONTable

Store typed JSON content while keeping `id`, `priority`, and `type` columns.

```ts
class DashboardTable extends AbstractJSONTable<DatabaseSchema, 'dashboard_configuration', Dashboard> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'dashboard_configuration', ['DASHBOARD'])
    }
}

const repo = new DashboardTable(db)
await repo.ensureSchema()
const created = await repo.createWithContent({type: 'DASHBOARD', title: 'Main'})
const fetched = await repo.getByIdWithContent(created.id!)
```

#### AbstractCacheTable

Simple cache table with TTL helpers and existence checks.

```ts
class RequestCache extends AbstractCacheTable<DatabaseSchema, 'request_data_cache'> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'request_data_cache')
    }
}

const cache = new RequestCache(db)
await cache.save({key: 'session1', type: 'SESSION'}, {userId: 1})
const exists = await cache.isCached({key: 'session1'}, TTL.ONE_DAY)
const data = await cache.getLast<{userId: number}>({key: 'session1'}, TTL.ONE_DAY)
```

#### AbstractKeyValueTable

Persist simple key/value pairs with typed values.

```ts
class SettingsTable extends AbstractKeyValueTable<DatabaseSchema, 'settings', string> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, {tableName: 'settings', valueType: ColumnType.STRING})
    }
}

const settings = new SettingsTable(db)
await settings.setValue('THEME', 'dark')
const obj = await settings.getObject()
```

### REST handler layer

#### BaseTableDataHandler

Generic REST handler for tables using `AbstractTable` repositories.

```ts
class UsersHandler extends BaseTableDataHandler<DatabaseSchema, 'users'> {
    protected getDb() { return db }
    protected async getTable() {
        const repo = new UsersRepository(db)
        await repo.ensureSchema()
        return repo
    }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
    new UsersHandler(req, res).handle()
```

#### JSONTableDataHandler

Same pattern for tables storing JSON content.

```ts
class DashboardHandler extends JSONTableDataHandler<DatabaseSchema, 'dashboard_configuration', Dashboard> {
    protected getDb() { return db }
    protected async getTable() {
        const repo = new DashboardTable(db)
        await repo.ensureSchema()
        return repo
    }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
    new DashboardHandler(req, res).handle()
```

##### Supported HTTP methods

- **GET** `?id=<id>` → fetch a single row, omit `id` to list all rows. Response: array of rows.
- **POST** body `{...}` → create a row. Response: array with the created row.
- **PATCH** body `{id, ...fields}` → update a row. Body `{id, priority}` updates only priority.
- **DELETE** body `{id}` → soft delete a row. Response: array with the deleted row.

Handlers reply with HTTP status codes from `ErrorCode` and JSON payloads. Repository hooks (`postProcess`, `postGet`) may
customize responses.
## Known Issues
- priority does not properly work, do not fix it right now, it will be fixed later

## Development
Install dependencies:
```bash
npm ci
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
