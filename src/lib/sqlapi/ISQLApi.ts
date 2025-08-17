import {Kysely, PostgresDialect, SqliteDialect} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import {Pool} from 'pg'
import {ColumnSpec, ColumnType, DatabaseSchema, SupportedDialect} from '../entities'
import {SqliteApi} from "./SqliteApi";
import {PostgresSQLApi} from "./PostgresSQLApi";

export interface ISQLApi {
    toStringType(type: ColumnType): string
    syncColumns(
        db: Kysely<any>,
        tableName: string,
        columns: ColumnSpec[],
        schemaName?: string
    ): Promise<boolean>
}

export async function createInstance(
    url: string
): Promise<{ db: Kysely<DatabaseSchema>; dialect: SupportedDialect; api: ISQLApi }> {
    if (url.startsWith('sqlite://')) {
        const filename = url.replace('sqlite://', '')
        const sqlite = new BetterSqlite3(filename)
        const db = new Kysely<DatabaseSchema>({
            dialect: new SqliteDialect({ database: sqlite })
        })
        return { db, dialect: 'sqlite', api: new SqliteApi() }
    }
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        const pool = new Pool({ connectionString: url })
        const db = new Kysely<DatabaseSchema>({
            dialect: new PostgresDialect({ pool })
        })
        return { db, dialect: 'postgres', api: new PostgresSQLApi() }
    }
    throw new Error(`Unsupported DATABASE_URL: ${url}`)
}

