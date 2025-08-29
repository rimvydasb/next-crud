jest.mock('cross-fetch', () => jest.fn());

import fetch from 'cross-fetch';
import AuthorisedTransporter from '@integrationlayer/AuthorisedTransporter';
import AuthorisedCachedTransporter from '@integrationlayer/AuthorisedCachedTransporter';
import ITokenStore from '@integrationlayer/ITokenStore';
import RequestDataRepository, {createTestDb} from '@datalayer/_tests_/testUtils';
import {TTL} from '@datalayer/AbstractCacheRepository';

const mockedFetch = fetch as unknown as jest.Mock;

class StaticTokenStore implements ITokenStore {
    constructor(private token: string) {}
    async getToken(): Promise<string> {
        return this.token;
    }
    async refreshToken(): Promise<string> {
        return this.token;
    }
}

describe('AuthorisedTransporter', () => {
    beforeEach(() => mockedFetch.mockReset());

    test.each([
        ['get', 'GET'],
        ['post', 'POST', {a: 1}],
        ['patch', 'PATCH', {a: 1}],
        ['put', 'PUT', {a: 1}],
        ['delete', 'DELETE'],
    ])('uses Authorization header for %s', async (...args) => {
        const [method, verb, body] = args as [string, string, unknown?];
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const tokenStore = new StaticTokenStore('abc');
        const transporter = new AuthorisedTransporter('https://example.com/', tokenStore);
        const fn = (transporter as any)[method].bind(transporter);
        if (body !== undefined) await fn('data', body);
        else await fn('data');
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        const options = mockedFetch.mock.calls[0][1];
        expect(options.method).toBe(verb);
        expect(options.headers.Authorization).toBe('Bearer abc');
    });

    test('does not cache without IRequestCache', async () => {
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const tokenStore = new StaticTokenStore('abc');
        const transporter = new AuthorisedTransporter('https://example.com/', tokenStore);
        await transporter.get('data');
        await transporter.get('data');
        expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    test.each(['data', '/data', 'data/', '/data/'])(
        'concatenates baseUrl and %s correctly',
        async (part) => {
            mockedFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            });
            const transporter = new AuthorisedTransporter('https://example.com/');
            await transporter.get(part);
            expect(mockedFetch).toHaveBeenCalledWith('https://example.com/data', expect.any(Object));
        },
    );
});

describe('AuthorisedCachedTransporter', () => {
    beforeEach(() => mockedFetch.mockReset());

    test('caches GET responses via AbstractCacheRepository', async () => {
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const db = await createTestDb();
        const repo = new RequestDataRepository(db);
        await repo.ensureSchema();
        const transporter = new AuthorisedCachedTransporter('https://example.com/', repo);
        const first = await transporter.getWithCache('data', 'TEST');
        const second = await transporter.getWithCache('data', 'TEST');
        expect(first).toEqual({value: 1});
        expect(second).toEqual({value: 1});
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        await db.destroy();
    });

    test('normalises cache keys regardless of slashes', async () => {
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const db = await createTestDb();
        const repo = new RequestDataRepository(db);
        await repo.ensureSchema();
        const transporter = new AuthorisedCachedTransporter('https://example.com/', repo);
        await transporter.getWithCache('/data', 'TEST');
        await transporter.getWithCache('data/', 'TEST');
        await transporter.getWithCache('/data/', 'TEST');
        await transporter.getWithCache('data', 'TEST');
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        await db.destroy();
    });

    test('updateCache replaces cached entry on success', async () => {
        mockedFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const db = await createTestDb();
        const repo = new RequestDataRepository(db);
        await repo.ensureSchema();
        const transporter = new AuthorisedCachedTransporter('https://example.com/', repo);
        await transporter.getWithCache('data', 'TEST');

        mockedFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({value: 2}),
        });
        const updated = await transporter.updateCache('data', 'TEST');
        expect(updated).toEqual({value: 2});

        const fromCache = await transporter.getWithCache('data', 'TEST');
        expect(fromCache).toEqual({value: 2});
        expect(mockedFetch).toHaveBeenCalledTimes(2);

        const all = await repo.getAll({key: 'data', type: 'TEST'}, TTL.UNLIMITED);
        expect(all.length).toBe(2);
        const fresh = await repo.getAll({key: 'data', type: 'TEST'}, TTL.NOT_EXPIRED);
        expect(fresh.length).toBe(1);
        await db.destroy();
    });

    test('updateCache propagates errors and keeps previous cache', async () => {
        const db = await createTestDb();
        const repo = new RequestDataRepository(db);
        await repo.ensureSchema();
        await repo.create({key: 'data', type: 'TEST'}, {value: 1});
        const transporter = new AuthorisedCachedTransporter('https://example.com/', repo);

        mockedFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'ERR',
            text: async () => 'ERR',
        });
        await expect(transporter.updateCache('data', 'TEST')).rejects.toThrow(/500/);

        const cached = await transporter.getWithCache('data', 'TEST');
        expect(cached).toEqual({value: 1});
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        await db.destroy();
    });

    test('full cache workflow: getWithCache, updateCache, and cleanExpiredEntries', async () => {
        mockedFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({orders: [{id: 1, total: 10}]}),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({users: [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]}),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({orders: [{id: 1, total: 10}, {id: 2, total: 20}]}),
            });

        const db = await createTestDb();
        const repo = new RequestDataRepository(db);
        await repo.ensureSchema();
        const transporter = new AuthorisedCachedTransporter('https://example.com/', repo);

        const firstOrders = await transporter.getWithCache('orders', 'WORKFLOW');
        const secondOrders = await transporter.getWithCache('orders', 'WORKFLOW');
        expect(firstOrders).toEqual({orders: [{id: 1, total: 10}]});
        expect(secondOrders).toEqual({orders: [{id: 1, total: 10}]});
        expect(mockedFetch).toHaveBeenCalledTimes(1);

        const users = await transporter.updateCache('users', 'WORKFLOW');
        expect(users).toEqual({users: [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]});
        const refreshedOrders = await transporter.updateCache('orders', 'WORKFLOW');
        expect(refreshedOrders).toEqual({orders: [{id: 1, total: 10}, {id: 2, total: 20}]});

        const cachedOrders = await transporter.getWithCache('orders', 'WORKFLOW');
        expect(cachedOrders).toEqual({orders: [{id: 1, total: 10}, {id: 2, total: 20}]});
        expect(mockedFetch).toHaveBeenCalledTimes(3);

        const allBefore = await repo.getAll({type: 'WORKFLOW'}, TTL.UNLIMITED);
        expect(allBefore).toHaveLength(3);

        const removed = await repo.cleanExpiredEntries({type: 'WORKFLOW'});
        expect(removed).toBe(1);

        const allAfter = await repo.getAll({type: 'WORKFLOW'}, TTL.UNLIMITED);
        expect(allAfter).toHaveLength(2);
        const keys = allAfter.map((e) => e.key).sort();
        expect(keys).toEqual(['orders', 'users']);

        await db.destroy();
    });
});

