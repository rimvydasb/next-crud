import fetch from 'cross-fetch';
import ITokenStore from './ITokenStore';

/**
 * Wrapper around `fetch` that injects a bearer token for each request.
 */
export default class AuthorisedTransporter {
    private readonly baseUrl: string;
    private readonly tokenStore?: ITokenStore;

    constructor(baseUrl: string, tokenStore?: ITokenStore) {
        if (!/^https?:\/\//.test(baseUrl)) {
            throw new Error('baseUrl must start with http:// or https://');
        }
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        this.tokenStore = tokenStore;
    }

    /**
     * Execute an HTTP request.
     */
    protected async request<T>(method: string, urlPart: string, body?: unknown): Promise<T> {
        const url = new URL(urlPart, this.baseUrl).toString();
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
        if (this.tokenStore) {
            const token = await this.tokenStore.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
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
        if (response.status === 204) {
            return undefined as unknown as T;
        }
        return await response.json();
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
