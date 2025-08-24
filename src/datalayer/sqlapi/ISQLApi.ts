import {Kysely} from 'kysely'
import {ColumnSpec, ColumnType, SupportedDialect} from '../entities'
import {SQLiteApi} from './SQLiteApi'
import {PostgresSQLApi} from './PostgresSQLApi'

export interface ISQLApi {
    dialect: SupportedDialect

    toSQLType(type: ColumnType): string

    syncColumns(
        db: Kysely<any>,
        tableName: string,
        columns: ColumnSpec[],
        schemaName?: string
    ): Promise<boolean>
}

/**
 * Return ISQLApi implementation based on provided dialect or URL.
 */
export function createSqlApi(urlOrDialect: string | SupportedDialect): ISQLApi {
    if (typeof urlOrDialect === 'string') {
        if (urlOrDialect.startsWith('sqlite://') || urlOrDialect === 'sqlite') {
            return new SQLiteApi()
        }
        if (
            urlOrDialect.startsWith('postgres://') ||
            urlOrDialect.startsWith('postgresql://') ||
            urlOrDialect === 'postgres'
        ) {
            return new PostgresSQLApi()
        }
    }
    throw new Error(`Unsupported dialect: ${urlOrDialect}`)
}

