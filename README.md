# Kysely Repository Library

Reusable TypeScript repository layer built on [Kysely](https://github.com/kysely-org/kysely) with support for PostgreSQL and SQLite.

## Features / Roadmap
- [x] Base table columns: `id`, `priority`, `deleted_at`, `created_at`
- [x] CRUD operations
- [x] Soft delete, hard delete, and restore
- [x] Priority updates that shift other rows *(experimental)*
- [x] Schema management via `ensureSchema()`
- [x] `BaseTable` abstract class for shared table utilities
- [x] `AbstractJSONRepository` for storing typed JSON content
- [x] `AbstractCacheRepository` for simple cache management with TTL
- [x] `AbstractKeyValueRepository` for simple key/value storage

## Prerequisites

- Node.js 22+
- PostgreSQL database (SQLite is used for tests)

## Integration Layer

- **AuthorisedTransporter** — wraps `fetch` to perform REST calls against a base URL and injects bearer tokens from an `ITokenStore`.
- **AuthorisedCachedTransporter** — extends `AuthorisedTransporter` and adds `getWithCache` for caching side-effect-free GET responses through an `IRequestCache`.
- **DatabaseTokenStore** — stores tokens in an `AbstractKeyValueRepository` and refreshes them via an `ITokenProvider`.

## API Usage

### Repository layer

#### AbstractJSONRepository

Store typed JSON content while keeping `id`, `priority`, and `type` columns.

| id | priority | type | content | deleted_at | created_at |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 'DASHBOARD' | {"title":"Main"} | null | 2024-01-01T00:00:00Z |

```ts
class DashboardRepository extends AbstractJSONRepository<DatabaseSchema, 'dashboard_configuration', Dashboard> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'dashboard_configuration', ['DASHBOARD'])
    }
}

const repo = new DashboardRepository(db)
await repo.ensureSchema()
const created = await repo.jsonCreate({type: 'DASHBOARD', title: 'Main'}) // => { id: 1, priority: 0, type: 'DASHBOARD', title: 'Main' }
const fetched = await repo.jsonGetById(created.id!) // => { id: 1, priority: 0, type: 'DASHBOARD', title: 'Main' }
```

#### AbstractCacheRepository

Simple cache table with TTL helpers and existence checks.

| id | key | type | content | expired | created_at |
| --- | --- | --- | --- | --- | --- |
| 1 | 'session1' | 'SESSION' | {"userId":1} | null | 2024-01-01T00:00:00Z |

```ts
class RequestCacheRepository extends AbstractCacheRepository<DatabaseSchema, 'request_data_cache'> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'request_data_cache')
    }
}

const cache = new RequestCacheRepository(db)
await cache.create({key: 'session1', type: 'SESSION'}, {userId: 1})
const exists = await cache.isCached({key: 'session1'}, TTL.ONE_DAY) // => true
const data = await cache.getLast<{userId: number}>({key: 'session1'}, TTL.ONE_DAY) // => { userId: 1 }
```

#### AbstractKeyValueRepository

Persist simple key/value pairs with typed values.

| key | value |
| --- | --- |
| 'THEME' | 'dark' |

```ts
class SettingsRepository extends AbstractKeyValueRepository<DatabaseSchema, 'settings', string> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, {tableName: 'settings', valueType: ColumnType.STRING})
    }
}

    const settings = new SettingsRepository(db)
    await settings.setValue('THEME', 'dark')
    const obj = await settings.exportData() // => { THEME: 'dark' }
```

### REST handler layer

#### BaseTableDataHandler

Generic REST handler for repositories implementing `AbstractRepository`.

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
        const repo = new DashboardRepository(db)
        await repo.ensureSchema()
        return repo
    }
}

export default (req: NextApiRequest, res: NextApiResponse) =>
    new DashboardHandler(req, res).handle()
```

##### Supported HTTP methods

- **GET** `?id=<id>` → fetch a single row, omit `id` to fetch all rows. Response: array of rows.
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
# PostgreSQL-specific tests
npm run test:pg
```

## Maintenance

```bash
# Check for outdated dependencies
ncu

# Update dependencies
ncu -u
```

## License

Licensed under the Apache 2.0 License. See [LICENSE](LICENSE) for details.
