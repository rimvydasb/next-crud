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
        const transporter = new AuthorisedTransporter({baseUrl: 'https://example.com/', tokenStore});
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
        const transporter = new AuthorisedTransporter({baseUrl: 'https://example.com/', tokenStore});
        await transporter.get('data');
        await transporter.get('data');
        expect(mockedFetch).toHaveBeenCalledTimes(2);
    });
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
        const transporter = new AuthorisedCachedTransporter({baseUrl: 'https://example.com/', requestCache: repo});
        const first = await transporter.getWithCache('data', 'TEST');
        const second = await transporter.getWithCache('data', 'TEST');
        expect(first).toEqual({value: 1});
        expect(second).toEqual({value: 1});
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        await db.destroy();
    });
});

