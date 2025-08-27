import {Kysely, sql} from 'kysely';
import RequestDataRepository, {createTestDb, DatabaseSchema} from "@datalayer/_tests_/testUtils";
import {CacheEntry, TTL} from "@datalayer/AbstractCacheRepository";

describe('DatabaseRequestDataCache', () => {
    let db: Kysely<DatabaseSchema>
    let cache: RequestDataRepository
    let dialect: string
    const past = (seconds: number) =>
        dialect === 'postgres'
            ? sql`now() - make_interval(secs => ${seconds})`
            : sql`datetime('now', '-' || ${seconds} || ' seconds')`

    const sampleKey = {
        key: 'https://api.example.com/data',
        type: 'sampleType',
        reference: 'ref123',
    }
    const sampleData = {foo: 'bar'}
    const sampleMeta = {m: 1}

    beforeEach(async () => {
        db = await createTestDb()
        cache = new RequestDataRepository(db)
        await cache.ensureSchema()
        dialect = (cache as any).dialect
    })

    afterEach(async () => {
        await db.destroy()
    })

    it('save() should insert and return true', async () => {
        const ok = await cache.save({...sampleKey, metadata: sampleMeta}, sampleData)
        expect(ok).toBe(true)
        const rows = await db
            .selectFrom('request_data_cache')
            .select(['key', 'type', 'reference', 'content', 'metadata'])
            .execute()
        expect(rows).toHaveLength(1)
        const row = rows[0] as any
        expect(row.key).toBe(sampleKey.key)
        expect(row.type).toBe(sampleKey.type)
        expect(row.reference).toBe(sampleKey.reference)
        if (dialect === 'postgres') {
            expect(row.content).toEqual(sampleData)
            expect(row.metadata).toEqual(sampleMeta)
        } else {
            expect(JSON.parse(row.content)).toEqual(sampleData)
            expect(JSON.parse(row.metadata)).toEqual(sampleMeta)
        }
    })

    it('save() should insert array', async () => {
        const ok = await cache.save(sampleKey, [1, 2, 3])
        expect(ok).toBe(true);
        const rows = await cache.getAll({
            type: 'sampleType',
        })
        expect(rows).toHaveLength(1)
        const row = rows[0] as any
        expect(row.content).toEqual([1, 2, 3]);
    });

    it('save() should insert number', async () => {
        const ok = await cache.save(sampleKey, 42)
        expect(ok).toBe(true)
        const rows = await cache.getAll({
            type: 'sampleType',
        })
        expect(rows).toHaveLength(1)
        const row = rows[0] as any
        expect(row.content).toBe(42)
    })

    it('save() should insert string', async () => {
        const ok = await cache.save(sampleKey, 'hello')
        expect(ok).toBe(true)
        const rows = await cache.getAll({
            type: 'sampleType',
        })
        expect(rows).toHaveLength(1)
        const row = rows[0] as any
        expect(row.content).toBe('hello')
    })

    it('getLast() should return null when no entry exists', async () => {
        const result = await cache.getLast(sampleKey)
        expect(result).toBeNull()
    })

    it('getLast() and getAll() should retrieve saved entry', async () => {
        await cache.save({...sampleKey, metadata: sampleMeta}, sampleData)
        const got = await cache.getLast<typeof sampleData>(sampleKey)
        expect(got).toEqual(sampleData)
        const all = await cache.getAll<typeof sampleData>(sampleKey)
        expect(all.length).toBe(1)
        const entry: CacheEntry<typeof sampleData> = all[0]
        expect(entry.key).toBe(sampleKey.key)
        expect(entry.type).toBe(sampleKey.type)
        expect(entry.reference).toBe(sampleKey.reference)
        expect(entry.content).toEqual(sampleData)
        expect(entry.metadata).toEqual(sampleMeta)
        expect(entry.createdAt).toBeInstanceOf(Date)
    })

    it('getAll() with different TTL', async () => {
        await cache.save({key: 'url1', type: 'TRANSACT', reference: 'expired'}, {a: 1})
        await cache.save({key: 'url2', type: 'TRANSACT', reference: 'fine'}, {a: 1})
        await cache.save({key: 'url3', type: 'TRANSACT', reference: 'outdated'}, {a: 1})

        await db
            .updateTable('request_data_cache')
            .set({expired: dialect === 'postgres' ? true : 1})
            .where('reference', '=', 'expired')
            .execute()

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_HOUR * 2) as any
            })
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

    it('getLast() with TTL should skip old entries', async () => {
        await cache.save(sampleKey, {x: 1})
        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_HOUR * 2) as any
            })
            .execute()

        const noTtl = await cache.getLast(sampleKey)
        expect(noTtl).toEqual({x: 1})

        const withTtl = await cache.getLast(sampleKey, TTL.ONE_HOUR)
        expect(withTtl).toBeNull()
    })

    it('isCached() should check existence without retrieving', async () => {
        await cache.save(sampleKey, {x: 1})
        const exists = await cache.isCached(sampleKey)
        expect(exists).toBe(true)

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_HOUR * 2) as any
            })
            .execute()

        const existsTtl = await cache.isCached(sampleKey, TTL.ONE_HOUR)
        expect(existsTtl).toBe(false)
    })

    it('expireEntries() should mark matching rows expired', async () => {
        await cache.save(sampleKey, {a: 1})
        await cache.save({...sampleKey, reference: 'other'}, {b: 2})
        const before = await db.selectFrom('request_data_cache').select(['expired']).execute()
        expect(before.every((r: any) => !r.expired)).toBe(true)

        const affected = await cache.expireEntries({
            key: sampleKey.key,
            type: sampleKey.type
        }, TTL.ONE_DAY)
        expect(affected).toBe(2)

        const res = await db.selectFrom('request_data_cache').select(['reference', 'expired']).execute()
        const map = new Map(res.map((r: any) => [r.reference, r.expired]))
        expect(map.get(sampleKey.reference)).toBeTruthy()
        expect(map.get('other')).toBeTruthy()
    })

    it('cleanExpiredEntries() should delete only expired rows', async () => {
        await cache.save({...sampleKey, metadata: sampleMeta}, sampleData)
        await cache.save({...sampleKey, reference: 'expired-ref', metadata: sampleMeta}, sampleData)
        await db
            .updateTable('request_data_cache')
            .set({expired: dialect === 'postgres' ? true : 1})
            .where('reference', '=', 'expired-ref')
            .execute()

        const before = await db.selectFrom('request_data_cache').select(['reference']).execute()
        expect(before.length).toBe(2)

        const del = await cache.cleanExpiredEntries({key: sampleKey.key, type: sampleKey.type})
        expect(del).toBe(1)

        const after = await db.selectFrom('request_data_cache').select(['reference']).execute()
        expect(after.length).toBe(1)
        expect(after[0].reference).toBe(sampleKey.reference)
    })

    it('main test', async () => {
        await cache.save({key: 'url1', type: 'TRANSACT', reference: 'ref1'}, {a: 1})
        await cache.save({key: 'url2', type: 'TRANSACT', reference: 'ref2'}, {b: 2})
        await cache.save({key: 'url3', type: 'TRANSACT', reference: 'ref3'}, {c: 3})

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_HOUR * 2) as any
            })
            .execute()

        {
            const record1 = await cache.getLast({key: 'url1'}, TTL.ONE_HOUR * 2 + 1)
            expect(record1).toEqual({a: 1})
            const record2 = await cache.getLast({key: 'url2'}, TTL.ONE_HOUR * 2 + 1)
            expect(record2).toEqual({b: 2})
        }

        {
            const record1 = await cache.getLast({key: 'url1'}, TTL.ONE_HOUR)
            expect(record1).toBeNull()
        }

        {
            let record1 = await cache.getLast({key: 'url1', type: 'type1', reference: 'ref1'}, TTL.ONE_MONTH)
            expect(record1).toBeNull()
            record1 = await cache.getLast({key: 'url1', type: 'TRANSACT', reference: 'ref1'}, TTL.ONE_MONTH)
            expect(record1).toEqual({a: 1})
            record1 = await cache.getLastOfType('TRANSACT', TTL.ONE_MONTH)
            expect(record1).toEqual({c: 3})
        }

        {
            const all = await cache.getAll({type: 'TRANSACT'}, TTL.ONE_MONTH)
            expect(all.length).toBe(3)
            expect(all[0].content).toStrictEqual({c: 3})
            expect(all[1].content).toStrictEqual({b: 2})
            expect(all[2].content).toStrictEqual({a: 1})
        }
    })

    it('getAll returns the most recent first', async () => {
        await cache.save({key: 'url1', type: 'TRANSACT', reference: 'ref1'}, {a: 1})
        await cache.save({key: 'url2', type: 'TRANSACT', reference: 'ref2'}, {b: 2})
        await cache.save({key: 'url3', type: 'TRANSACT', reference: 'ref3'}, {c: 3})
        await cache.save({key: 'url4', type: 'TRANSACT', reference: 'ref4'}, {d: 4})

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_HOUR) as any
            })
            .where('reference', '=', 'ref1')
            .execute()

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_DAY) as any
            })
            .where('reference', '=', 'ref2')
            .execute()

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_YEAR) as any
            })
            .where('reference', '=', 'ref3')
            .execute()

        await db
            .updateTable('request_data_cache')
            .set({
                created_at: past(TTL.ONE_WEEK) as any
            })
            .where('reference', '=', 'ref4')
            .execute()

        const all = await cache.getAll({type: 'TRANSACT'}, TTL.UNLIMITED)
        expect(all.length).toBe(4)
        expect(all[0].content).toStrictEqual({a: 1})
        expect(all[1].content).toStrictEqual({b: 2})
        expect(all[2].content).toStrictEqual({d: 4})
        expect(all[3].content).toStrictEqual({c: 3})

        const one = await cache.getLastOfType('TRANSACT', TTL.UNLIMITED)
        expect(one).toStrictEqual({a: 1})
    })
})
