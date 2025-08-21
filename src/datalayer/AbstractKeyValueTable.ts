import {Insertable, Kysely, Updateable, sql} from 'kysely'
import {ColumnType} from './entities'
import {BaseTable} from './BaseTable'

export interface KeyValueBaseTable<V> {
    key: string
    value: V | null
}

export interface KeyValueTableConfig<TableName extends string> {
    tableName: TableName
    valueType: ColumnType
}

export abstract class AbstractKeyValueTable<
    DST,
    TableName extends keyof DST & string,
    Value
> extends BaseTable<DST, TableName> {
    private readonly valueType: ColumnType

    constructor(database: Kysely<DST>, config: KeyValueTableConfig<TableName>) {
        super(database, config.tableName)
        this.valueType = config.valueType
    }

    protected encode(value: Value | null): unknown {
        if (this.valueType === ColumnType.JSON) {
            if (value == null) return null
            return this.dialect === 'postgres' ? value : JSON.stringify(value)
        }
        return value as unknown
    }

    protected decode(value: unknown): Value | null {
        if (this.valueType === ColumnType.JSON) {
            if (value == null) return null as any
            if (this.dialect === 'postgres') return value as Value
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value) as Value
                } catch {
                    return value as Value
                }
            }
        }
        return value as Value | null
    }

    async ensureSchema(): Promise<void> {
        let builder = this.db.schema.createTable(this.tableName).ifNotExists()
        builder = builder.addColumn('key', 'varchar', col => col.notNull())
        builder = builder.addColumn(
            'value',
            this.sqlApi.toStringType(this.valueType) as any,
        )

        builder = this.applyExtraColumns(builder)

        await builder.execute()
        const indexName = `${String(this.tableName)}_key_idx`
        await sql`CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} ON ${sql.raw(
            String(this.tableName),
        )} (key)`.execute(this.db)
    }

    async getValue(key: string): Promise<Value | null | undefined> {
        const row = await this.db
            .selectFrom(this.tableName as string)
            .select(['value'])
            .where('key', '=', key)
            .executeTakeFirst()
        if (!row) return undefined
        return this.decode((row as any).value)
    }

    async setValue(key: string, value: Value | null): Promise<void> {
        const encoded = this.encode(value)
        const res = await (this.db.updateTable(this.tableName as string) as any)
            .set({value: encoded} as Updateable<DST[TableName]>)
            .where('key', '=', key)
            .executeTakeFirst()
        const updated = (res as any)?.numUpdatedRows ?? 0n
        if (Number(updated) === 0) {
            await (this.db.insertInto(this.tableName as string) as any)
                .values({key, value: encoded} as Insertable<DST[TableName]>)
                .execute()
        }
    }

    async getObject(): Promise<Record<string, Value | null>> {
        const rows = await this.db
            .selectFrom(this.tableName as string)
            .select(['key', 'value'])
            .execute()
        const result: Record<string, Value | null> = {}
        for (const row of rows as any[]) {
            result[row.key] = this.decode(row.value)
        }
        return result
    }

    async setObject(obj: Record<string, Value | null | undefined>): Promise<void> {
        await this.db.transaction().execute(async trx => {
            for (const [key, value] of Object.entries(obj)) {
                if (value === undefined) continue
                const encoded = this.encode(value as Value | null)
                const res = await (trx.updateTable(this.tableName as string) as any)
                    .set({value: encoded} as Updateable<DST[TableName]>)
                    .where('key', '=', key)
                    .executeTakeFirst()
                const updated = (res as any)?.numUpdatedRows ?? 0n
                if (Number(updated) === 0) {
                    await (trx.insertInto(this.tableName as string) as any)
                        .values({key, value: encoded} as Insertable<DST[TableName]>)
                        .execute()
                }
            }
        })
    }
}

