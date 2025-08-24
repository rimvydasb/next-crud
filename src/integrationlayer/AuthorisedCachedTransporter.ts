import {CacheEntry, TTL} from '@datalayer/AbstractCacheRepository';
import IRequestCache from './IRequestCache';
import AuthorisedTransporter from './AuthorisedTransporter';
import ITokenStore from "@integrationlayer/ITokenStore";

/**
 * Transporter that adds caching capabilities to {@link AuthorisedTransporter}.
 *
 * A cache implementation must be provided and GET responses are cached using a
 * composite {@link CacheEntry} key.
 */
export default class AuthorisedCachedTransporter extends AuthorisedTransporter {
    protected readonly requestCache: IRequestCache;

    constructor(baseUrl: string, requestCache: IRequestCache, tokenStore?: ITokenStore) {
        super(baseUrl, tokenStore);
        this.requestCache = requestCache;
    }

    /**
     * Execute a GET request and cache the response using the configured cache.
     * If response is already
     */
    public async getWithCache<T>(
        urlPart: string,
        type: string,
        ttl: TTL = TTL.UNLIMITED,
        cacheKeyParts?: Partial<CacheEntry<any>>,
    ): Promise<T> {
        const cacheKey = {key: urlPart, type, ...cacheKeyParts};
        const cached = await this.requestCache.getLast<T>(cacheKey, ttl);
        if (cached !== null) return cached;
        const result = await this.get<T>(urlPart);
        await this.requestCache.save(cacheKey, result);
        return result;
    }

    /**
     * Retrieve a cached entry without making a network request.
     * Returns null when not found or expired.
     */
    public async getFromCache<T>(
        urlPart: string,
        type: string,
        ttl: TTL = TTL.UNLIMITED,
        cacheKeyParts?: Partial<CacheEntry<any>>,
    ) {
        const cacheKey = {key: urlPart, type, ...cacheKeyParts};
        return this.requestCache.getLast<T>(cacheKey, ttl);
    }
}

