import {Insertable, Kysely, Updateable, sql} from 'kysely'
import {AbstractTable} from './AbstractTable'
import {ColumnSpec, ColumnType, DatabaseSchema, SupportedDialect} from './entities'
import {ISQLApi} from './sqlapi/ISQLApi'

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

export interface CacheEntryKey {
  type: string
}

export interface CacheEntry<T> extends CacheEntryKey {
  id: number
  data: T
  createdAt: Date
  expired: boolean | number | null
}

export abstract class AbstractCacheTable<
  TableName extends keyof DatabaseSchema
> extends AbstractTable<TableName> {
  constructor(
    database: Kysely<DatabaseSchema>,
    tableName: TableName,
    dialect: SupportedDialect,
    sqlApi: ISQLApi,
  ) {
    super(database, tableName, dialect, sqlApi)
  }

  protected extraColumns(): ColumnSpec[] {
    return [
      {name: 'type', type: ColumnType.TEXT, notNull: true},
      {name: 'data', type: ColumnType.JSON, notNull: true},
      {name: 'expired', type: ColumnType.BOOLEAN},
    ]
  }

  async expireEntries(select: Partial<CacheEntryKey>, ttl: TTL): Promise<number> {
    if (ttl <= 0) throw new Error(`TTL ${ttl} is not supported for expiration`)
    this.ensureSelectNotEmpty(select)
    const qb = this.db
      .updateTable(this.tableName as string)
      .set({expired: this.expiredValue(true)} as unknown as Updateable<DatabaseSchema[TableName]>)

    const qbWithFilters = this.applyKeyFilters(qb, select)
      .where(({eb, ref}: any) => eb(ref('created_at'), '>=', this.nowMinusSecondsExpr(ttl)))
      .where(this.notExpiredPredicate())

    const res = await qbWithFilters.executeTakeFirst()
    const n = (res as any)?.numUpdatedRows ?? 0n
    return Number(n)
  }

  async cleanExpiredEntries(select: Partial<CacheEntryKey>): Promise<number> {
    this.ensureSelectNotEmpty(select)
    const qb = this.applyKeyFilters(
      this.db.deleteFrom(this.tableName as string),
      select,
    ).where(this.expiredPredicate())

    const res = await qb.executeTakeFirst()
    const n = (res as any)?.numDeletedRows ?? 0n
    return Number(n)
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
    const val = (row as any).data
    return this.decodeJson<T>(val)
  }

  async getAll<T>(select: Partial<CacheEntryKey>, ttl?: TTL): Promise<CacheEntry<T>[]> {
    this.ensureSelectNotEmpty(select)

    let qb = this.applyKeyFilters(
      this.db
        .selectFrom(this.tableName as string)
        .select(['id', 'data', 'created_at', 'type', 'expired']),
      select,
    )

    qb = this.applyTtlFilters(qb, ttl ?? TTL.NOT_EXPIRED)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')

    const rows = await qb.execute()
    return rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      data: this.decodeJson<T>(r.data),
      expired: r.expired,
      createdAt: this.asDate(r.created_at),
    }))
  }

  async save<T>(key: CacheEntryKey, data: T): Promise<boolean> {
    if (data === undefined || data === null) return false

    const values = {
      type: key.type,
      data: this.encodeJson(data),
      created_at: sql`CURRENT_TIMESTAMP`,
      expired: this.expiredValue(false),
    }

    try {
      await this.db
        .insertInto(this.tableName as string)
        .values(values as Insertable<DatabaseSchema[TableName]>)
        .returning(['id'])
        .executeTakeFirst()
      return true
    } catch {
      try {
        await this.db
          .insertInto(this.tableName as string)
          .values(values as Insertable<DatabaseSchema[TableName]>)
          .executeTakeFirst()
        return true
      } catch (e2) {
        console.error('Error in save:', e2)
        return false
      }
    }
  }

  protected ensureSelectNotEmpty(select: Partial<CacheEntryKey>) {
    if (!select || Object.values(select).every(v => v === undefined)) {
      throw new Error('No values provided for where clause')
    }
  }

  protected applyKeyFilters<T extends { where: any }>(qb: T, select: Partial<CacheEntryKey>): T {
    let out: any = qb
    if (select.type !== undefined) out = out.where('type', '=', select.type)
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
      return sql<Date>`now() - make_interval(secs => ${ttlSeconds})`
    }
    return sql<string>`datetime('now', '-' || ${ttlSeconds} || ' seconds')`
  }

  protected asDate(dt: string | Date): Date {
    return dt instanceof Date ? dt : new Date(dt)
  }

  protected encodeJson(value: unknown): unknown {
    return this.dialect === 'postgres' ? value : JSON.stringify(value)
  }

  protected encodeJsonOrNull(value: unknown | null | undefined): unknown | null {
    if (value == null) return null
    return this.encodeJson(value)
  }

  protected decodeJson<T>(value: unknown): T {
    if (value == null) return value as T
    if (this.dialect === 'postgres') return value as T
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch {
        /* pass */
      }
    }
    return value as T
  }
}

