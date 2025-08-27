import {Generated, Insertable, sql, Updateable} from 'kysely'
import {ColumnType, TimestampDefault} from './entities'
import {addIdColumn, createdAtDefaultSql, toJsonContent, fromJsonContent} from './utilities'
import {BaseTable} from './BaseTable'

export enum TTL {
    ONE_HOUR = 3600,
    ONE_DAY = 86400,
    ONE_WEEK = 604800,
    ONE_MONTH = 2592000,
    ONE_YEAR = 31536000,
    NOT_EXPIRED = -1,
    EXPIRED = -2,
    UNLIMITED = 0,
}

export interface CacheEntry<T> {
    id: number
    key: string
    type: string
    content: T
    expired: boolean | number | null
    createdAt: Date
    [extra: string]: any
}

export abstract class AbstractCacheRepository<DST, TableName extends keyof DST & string> extends BaseTable<DST, TableName> {

    async ensureSchema(): Promise<void> {
        let createBuilder = this.db.schema.createTable(this.tableName).ifNotExists()
        createBuilder = addIdColumn(this.dialect, createBuilder)
        createBuilder = createBuilder.addColumn('key', 'varchar', (col) => col.notNull())
        createBuilder = createBuilder.addColumn(
            'content',
            this.sqlApi.toSQLType(ColumnType.JSON) as any,
            (col) => col.notNull(),
        )
        createBuilder = createBuilder.addColumn('type', 'varchar', (col) => col.notNull())
        createBuilder = createBuilder.addColumn(
            'expired',
            this.sqlApi.toSQLType(ColumnType.BOOLEAN) as any,
        )
        createBuilder = createBuilder.addColumn(
            'created_at',
            'timestamp',
            (col) => col.notNull().defaultTo(sql.raw(createdAtDefaultSql())),
        )

        createBuilder = this.applyExtraColumns(createBuilder)

        await createBuilder.execute()
    }

    async expireEntries(select: Record<string, any>, ttl: TTL): Promise<number> {
        if (ttl <= 0) throw new Error(`TTL ${ttl} is not supported for expiration`)
        this.ensureSelectNotEmpty(select)
        const qb = this.db
            .updateTable(this.tableName as string)
            .set({expired: this.expiredValue(true)} as unknown as Updateable<DST[TableName]>)

        const qbWithFilters = this.applyFilters(qb, select)
            .where(({eb, ref}: any) => eb(ref('created_at'), '>=', this.nowMinusSecondsExpr(ttl)))
            .where(this.notExpiredPredicate())

        const res = await qbWithFilters.executeTakeFirst()
        const n = (res as any)?.numUpdatedRows ?? 0n
        return Number(n)
    }

    async cleanExpiredEntries(select: Partial<CacheEntry<any>>): Promise<number> {
        this.ensureSelectNotEmpty(select)
        const qb = this.applyFilters(
            this.db.deleteFrom(this.tableName as string),
            select,
        ).where(this.expiredPredicate())

        const res = await qb.executeTakeFirst()
        const n = (res as any)?.numDeletedRows ?? 0n
        return Number(n)
    }

    async getLast<T>(select: Partial<CacheEntry<T>>, ttl?: TTL): Promise<T | null> {
        this.ensureSelectNotEmpty(select)

        let qb = this.applyFilters(
            this.db.selectFrom(this.tableName as string).select(['content']),
            select,
        )

        qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(1)

        const row = await qb.executeTakeFirst()
        if (!row) return null
        const val = (row as any).content
        return this.decodeJson<T>(val)
    }

    async getAll<T>(select: Partial<CacheEntry<T>>, ttl?: TTL): Promise<CacheEntry<T>[]> {
        this.ensureSelectNotEmpty(select)

        const extra = this.extraColumns().map((c) => c.name)
        const columns = ['id', 'key', 'content', 'type', 'expired', 'created_at', ...extra]

        let qb = this.applyFilters(
            this.db.selectFrom(this.tableName as string).select(columns as any),
            select,
        )

        qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')

        const rows = await qb.execute()
        const extras = new Map(this.extraColumns().map((c) => [c.name, c]))
        return rows.map((r: any) => {
            const out: any = {
                id: r.id,
                key: r.key,
                type: r.type,
                content: this.decodeJson<T>(r.content),
                expired: r.expired,
                createdAt: this.asDate(r.created_at),
            }
            for (const [name, spec] of extras) {
                let val = r[name]
                if (spec.type === ColumnType.JSON) val = this.decodeJson<any>(val)
                out[name] = val
            }
            return out as CacheEntry<T>
        })
    }

    // check if entry exists with a given select without retrieving
    async isCached<T>(select: Partial<CacheEntry<T>>, ttl?: TTL): Promise<boolean> {
        this.ensureSelectNotEmpty(select)

        let qb = this.applyFilters(
            this.db.selectFrom(this.tableName as string).select('id'),
            select,
        )

        qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED).limit(1)

        const row = await qb.executeTakeFirst()
        return !!row
    }

    async getLastOfType<T>(type: string, ttl?: TTL): Promise<T | null> {
        return this.getLast<T>({type}, ttl)
    }

    async save<T>(record: { key: string; type: string; [key: string]: any }, content: T): Promise<boolean> {
        if (content === undefined || content === null) return false

        const extraMap = new Map(this.extraColumns().map((c) => [c.name, c]))
        const values: any = {
            key: record.key,
            type: record.type,
            content: this.encodeJson(content),
            created_at: sql`CURRENT_TIMESTAMP`,
            expired: this.expiredValue(false),
        }
        for (const [k, v] of Object.entries(record)) {
            if (k === 'key' || k === 'type') continue
            const spec = extraMap.get(k)
            let val = v
            if (spec?.type === ColumnType.JSON) {
                val = this.encodeJsonOrNull(v)
            }
            values[k] = val as any
        }

        try {
            await this.db
                .insertInto(this.tableName as string)
                .values(values as Insertable<DST[TableName]>)
                .returning(['id'])
                .executeTakeFirst()
            return true
        } catch {
            try {
                await this.db
                    .insertInto(this.tableName as string)
                    .values(values as Insertable<DST[TableName]>)
                    .executeTakeFirst()
                return true
            } catch (e2) {
                console.error('Error in save:', e2)
                return false
            }
        }
    }

    protected ensureSelectNotEmpty(select: Partial<CacheEntry<any>>) {
        if (!select || Object.values(select).every((v) => v === undefined)) {
            throw new Error('No values provided for where clause')
        }
    }

    protected applyFilters<T extends { where: any }>(qb: T, select: Partial<CacheEntry<any>>): T {
        let out: any = qb
        for (const [k, v] of Object.entries(select)) {
            if (v !== undefined) out = out.where(k, '=', v)
        }
        return out
    }

    protected applyTtlFilters<T extends { where: any }>(qb: T, ttl: TTL): T {
        let out: any = qb
        switch (ttl) {
            case TTL.NOT_EXPIRED:
                out = out.where(this.notExpiredPredicate())
                break
            case TTL.EXPIRED:
                out = out.where(this.expiredPredicate())
                break
            case TTL.UNLIMITED:
                break
            default:
                out = out
                    .where(({eb, ref}: any) => eb(ref('created_at'), '>=', this.nowMinusSecondsExpr(ttl)))
                    .where(this.notExpiredPredicate())
                break
        }
        return out
    }

    protected notExpiredPredicate() {
        return this.dialect === 'postgres'
            ? sql<boolean>`expired IS NOT TRUE`
            : sql<boolean>`COALESCE(expired, 0) = 0`
    }

    protected expiredPredicate() {
        return this.dialect === 'postgres'
            ? sql<boolean>`expired IS TRUE`
            : sql<boolean>`expired = 1`
    }

    protected expiredValue(val: boolean) {
        return this.dialect === 'postgres' ? val : val ? 1 : 0
    }

    protected nowMinusSecondsExpr(ttlSeconds: number) {
        if (this.dialect === 'postgres') {
            return sql<Date>`now() - make_interval(secs =>
            ${ttlSeconds}
            )`
        }
        return sql<string>`datetime('now', '-' ||
        ${ttlSeconds}
        ||
        ' seconds'
        )`
    }

    protected asDate(dt: string | Date): Date {
        return dt instanceof Date ? dt : new Date(dt)
    }

    protected encodeJson(value: unknown): unknown {
        const json = toJsonContent(value)
        return this.dialect === 'sqlite' ? JSON.stringify(json) : json
    }

    protected encodeJsonOrNull(value: unknown | null | undefined): unknown | null {
        return value == null ? null : this.encodeJson(value)
    }

    protected decodeJson<T>(value: unknown): T {
        if (value == null) return value as T
        const raw = this.dialect === 'sqlite' && typeof value === 'string' ? JSON.parse(value) : value
        return fromJsonContent(raw) as T
    }
}

export interface CacheBaseTable {
    id: Generated<number>
    key: string
    type: string
    content: unknown
    expired: boolean | number | null
    created_at: TimestampDefault
}