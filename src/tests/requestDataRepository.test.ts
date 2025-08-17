import {Kysely, SqliteDialect, sql} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import RequestDataRepository, {CacheEntry, CacheEntryKey, TTL} from './RequestDataRepository'
import {DatabaseSchema} from '../lib/entities'
import {SQLiteApi} from '../lib/sqlapi/SQLiteApi'

describe('DatabaseRequestDataCache', () => {
  let db: Kysely<DatabaseSchema>
  let cache: RequestDataRepository

  const sampleKey: CacheEntryKey = {
    requestUrl: 'https://api.example.com/data',
    type: 'sampleType',
    reference: 'ref123',
  }
  const sampleData = {foo: 'bar'}
  const sampleMeta = {m: 1}

  beforeEach(async () => {
    const sqlite = new BetterSqlite3(':memory:')
    db = new Kysely<DatabaseSchema>({dialect: new SqliteDialect({database: sqlite})})
    cache = new RequestDataRepository(db, 'sqlite', new SQLiteApi())
    await cache.ensureSchema()
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('save() should insert and return true', async () => {
    const ok = await cache.save(sampleKey, sampleData, sampleMeta)
    expect(ok).toBe(true)
    const rows = await db
      .selectFrom('request_data_cache')
      .select(['request_url', 'type', 'reference', 'data', 'metadata'])
      .execute()
    expect(rows).toHaveLength(1)
    const row = rows[0] as any
    expect(row.request_url).toBe(sampleKey.requestUrl)
    expect(row.type).toBe(sampleKey.type)
    expect(row.reference).toBe(sampleKey.reference)
    expect(JSON.parse(row.data)).toEqual(sampleData)
    expect(JSON.parse(row.metadata)).toEqual(sampleMeta)
  })

  it('get() should return null when no entry exists', async () => {
    const result = await cache.get(sampleKey)
    expect(result).toBeNull()
  })

  it('get() and getAll() should retrieve saved entry', async () => {
    await cache.save(sampleKey, sampleData, sampleMeta)
    const got = await cache.get<typeof sampleData>(sampleKey)
    expect(got).toEqual(sampleData)
    const all = await cache.getAll<typeof sampleData>(sampleKey)
    expect(all.length).toBe(1)
    const entry: CacheEntry<typeof sampleData> = all[0]
    expect(entry.requestUrl).toBe(sampleKey.requestUrl)
    expect(entry.type).toBe(sampleKey.type)
    expect(entry.reference).toBe(sampleKey.reference)
    expect(entry.data).toEqual(sampleData)
    expect(entry.metadata).toEqual(sampleMeta)
    expect(entry.createdAt).toBeInstanceOf(Date)
  })

  it('getAll() with different TTL', async () => {
    await cache.save({requestUrl: 'url1', type: 'TRANSACT', reference: 'expired'}, {a: 1}, {})
    await cache.save({requestUrl: 'url2', type: 'TRANSACT', reference: 'fine'}, {a: 1}, {})
    await cache.save({requestUrl: 'url3', type: 'TRANSACT', reference: 'outdated'}, {a: 1}, {})

    await db
      .updateTable('request_data_cache')
      .set({expired: 1})
      .where('reference', '=', 'expired')
      .execute()

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_HOUR * 2} || ' seconds')`})
      .where('reference', '=', 'outdated')
      .execute()

    {
      const oneHour = await cache.getAll({type: 'TRANSACT'}, TTL.ONE_HOUR)
      expect(oneHour.length).toBe(1)

      const all = await cache.getAll({type: 'TRANSACT'}, TTL.UNLIMITED)
      expect(all.length).toBe(3)

      const expired = await cache.getAll({type: 'TRANSACT'}, TTL.EXPIRED)
      expect(expired.length).toBe(1)

      const notExpired = await cache.getAll({type: 'TRANSACT'}, TTL.NOT_EXPIRED)
      expect(notExpired.length).toBe(2)
    }

    await cache.expireEntries({type: 'TRANSACT'}, TTL.ONE_YEAR)

    {
      const oneHour = await cache.getAll({type: 'TRANSACT'}, TTL.ONE_HOUR)
      expect(oneHour.length).toBe(0)

      const all = await cache.getAll({type: 'TRANSACT'}, TTL.UNLIMITED)
      expect(all.length).toBe(3)

      const expired = await cache.getAll({type: 'TRANSACT'}, TTL.EXPIRED)
      expect(expired.length).toBe(3)

      const notExpired = await cache.getAll({type: 'TRANSACT'}, TTL.NOT_EXPIRED)
      expect(notExpired.length).toBe(0)
    }
  })

  it('get() with TTL should skip old entries', async () => {
    await cache.save(sampleKey, {x: 1}, {})
    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_HOUR * 2} || ' seconds')`})
      .execute()

    const noTtl = await cache.get(sampleKey)
    expect(noTtl).toEqual({x: 1})

    const withTtl = await cache.get(sampleKey, TTL.ONE_HOUR)
    expect(withTtl).toBeNull()
  })

  it('expireEntries() should mark matching rows expired', async () => {
    await cache.save(sampleKey, {a: 1}, {})
    await cache.save({...sampleKey, reference: 'other'}, {b: 2}, {})
    const before = await db.selectFrom('request_data_cache').select(['expired']).execute()
    expect(before.every(r => r.expired === 0)).toBe(true)

    const affected = await cache.expireEntries({requestUrl: sampleKey.requestUrl, type: sampleKey.type}, TTL.ONE_DAY)
    expect(affected).toBe(2)

    const res = await db.selectFrom('request_data_cache').select(['reference', 'expired']).execute()
    const map = new Map(res.map((r: any) => [r.reference, r.expired]))
    expect(map.get(sampleKey.reference)).toBe(1)
    expect(map.get('other')).toBe(1)
  })

  it('cleanExpiredEntries() should delete only expired rows', async () => {
    await cache.save(sampleKey, sampleData, sampleMeta)
    await cache.save({...sampleKey, reference: 'expired-ref'}, sampleData, sampleMeta)
    await db.updateTable('request_data_cache').set({expired: 1}).where('reference', '=', 'expired-ref').execute()

    const before = await db.selectFrom('request_data_cache').select(['reference']).execute()
    expect(before.length).toBe(2)

    const del = await cache.cleanExpiredEntries({requestUrl: sampleKey.requestUrl, type: sampleKey.type})
    expect(del).toBe(1)

    const after = await db.selectFrom('request_data_cache').select(['reference']).execute()
    expect(after.length).toBe(1)
    expect(after[0].reference).toBe(sampleKey.reference)
  })

  it('main test', async () => {
    await cache.save({requestUrl: 'url1', type: 'TRANSACT', reference: 'ref1'}, {a: 1}, {})
    await cache.save({requestUrl: 'url2', type: 'TRANSACT', reference: 'ref2'}, {b: 2}, {})
    await cache.save({requestUrl: 'url3', type: 'TRANSACT', reference: 'ref3'}, {c: 3}, {})

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_HOUR * 2} || ' seconds')`})
      .execute()

    {
      const record1 = await cache.get({requestUrl: 'url1'}, TTL.ONE_HOUR * 2 + 1)
      expect(record1).toEqual({a: 1})
      const record2 = await cache.get({requestUrl: 'url2'}, TTL.ONE_HOUR * 2 + 1)
      expect(record2).toEqual({b: 2})
    }

    {
      const record1 = await cache.get({requestUrl: 'url1'}, TTL.ONE_HOUR)
      expect(record1).toBeNull()
    }

    {
      let record1 = await cache.get({requestUrl: 'url1', type: 'type1', reference: 'ref1'}, TTL.ONE_MONTH)
      expect(record1).toBeNull()
      record1 = await cache.get({requestUrl: 'url1', type: 'TRANSACT', reference: 'ref1'}, TTL.ONE_MONTH)
      expect(record1).toEqual({a: 1})
      record1 = await cache.get({type: 'TRANSACT'}, TTL.ONE_MONTH)
      expect(record1).toEqual({c: 3})
    }

    {
      const all = await cache.getAll({type: 'TRANSACT'}, TTL.ONE_MONTH)
      expect(all.length).toBe(3)
      expect(all[0].data).toStrictEqual({c: 3})
      expect(all[1].data).toStrictEqual({b: 2})
      expect(all[2].data).toStrictEqual({a: 1})
    }
  })

  it('getAll returns the most recent first', async () => {
    await cache.save({requestUrl: 'url1', type: 'TRANSACT', reference: 'ref1'}, {a: 1}, {})
    await cache.save({requestUrl: 'url2', type: 'TRANSACT', reference: 'ref2'}, {b: 2}, {})
    await cache.save({requestUrl: 'url3', type: 'TRANSACT', reference: 'ref3'}, {c: 3}, {})
    await cache.save({requestUrl: 'url4', type: 'TRANSACT', reference: 'ref4'}, {d: 4}, {})

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_HOUR} || ' seconds')`})
      .where('reference', '=', 'ref1')
      .execute()

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_DAY} || ' seconds')`})
      .where('reference', '=', 'ref2')
      .execute()

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_YEAR} || ' seconds')`})
      .where('reference', '=', 'ref3')
      .execute()

    await db
      .updateTable('request_data_cache')
      .set({created_at: sql`datetime('now', '-' || ${TTL.ONE_WEEK} || ' seconds')`})
      .where('reference', '=', 'ref4')
      .execute()

    const all = await cache.getAll({type: 'TRANSACT'}, TTL.UNLIMITED)
    expect(all.length).toBe(4)
    expect(all[0].data).toStrictEqual({a: 1})
    expect(all[1].data).toStrictEqual({b: 2})
    expect(all[2].data).toStrictEqual({d: 4})
    expect(all[3].data).toStrictEqual({c: 3})

    const one = await cache.get({type: 'TRANSACT'}, TTL.UNLIMITED)
    expect(one).toStrictEqual({a: 1})
  })
})
