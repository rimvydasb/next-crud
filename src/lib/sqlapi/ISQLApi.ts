import {Kysely, PostgresDialect, SqliteDialect, sql} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import {Pool} from 'pg'
import {ColumnSpec, ColumnType, DatabaseSchema, SupportedDialect} from '../entities'

export interface ISQLApi {
    toStringType(type: ColumnType): string
    syncColumns(
        db: Kysely<any>,
        tableName: string,
        columns: ColumnSpec[],
        schemaName?: string
    ): Promise<boolean>
}

export class SqliteApi implements ISQLApi {
    toStringType(type: ColumnType): string {
        switch (type) {
            case ColumnType.STRING:
                return 'text'
            case ColumnType.INTEGER:
                return 'integer'
            case ColumnType.BOOLEAN:
                return 'integer'
            case ColumnType.TIMESTAMP:
            case ColumnType.TIMESTAMPTZ:
                return 'timestamp'
            case ColumnType.JSON:
            case ColumnType.JSONB:
                return 'text'
            default:
                return 'text'
        }
    }

    async syncColumns(db: Kysely<any>, tableName: string, columns: ColumnSpec[]): Promise<boolean> {
        const pragma = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(String(tableName))});`.execute(db)
        const existing = new Set(pragma.rows.map(r => r.name))
        const toAdd = columns.filter(c => !existing.has(c.name))
        if (toAdd.length === 0) return false
        for (const column of toAdd) {
            await db.schema
                .alterTable(tableName)
                .addColumn(
                    column.name,
                    this.toStringType(column.type) as any,
                    col => {
                        if (column.notNull && column.defaultSql) col = col.notNull().defaultTo(sql.raw(column.defaultSql))
                        else if (column.notNull) col = col.notNull()
                        if (column.unique) col = col.unique()
                        if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
                        return col
                    }
                )
                .execute()
        }
        return true
    }
}

export class PostgresApi implements ISQLApi {
    toStringType(type: ColumnType): string {
        switch (type) {
            case ColumnType.STRING:
                return 'varchar(255)'
            case ColumnType.INTEGER:
                return 'integer'
            case ColumnType.BOOLEAN:
                return 'boolean'
            case ColumnType.TIMESTAMP:
                return 'timestamp'
            case ColumnType.TIMESTAMPTZ:
                return 'timestamptz'
            case ColumnType.JSON:
                return 'json'
            case ColumnType.JSONB:
                return 'jsonb'
            default:
                return 'text'
        }
    }

    async syncColumns(
        db: Kysely<any>,
        tableName: string,
        columns: ColumnSpec[],
        schemaName = 'public'
    ): Promise<boolean> {
        const rows = await sql<{ column_name: string }>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${schemaName}
              AND table_name = ${tableName}
        `.execute(db)
        const existing = new Set(rows.rows.map(r => r.column_name))
        const toAdd = columns.filter(c => !existing.has(c.name))
        if (toAdd.length === 0) return false
        for (const column of toAdd) {
            await db.schema
                .alterTable(tableName)
                .addColumn(
                    column.name,
                    this.toStringType(column.type) as any,
                    col => {
                        if (column.notNull && column.defaultSql) col = col.notNull().defaultTo(sql.raw(column.defaultSql))
                        else if (column.notNull) col = col.notNull()
                        if (column.unique) col = col.unique()
                        if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
                        return col
                    }
                )
                .execute()
        }
        return true
    }
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
        return { db, dialect: 'postgres', api: new PostgresApi() }
    }
    throw new Error(`Unsupported DATABASE_URL: ${url}`)
}

