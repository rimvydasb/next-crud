import fetch from 'cross-fetch';
import ITokenStore from './ITokenStore';
import IRequestCache from './IRequestCache';

/** Options for {@link AuthorisedTransporter}. */
interface TransporterOptions {
    baseUrl: string;
    tokenStore?: ITokenStore;
    requestCache?: IRequestCache;
}

/**
 * Wrapper around `fetch` that injects a bearer token and caches GET
 * requests using the provided interfaces.
 */
export default class AuthorisedTransporter {
    private readonly baseUrl: string;
    private readonly tokenStore?: ITokenStore;
    private readonly requestCache?: IRequestCache;

    constructor({baseUrl, tokenStore, requestCache}: TransporterOptions) {
        if (!/^https?:\/\//.test(baseUrl)) {
            throw new Error('baseUrl must start with http:// or https://');
        }
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        this.tokenStore = tokenStore;
        this.requestCache = requestCache;
    }

    /**
     * Execute an HTTP request and cache GET responses when a cache is provided.
     */
    private async request<T>(method: string, urlPart: string, body?: unknown): Promise<T> {
        const url = new URL(urlPart, this.baseUrl).toString();
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        if (this.tokenStore) {
            const token = await this.tokenStore.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        if (method === 'GET' && this.requestCache) {
            const cached = await this.requestCache.get<T>(url);
            if (cached !== null) return cached;
        }

        const response = await fetch(url, {
            method,
            headers,
            ...(body !== undefined ? {body: JSON.stringify(body)} : {})
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Request failed: ${response.status} ${response.statusText}\n${text}`);
        }
        if (method === 'GET' && this.requestCache) {
            const json = await response.json();
            await this.requestCache.set(url, json);
            return json;
        }
        if (response.status === 204) {
            return undefined as unknown as T;
        }
        return response.json() as Promise<T>;
    }

    public get<T>(urlPart: string): Promise<T> {
        return this.request('GET', urlPart);
    }

    public post<T>(urlPart: string, body?: unknown): Promise<T> {
        return this.request('POST', urlPart, body);
    }

    public patch<T>(urlPart: string, body?: unknown): Promise<T> {
        return this.request('PATCH', urlPart, body);
    }

    public delete<T>(urlPart: string): Promise<T> {
        return this.request('DELETE', urlPart);
    }

    public put<T>(urlPart: string, body?: unknown): Promise<T> {
        return this.request('PUT', urlPart, body);
    }
}
