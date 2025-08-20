import {Insertable, Kysely, Selectable, sql, Updateable} from 'kysely'
import {ColumnSpec, SupportedDialect} from './entities'
import {ISQLApi, createSqlApi} from './sqlapi/ISQLApi'
import {
    addIdColumn,
    createdAtDefaultSql,
    createPriorityIndex,
    detectDialect,
    ensureValidId,
} from './utilities'

export interface TableConfig<TableName extends string> {
    tableName: TableName
    softDelete?: boolean
    hasPriority?: boolean
}

export abstract class AbstractTable<DST, TableName extends keyof DST & string> {
    protected readonly dialect: SupportedDialect
    protected readonly sqlApi: ISQLApi
    protected readonly tableName: TableName
    protected readonly softDelete: boolean
    protected readonly hasPriority: boolean

    constructor(
        protected readonly database: Kysely<DST>,
        tableNameOrConfig: TableName | TableConfig<TableName>,
    ) {
        const cfg: TableConfig<TableName> =
            typeof tableNameOrConfig === 'string'
                ? {tableName: tableNameOrConfig}
                : tableNameOrConfig

        this.tableName = cfg.tableName
        this.softDelete = cfg.softDelete ?? false
        this.hasPriority = cfg.hasPriority ?? false

        this.dialect = detectDialect(this.database)
        this.sqlApi = createSqlApi(this.dialect)
    }

    // Access Kysely with relaxed typing for generic operations
    protected get db(): Kysely<any> {
        return this.database as unknown as Kysely<any>
    }

    // Define table-specific extra columns in subclasses, in one place
    protected abstract extraColumns(): ColumnSpec[]

    // Create table if missing: base + extra columns
    async ensureSchema(): Promise<void> {
        let createBuilder = this.db.schema
            .createTable(this.tableName)
            .ifNotExists()

        createBuilder = addIdColumn(this.dialect, createBuilder)

        if (this.hasPriority) {
            createBuilder = createBuilder.addColumn('priority', 'integer')
        }
        if (this.softDelete) {
            createBuilder = createBuilder.addColumn('deleted_at', 'timestamp') // nullable
        }

        createBuilder = createBuilder.addColumn(
            'created_at',
            this.dialect === 'postgres' ? 'timestamp' : 'timestamp',
            (col) => col.notNull().defaultTo(sql.raw(createdAtDefaultSql())),
        )

        for (const column of this.extraColumns()) {
            createBuilder = createBuilder.addColumn(
                column.name,
                this.sqlApi.toStringType(column.type) as any,
                (col) => {
                    if (column.notNull) col = col.notNull()
                    if (column.unique) col = col.unique()
                    if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
                    return col
                }
            )
        }

        await createBuilder.execute()
        if (this.hasPriority) {
            await createPriorityIndex(this.db, this.tableName)
        }
    }

    // Add any newly declared extra columns to an existing table (forward-only)
    async syncColumns(schemaName: string = 'public'): Promise<void> {
        await this.sqlApi.syncColumns(this.db, this.tableName as string, this.extraColumns(), schemaName)
    }

    async create(values: Insertable<DST[TableName]>): Promise<Selectable<DST[TableName]>> {
        const obj = values as any
        const providedPriority =
            this.hasPriority &&
            obj.priority !== undefined &&
            obj.priority !== null &&
            Number.isInteger(obj.priority) &&
            obj.priority > 0

        if (this.hasPriority) {
            if (!providedPriority) {
                obj.priority = null
            }
        } else {
            delete obj.priority
        }

        return await this.db.transaction().execute(async (trx) => {
            const created = await trx
                .insertInto(this.tableName)
                .values(values)
                .returningAll()
                .executeTakeFirstOrThrow()

            if (this.hasPriority && !providedPriority) {
                await (trx.updateTable(this.tableName as string) as any)
                    .set({priority: sql`id`} as unknown as Updateable<DST[TableName]>)
                    .where('priority', 'is', null)
                    .execute()

                return (await trx
                    .selectFrom(this.tableName as string)
                    .selectAll()
                    .where('id', '=', (created as any).id)
                    .executeTakeFirstOrThrow()) as Selectable<DST[TableName]>
            }

            return created as Selectable<DST[TableName]>
        })
    }

    async getById(
        id: number,
        options: { includeDeleted?: boolean } = {}
    ): Promise<Selectable<DST[TableName]> | undefined> {
        ensureValidId(id)
        let query = this.db.selectFrom(this.tableName as string).selectAll().where('id', '=', id)
        if (this.softDelete && !options.includeDeleted) {
            query = query.where('deleted_at', 'is', null)
        }
        return (await query.executeTakeFirst()) as Selectable<DST[TableName]> | undefined
    }

    async list(options: {
        includeDeleted?: boolean
        limit?: number
        offset?: number
        orderBy?: { column: keyof DST[TableName]; direction?: 'asc' | 'desc' }
    } = {}): Promise<Array<Selectable<DST[TableName]>>> {
        const {includeDeleted, limit = 50, offset = 0, orderBy} = options
        let query = this.db.selectFrom(this.tableName as string).selectAll()
        if (this.softDelete && !includeDeleted) {
            query = query.where('deleted_at', 'is', null)
        }
        if (orderBy) query = query.orderBy(orderBy.column as string, orderBy.direction ?? 'asc')
        return (await query.limit(limit).offset(offset).execute()) as Array<Selectable<DST[TableName]>>
    }

    async update(
        id: number,
        patch: Updateable<DST[TableName]>
    ): Promise<Selectable<DST[TableName]> | undefined> {
        ensureValidId(id)
        return (await (this.db.updateTable(this.tableName) as any)
            .set(patch as any)
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst()) as Selectable<DST[TableName]> | undefined
    }

    // Soft delete
    async delete(id: number): Promise<Selectable<DST[TableName]> | undefined> {
        ensureValidId(id)
        if (!this.softDelete) {
            await this.permanentDelete(id)
            return undefined
        }
        return (await (this.db.updateTable(this.tableName) as any)
            .set({deleted_at: sql`CURRENT_TIMESTAMP`} as unknown as Updateable<DST[TableName]>)
            .where('id', '=', id)
            .where('deleted_at', 'is', null)
            .returningAll()
            .executeTakeFirst()) as Selectable<DST[TableName]> | undefined
    }

    async restore(id: number): Promise<Selectable<DST[TableName]> | undefined> {
        if (!this.softDelete) {
            throw new Error('Soft delete feature not enabled')
        }
        ensureValidId(id)
        return (await (this.db.updateTable(this.tableName) as any)
            .set({deleted_at: null} as unknown as Updateable<DST[TableName]>)
            .where('id', '=', id)
            .where('deleted_at', 'is not', null)
            .returningAll()
            .executeTakeFirst()) as Selectable<DST[TableName]> | undefined
    }

    // Hard delete
    async permanentDelete(id: number): Promise<number> {
        ensureValidId(id)
        const result = await (this.db.deleteFrom(this.tableName as string) as any)
            .where('id', '=', id)
            .executeTakeFirst()
        return result?.numDeletedRows ? Number(result.numDeletedRows) : 0
    }

    /**
     * Move a row to the target priority. Keeps priorities unique by shifting others.
     * - If currentPriority < targetPriority: shift (current+1..target) down by 1
     * - If currentPriority > targetPriority: shift (target..current-1) up by 1
     */
    async updatePriority(
        id: number,
        targetPriority: number
    ): Promise<Selectable<DST[TableName]>> {
        if (!this.hasPriority) {
            throw new Error('Priority feature not enabled')
        }
        ensureValidId(id)

        if (!Number.isInteger(targetPriority) || targetPriority < 0) {
            throw new Error('Invalid target priority: must be an integer >= 0')
        }

        return (await this.db.transaction().execute(async (trx) => {
            const current = await trx
                .selectFrom(this.tableName as string)
                .select(['id', 'priority'])
                .where('id', '=', id)
                .executeTakeFirst()

            if (!current) throw new Error(`Row not found for id=${id}`)

            const currentPriority = Number(current.priority)
            if (currentPriority === targetPriority) {
                return (await trx
                    .selectFrom(this.tableName as string)
                    .selectAll()
                    .where('id', '=', id)
                    .executeTakeFirstOrThrow()) as Selectable<DST[TableName]>
            }

            if (currentPriority < targetPriority) {
                await (trx.updateTable(this.tableName as string) as any)
                    .set({priority: sql`priority - 1`} as unknown as Updateable<DST[TableName]>)
                    .where('priority', '>', currentPriority)
                    .where('priority', '<=', targetPriority)
                    .execute()
            } else {
                await (trx.updateTable(this.tableName as string) as any)
                    .set({priority: sql`priority + 1`} as unknown as Updateable<DST[TableName]>)
                    .where('priority', '>=', targetPriority)
                    .where('priority', '<', currentPriority)
                    .execute()
            }

            const updated = await (trx.updateTable(this.tableName as string) as any)
                .set({priority: targetPriority} as unknown as Updateable<DST[TableName]>)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirstOrThrow()

            return updated as Selectable<DST[TableName]>
        })) as Selectable<DST[TableName]>
    }
}