import {Kysely, sql} from 'kysely'
import {AbstractCacheTable, TTL} from "@datalayer/AbstractCacheTable";
import {ColumnSpec, ColumnType, DatabaseSchema} from "@datalayer/entities";

export interface CacheEntryKey {
    requestUrl: string
    type: string
    reference?: string
}

export interface CacheEntry<T> extends CacheEntryKey {
    id: number
    data: T
    metadata: any
    createdAt: Date
    expired: boolean | number | null
}

export default class RequestDataRepository extends AbstractCacheTable<DatabaseSchema, 'request_data_cache'> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, {tableName: 'request_data_cache', softDelete: true, hasPriority: true})
    }

    private priorityCounter = 0

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'request_url', type: ColumnType.STRING, notNull: true},
            {name: 'reference', type: ColumnType.STRING},
            {name: 'metadata', type: ColumnType.JSON},
            ...super.extraColumns(),
        ]
    }

    protected applyKeyFilters<T extends { where: any }>(qb: T, select: Partial<CacheEntryKey>): T {
        let out: any = qb
        if (select.requestUrl !== undefined) out = out.where('request_url', '=', select.requestUrl)
        if (select.type !== undefined) out = out.where('type', '=', select.type)
        if (select.reference !== undefined) out = out.where('reference', '=', select.reference)
        return out
    }

    async get<T>(select: Partial<CacheEntryKey>, ttl?: TTL): Promise<T | null> {
        this.ensureSelectNotEmpty(select)
        let qb = this.applyKeyFilters(
            this.db.selectFrom(this.tableName as string).select(['data']),
            select,
        )
        qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
        const row = await qb.executeTakeFirst()
        if (!row) return null
        return this.decodeJson<T>((row as any).data)
    }

    async getAll<T>(select: Partial<CacheEntryKey>, ttl?: TTL): Promise<CacheEntry<T>[]> {
        this.ensureSelectNotEmpty(select)
        let qb = this.applyKeyFilters(
            this.db
                .selectFrom(this.tableName as string)
                .select(['id', 'data', 'metadata', 'created_at', 'request_url', 'reference', 'type', 'expired']),
            select,
        )
        qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
        const rows = await qb.execute()
        return rows.map((r: any) => ({
            id: r.id,
            requestUrl: r.request_url,
            reference: r.reference ?? undefined,
            type: r.type,
            data: this.decodeJson<T>(r.data),
            metadata: this.decodeJson<any>(r.metadata),
            createdAt: this.asDate(r.created_at),
            expired: r.expired,
        }))
    }

    async save<T>(key: CacheEntryKey, data: T, metadata: object = {}): Promise<boolean> {
        if (data === undefined || data === null) return false
        const values = {
            request_url: key.requestUrl,
            reference: key.reference ?? null,
            type: key.type,
            data: this.encodeJson(data),
            metadata: this.encodeJsonOrNull(metadata),
            created_at: sql`CURRENT_TIMESTAMP`,
            expired: this.expiredValue(false),
            priority: this.priorityCounter++,
        }
        try {
            await this.db
                .insertInto(this.tableName as string)
                .values(values as any)
                .returning(['id'])
                .executeTakeFirst()
            return true
        } catch {
            try {
                await this.db
                    .insertInto(this.tableName as string)
                    .values(values as any)
                    .executeTakeFirst()
                return true
            } catch (e2) {
                console.error('Error in save:', e2)
                return false
            }
        }
    }

    async expireEntries(select: Partial<CacheEntryKey>, ttl: TTL): Promise<number> {
        // Cast is safe: base implementation will ignore extra fields via applyKeyFilters override
        return super.expireEntries(select as any, ttl)
    }

    async cleanExpiredEntries(select: Partial<CacheEntryKey>): Promise<number> {
        return super.cleanExpiredEntries(select as any)
    }
}

export {TTL}
