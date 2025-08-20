import type {NextApiRequest, NextApiResponse} from 'next'
import {AbstractCacheTable} from "@datalayer/AbstractCacheTable";
import {BaseTable, CacheBaseTable, ColumnSpec, ColumnType} from "@datalayer/entities";
import {Kysely, PostgresDialect, sql, SqliteDialect} from "kysely";
import {AbstractTable} from "@datalayer/AbstractTable";
import {IJSONContent} from "@datalayer/IJSONContent";
import {AbstractJSONTable} from "@datalayer/AbstractJSONTable";
import BetterSqlite3 from "better-sqlite3";
import {Pool} from "pg";

export function createMock(method: string, body: any = {}, query: any = {}) {
    const req = {method, body, query} as unknown as NextApiRequest
    const res: any = {
        statusCode: 0,
        data: undefined as any,
        status(code: number) {
            this.statusCode = code
            return this
        },
        json(payload: any) {
            this.data = payload
            return this
        },
        end() {
            return this
        },
        setHeader() {
            // no-op for tests
        },
        statusMessage: '',
    }
    return {req, res: res as NextApiResponse}
}

export default class RequestDataRepository extends AbstractCacheTable<DatabaseSchema, 'request_data_cache'> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'request_data_cache')
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'reference', type: ColumnType.STRING},
            {name: 'metadata', type: ColumnType.JSON},
        ]
    }
}

export class UsersRepository extends AbstractTable<DatabaseSchema, 'users'> {

    constructor(database: Kysely<DatabaseSchema>) {
        super(database, {tableName: 'users', softDelete: true, hasPriority: true})
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'name', type: ColumnType.STRING, notNull: true},
            {name: 'surname', type: ColumnType.STRING, notNull: true},
            {name: 'telephone_number', type: ColumnType.STRING, notNull: true},
        ]
    }
}

export interface DashboardConfiguration extends IJSONContent {
    title: string
    description: string
    panelsIds: number[]
    variables: Record<string, unknown>
    type: 'DASHBOARD'
}

export class DashboardConfigurationRepository extends AbstractJSONTable<DatabaseSchema, 'dashboard_configuration', DashboardConfiguration> {
    constructor(database: Kysely<DatabaseSchema>) {
        super(database, {tableName: 'dashboard_configuration', softDelete: true, hasPriority: true}, ['DASHBOARD'])
    }
}

export interface RequestDataCacheTable extends CacheBaseTable {
    reference: string | null
    metadata: unknown | null
}

export interface DashboardConfigurationTable extends BaseTable {
    type: string
    content: unknown
}

export interface UsersTable extends BaseTable {
    name: string
    surname: string
    telephone_number: string
}

export interface DatabaseSchema {
    users: UsersTable
    request_data_cache: RequestDataCacheTable
    dashboard_configuration: DashboardConfigurationTable
}

/**
 * Create a Kysely instance for tests.
 *
 * By default an in-memory SQLite database is used. If the USE_PG_TESTS flag is
 * truthy, a Postgres database running on localhost:5435 with the
 * credentials `test_user`/`password` and database `test_db` is used instead.
 * The connection operates inside a unique test schema which is dropped and
 * recreated for every invocation.
 */
export async function createTestDb(): Promise<Kysely<DatabaseSchema>> {
    const usePg = !!process.env.USE_PG_TESTS
    if (usePg) {
        const {Pool} = await import('pg')
        const dialect = new PostgresDialect({
            pool: new Pool({
                host: 'localhost',
                port: 5435,
                user: 'test_user',
                password: 'password',
                database: 'test_db'
            })
        })
        const db = new Kysely<DatabaseSchema>({dialect})
        // Check if db connection is successful
        const result = await sql`SELECT 1`.execute(db);
        if (result.rows.length === 0) {
            throw new Error('Failed to connect to the Postgres test database')
        }
        const schemaName = `test_db`
        await sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).execute(db)
        await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(db)
        await sql.raw(`SET search_path TO "${schemaName}"`).execute(db)
        return db
    }

    const {default: BetterSqlite3} = await import('better-sqlite3')
    const sqlite = new BetterSqlite3(':memory:')
    return new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({database: sqlite})
    })
}

class TestTable extends AbstractTable<DatabaseSchema, 'users'> {
    protected extraColumns(): ColumnSpec[] {
        return []
    }

    public getDialect(): string {
        return this.dialect
    }
}

class TestCacheTable extends AbstractCacheTable<DatabaseSchema, 'request_data_cache'> {
    public getDialect(): string {
        return this.dialect
    }
}

describe('detectDialect helper integration', () => {
    it('detects sqlite dialect', async () => {
        const sqlite = new BetterSqlite3(':memory:')
        const db = new Kysely<DatabaseSchema>({dialect: new SqliteDialect({database: sqlite})})
        const table = new TestTable(db, 'users')
        const cache = new TestCacheTable(db, 'request_data_cache')
        expect(table.getDialect()).toBe('sqlite')
        expect(cache.getDialect()).toBe('sqlite')
        await db.destroy()
    })

    it('detects postgres dialect', async () => {
        const db = new Kysely<DatabaseSchema>({dialect: new PostgresDialect({pool: new Pool()})})
        const table = new TestTable(db, 'users')
        const cache = new TestCacheTable(db, 'request_data_cache')
        expect(table.getDialect()).toBe('postgres')
        expect(cache.getDialect()).toBe('postgres')
        await db.destroy()
    })
})