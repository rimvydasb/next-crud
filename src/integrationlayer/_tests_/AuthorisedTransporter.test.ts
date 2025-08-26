jest.mock('cross-fetch', () => jest.fn());

import fetch from 'cross-fetch';
import AuthorisedTransporter from '@integrationlayer/AuthorisedTransporter';
import AuthorisedCachedTransporter from '@integrationlayer/AuthorisedCachedTransporter';
import ITokenStore from '@integrationlayer/ITokenStore';
import RequestDataRepository, {createTestDb} from '@datalayer/_tests_/testUtils';

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
});

