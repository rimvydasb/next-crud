import {Kysely, SqliteDialect, PostgresDialect, sql} from 'kysely'
import type {DatabaseSchema} from './datalayer/entities'

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
        // Generate a unique schema name to avoid conflicts between parallel tests
        const schemaName = `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        // Ensure a clean test schema for each run
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
