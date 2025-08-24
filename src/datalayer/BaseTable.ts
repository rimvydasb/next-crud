import {Kysely, sql} from 'kysely'
import {ColumnSpec, SupportedDialect} from './entities'
import {createSqlApi, ISQLApi} from './sqlapi/ISQLApi'
import {detectDialect} from './utilities'

export abstract class BaseTable<DST, TableName extends keyof DST & string> {
    protected readonly dialect: SupportedDialect
    protected readonly sqlApi: ISQLApi
    protected readonly tableName: TableName

    constructor(protected readonly database: Kysely<DST>, tableName: TableName) {
        this.tableName = tableName
        this.dialect = detectDialect(this.database)
        this.sqlApi = createSqlApi(this.dialect)
    }

    protected get db(): Kysely<any> {
        return this.database as unknown as Kysely<any>
    }

    protected extraColumns(): ColumnSpec[] {
        return []
    }

    protected applyExtraColumns<T>(builder: T): T {
        for (const column of this.extraColumns()) {
            builder = (builder as any).addColumn(
                column.name,
                this.sqlApi.toSQLType(column.type) as any,
                (col: any) => {
                    if (column.notNull) col = col.notNull()
                    if (column.unique) col = col.unique()
                    if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
                    return col
                },
            )
        }
        return builder
    }

    abstract ensureSchema(): Promise<void>

    async syncColumns(schemaName: string = 'public'): Promise<void> {
        await this.sqlApi.syncColumns(
            this.db,
            this.tableName as string,
            this.extraColumns(),
            schemaName,
        )
    }
}

