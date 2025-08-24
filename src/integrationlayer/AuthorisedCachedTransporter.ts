import {CacheEntry, TTL} from '@datalayer/AbstractCacheRepository';
import IRequestCache from './IRequestCache';
import AuthorisedTransporter, {TransporterOptions} from './AuthorisedTransporter';

/**
 * Transporter that adds caching capabilities to {@link AuthorisedTransporter}.
 *
 * A cache implementation must be provided and GET responses are cached using a
 * composite {@link CacheEntry} key.
 */
export default class AuthorisedCachedTransporter extends AuthorisedTransporter {
    protected readonly requestCache: IRequestCache;

    constructor(options: TransporterOptions & {requestCache: IRequestCache}) {
        super(options);
        if (!options.requestCache) {
            throw new Error('requestCache is required for AuthorisedCachedTransporter');
        }
        this.requestCache = options.requestCache;
    }

    /**
     * Execute a GET request and cache the response using the configured cache.
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
}

