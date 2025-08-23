jest.mock('cross-fetch', () => jest.fn());

import fetch from 'cross-fetch';
import AuthorisedTransporter from '@integrationlayer/AuthorisedTransporter';
import IRequestCache from '@integrationlayer/IRequestCache';
import ITokenStore from '@integrationlayer/ITokenStore';

const mockedFetch = fetch as unknown as jest.Mock;

class MemoryCache implements IRequestCache {
    private store = new Map<string, any>();
    async get<T>(key: string): Promise<T | null> {
        return this.store.get(key) ?? null;
    }
    async set<T>(key: string, value: T): Promise<void> {
        this.store.set(key, value);
    }
}

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
    test('uses Authorization header and caches GET', async () => {
        mockedFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({value: 1}),
        });
        const cache = new MemoryCache();
        const tokenStore = new StaticTokenStore('abc');
        const transporter = new AuthorisedTransporter({baseUrl: 'https://example.com/', tokenStore, requestCache: cache});
        const first = await transporter.get('data');
        const second = await transporter.get('data');
        expect(first).toEqual({value: 1});
        expect(second).toEqual({value: 1});
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        const headers = mockedFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer abc');
    });
});
