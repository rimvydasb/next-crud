import { Kysely, SqliteDialect, PostgresDialect, sql } from 'kysely'
import type { DatabaseSchema } from './datalayer/entities'

/**
 * Create a Kysely instance for tests.
 *
 * By default an in-memory SQLite database is used. If the USE_PG_TESTS flag is
 * truthy, a Postgres database running on localhost:5435 with the
 * credentials `test_user`/`password` and database `test_db` is used instead.
 * The connection operates inside the "test" schema which is dropped and
 * recreated for every invocation.
 */
export async function createTestDb(): Promise<Kysely<DatabaseSchema>> {
  const usePg = !!process.env.USE_PG_TESTS
  if (usePg) {
    const { Pool } = await import('pg')
    const dialect = new PostgresDialect({
      pool: new Pool({
        host: 'localhost',
        port: 5435,
        user: 'test_user',
        password: 'password',
        database: 'test_db'
      })
    })
    const db = new Kysely<DatabaseSchema>({ dialect })
    // Ensure a clean test schema for each run
    await sql`DROP SCHEMA IF EXISTS test CASCADE`.execute(db)
    await sql`CREATE SCHEMA test`.execute(db)
    await sql`SET search_path TO test`.execute(db)
    return db
  }

  const { default: BetterSqlite3 } = await import('better-sqlite3')
  const sqlite = new BetterSqlite3(':memory:')
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite })
  })
}
