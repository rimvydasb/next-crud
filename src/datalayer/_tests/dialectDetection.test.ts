import BetterSqlite3 from 'better-sqlite3'
import {Kysely, PostgresDialect, SqliteDialect} from 'kysely'
import {Pool} from 'pg'
import {AbstractTable} from '../AbstractTable'
import {AbstractCacheTable} from '../AbstractCacheTable'
import {ColumnSpec, DatabaseSchema} from '../entities'

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
